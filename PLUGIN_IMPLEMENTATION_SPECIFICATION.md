# プラグイン実装仕様書 (V3.0)

本ドキュメントは、BaseKit Core上に実装される個別機能モジュール（以下、プラグイン）の配置規格、共通インターフェース仕様、データベースアクセス規則、セキュアコーディング基準、および検証テスト基準について定義するものである。

---

## 1. ディレクトリ構造と規格

新規プラグインを追加する際、すべてのソースコードおよび仕様書は以下のディレクトリ構成に従い、独立して配置されなければならない。

```text
src/plugins/[pluginId]/
├── meta.ts             # プラグインマニフェスト（必須）
├── index.tsx            # プラグイン画面のエントリーポイント
├── SPEC.md             # 個別プラグインの業務要件・仕様書
├── api/                # APIエンドポイントハンドラー
├── db/                 # DBスキーマ定義、クエリ定義（Prisma/SQL）
└── components/         # プラグイン内共通UIパーツ
```

### 1.1. プラグインマニフェスト (`meta.ts`)

プラグインの基本属性を定義し、Core側へ接続情報を渡すマニフェストファイル。

```typescript
// src/plugins/[pluginId]/meta.ts
export type PluginMeta = {
  id: string; // 英小文字・数字・ハイフンのみ。テーブル名プレフィックスに使用 (例: plugin_a)
  name: string; // UI表示名
  route: string; // ルーティングパス (例: '/plugins/a')
  enabled: boolean; // 有効/無効トグルフラグ
  icon?: string; // サイドバー用のアイコンキー
  category: 'business' | 'operation' | 'defense' | 'ai'; // カテゴリ分類
  requiredRole?: 'admin' | 'member'; // 要求ロール
  networkRequired?: boolean; // 外部通信が必要かどうかのフラグ
};

export const meta: PluginMeta = {
  id: 'plugin-a',
  name: 'プラグインA',
  route: '/plugins/a',
  enabled: true,
  category: 'business',
  requiredRole: 'member',
  networkRequired: false,
};
```

---

## 2. イベント駆動通信 (PluginBus)

プラグイン間の直接結合を回避するため、プラグイン同士の直接通信・関数インポートを原則禁止し、`PluginBus` による非同期イベント通信に統一する。

```typescript
// src/lib/plugin-bus.ts
type EventListener = (data: any) => Promise<void> | void;

class PluginBus {
  private listeners: { [event: string]: EventListener[] } = {};

  // イベントリスナーの登録
  subscribe(event: string, listener: EventListener) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(listener);
  }

  // 非同期イベントの配信 (例外隔離設計)
  async emit(event: string, data: any): Promise<void> {
    const eventListeners = this.listeners[event] || [];

    // Promise.allSettled を使用し、1つのリスナーの失敗が他を中断させないようにする
    const results = await Promise.allSettled(
      eventListeners.map(async (listener) => {
        try {
          await listener(data);
        } catch (error) {
          console.error(`[PluginBus Error] Event: ${event}, Message:`, error);
        }
      })
    );
  }
}

export const pluginBus = new PluginBus();
```

---

## 3. データベースアクセスと統合設計

### 3.1. 物理制約の排除（論理参照）

プラグインが独自に定義するテーブルと、Coreテーブル（`users`等）または他プラグインのテーブルとの間に、物理的な外部キー（FOREIGN KEY）制約を設定しないこと。関連付けはレコード内の識別キー（`user_id` 等）の論理的保持に留め、プラグイン削除時にDBレイヤーで連鎖的な削除（CASCADE）や不整合エラーが発生するのを防止する。

### 3.2. 論理削除と部分ユニークインデックス

データを即時物理削除せず、`deleted_at` タイムスタンプを用いて論理削除とする。また、未削除データの間でのみ一意性を保証するため、部分インデックスを併用する。

```sql
CREATE TABLE plugin_a_records (
    id BIGSERIAL PRIMARY KEY,
    record_code VARCHAR(100) NOT NULL,
    data_payload TEXT,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 論理削除レコードを除いた一意制約インデックス
CREATE UNIQUE INDEX idx_unique_record_code_active
ON plugin_a_records(record_code)
WHERE deleted_at IS NULL;
```

### 3.3. 抽象DBインターフェースを用いたデータアクセス

プラグインは特定のDBエンジン（PostgreSQL等）に密結合するコードを直接記述せず、Coreの提供する抽象接続インターフェース（またはRepositoryクラス）を介してアクセスする。

```typescript
// プラグイン側でのRepository実装例（SQLite、PostgreSQL、ブラウザストレージの差異を吸収）
export class PluginARepository {
  constructor(private dbConnection: IDatabaseConnection) {}

  async findByCode(code: string): Promise<any> {
    const sql = 'SELECT * FROM plugin_a_records WHERE record_code = $1 AND deleted_at IS NULL';
    const results = await this.dbConnection.query(sql, [code]);
    return results[0] || null;
  }
}
```

---

## 4. APIルーティングと自己防衛設計

### 4.1. 動的APIルーティング

Next.jsのAPIルートにおいて、`/api/plugins/[pluginId]/...` の形式でAPIハンドラーを実装し、CoreのAPIゲートウェイを介して処理を委譲する。

### 4.2. JSONBカスタムフィールド防衛バリデーション

動的スキーマ拡張のためのJSONB項目へのデータ保存時、リソース枯渇（DoS）を防ぐバリデーションフィルターを必須とする。

```typescript
// src/lib/validation.ts
export type JsonValidationResult = {
  valid: boolean;
  error?: string;
};

export function validateCustomJson(data: any): JsonValidationResult {
  const MAX_KEYS = 50;
  const MAX_DEPTH = 3;
  const MAX_SIZE_BYTES = 64 * 1024; // 64KB

  // サイズ検証
  const jsonString = JSON.stringify(data);
  const sizeBytes = new Blob([jsonString]).size;
  if (sizeBytes > MAX_SIZE_BYTES) {
    return { valid: false, error: `データサイズが制限(${MAX_SIZE_BYTES} bytes)を超過しています。` };
  }

  // キー数および深度検証
  let keyCount = 0;
  function analyze(node: any, currentDepth: number): boolean {
    if (currentDepth > MAX_DEPTH) return false;
    if (node && typeof node === 'object' && !Array.isArray(node)) {
      const keys = Object.keys(node);
      keyCount += keys.length;
      if (keyCount > MAX_KEYS) return false;
      for (const key of keys) {
        if (!analyze(node[key], currentDepth + 1)) return false;
      }
    }
    return true;
  }

  const success = analyze(data, 1);
  if (!success) {
    return {
      valid: false,
      error: `キー数制限(${MAX_KEYS})またはネスト深度制限(${MAX_DEPTH})を超過しています。`,
    };
  }

  return { valid: true };
}
```

### 4.3. CSVインジェクション対策（エスケープ処理）

プラグインからCSVファイルを出力する際、Coreが提供するエクスポートコンポーネントを使用するか、出力文字列のサニタイズを行う。

- 表計算ソフトでの意図しない数式実行を防ぐため、セルの値が `=`, `+`, `-`, `@` で始まる場合は、ダブルクォーテーションで囲む、または先頭にシングルクォーテーション `'` を挿入してエスケープする。

---

## 5. 認証コンテキストの参照と認可判定

プラグインは特定の認証エンジン（パスワード認証、JWT等）の内部仕様に依存せず、Coreが標準化して提供する `UserSessionContext` を利用して認可判定を行う。

```typescript
// プラグイン側でのAPI認可判定例
import { NextRequest, NextResponse } from 'next/server';
import { UserSessionContext } from '@/lib/auth';

export async function POST(req: NextRequest, context: { session: UserSessionContext }) {
  const { session } = context;

  // 1. セッションの有効期限チェック
  if (!session || (session.expiresAt && new Date() > session.expiresAt)) {
    return new NextResponse(JSON.stringify({ error: 'Session expired' }), { status: 401 });
  }

  // 2. ロール（認可）のチェック
  if (session.role !== 'admin') {
    return new NextResponse(JSON.stringify({ error: 'Unauthorized access' }), { status: 403 });
  }

  // 業務処理の実行...
  return NextResponse.json({ success: true });
}
```

---

## 6. コーディング規約とセーフティ

### 6.1. タイムゾーン一貫性（JST基準）

サーバーのシステムタイムゾーンに依存する不整合を防ぐため、UTCへの変換を避け、常にローカル（JST）ベースのタイムゾーンを指定して日付処理を行う。

```typescript
// ✅ 推奨される安全な例：タイムゾーンを指定してスウェーデン表記形式（YYYY-MM-DD）で取得
const localDateStr = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' }); // '2026-07-08'
```

### 6.2. 外部通信静的スキャン

ネットワークが遮断された閉域環境におけるデータ流出防止のため、ビルド前に `check-no-network.js` スクリプトによる静的解析スキャンを実施する。

- **検知対象**: `axios` などの無許可外部通信パッケージの参照、および `http://` や `https://` で始まる絶対URL文字列の混入。

### 6.3. AI Providerを介したAPIキーの隠蔽

プラグイン側で外部サービス（LLM等）のAPIキーを保持またはハードコードすることを禁止する。必ずCoreが中継する共通APIを使用し、キーの管理およびログの追跡をCore側に委ねる。

---

## 7. 検証テスト・適合基準

新規プラグインのCore接続適合テスト項目を以下に示す。

| 検証項目                 | 確認内容                                                                                      | 判定基準                                                                                 |
| :----------------------- | :-------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------- |
| **ライセンスゲート検証** | Cookieがない状態でプラグイン画面/APIに直接リクエストを送信する。                              | 画面は `/login` へリダイレクト、APIは `403` を返却すること。                             |
| **二重送信防止検証**     | 同一の `Idempotency-Key` ヘッダを使用してAPIリクエストを2回連続で送信する。                   | 2回目のリクエストでは処理は実行されず、1回目のレスポンスキャッシュが返却されること。     |
| **監査ログ整合性**       | プラグイン内のテーブルに変更（UPDATE/DELETE）をかける。                                       | `audit_logs` テーブルに変更前と変更後のデータが自動格納されていること。                  |
| **障害伝播テスト**       | PluginBusに接続したプラグインBで例外エラーを故意に発生させ、送信元プラグインAから発火させる。 | プラグインBのエラーがキャッチ・記録され、プラグインAおよびシステム全体が停止しないこと。 |
