# BaseKit Core 定義設計書 (V3.0)

本ドキュメントは、プラグイン型業務システムにおける共通基盤（以下、BaseKit Core）の機能、システム境界、アーキテクチャ構成、データベースおよび認証の抽象化設計、ならびにライセンス条項について定義するものである。

---

## 1. 開発目的と対象スコープ

### 1.1. 開発の背景と目的

個人開発者、フリーランス、および中小規模の開発会社が、個人事業主や中小企業から業務システム開発の依頼を受けた際、限られた開発期間とリソースの中で、安全かつ保守性の高いシステムを効率的に構築・提供することを目的とする。

認証、データベース接続、ログ管理といった共通機能の実装重複を排除し、受託開発における品質の安定化と開発コストの低減を実現する。

### 1.2. システムの設計方針と境界

本フレームワークは「薄い共通コア（Core）」と「着脱可能な機能モジュール（プラグイン）」によって構成される。Coreは特定の業態や個別のビジネスルールに依存する業務ロジックを持たず、システム全体の安全性・データ永続性・通信制御を担保するためのインフラストラクチャとしての役割に専念する。

```mermaid
graph TD
    subgraph Core (ベースキット・共通インフラ層)
        UI["共通UI・動的ルーティング"]
        Auth["抽象化認証・認可・免責ゲート"]
        DB["抽象化DB管理・自動監査ログ"]
        API["APIゲートウェイ・冪等性検証"]
        Bus["PluginBus (非同期イベントバス)"]
        AI["AI Provider (共通LLM接続)"]
    end

    subgraph Plugins (業務ロジック層)
        P1["プラグインA"]
        P2["プラグインB"]
        P3["プラグインC"]
    end

    UI --> P1
    API --> P1
    Bus <--> P1
    Bus <--> P2
    Bus <--> P3
```

### 1.3. 設計原則

1. **業務ロジックの排除**: Coreには特定の帳票定義、計算ロジック、ワークフローなどの個別業務ロジックを含めない。これらはすべてプラグインの境界内に隔離する。
2. **依存方向の一方向性**: プラグインはCoreが提供するAPIやコンポーネントに依存できるが、Coreは特定のプラグインの存在に依存してはならない。
3. **障害の局所化**: プラグイン内部で発生した実行時例外や処理遅延が、Coreまたは他のプラグインの動作を停止させない設計を維持する。

### 1.4. 拡張性（コンポーザビリティ）設計原則

- **動的マウント制御**: Coreはプラグインの具体的なコードを静的にビルドせず、マニフェスト（`meta.ts`）に基づいてルーティングとサイドバーを動的生成する。これにより、コードの変更なしにモジュールの追加・削除（トグル）を可能とする。
- **インターフェースによる結合**: Coreとプラグイン間の機能接続、およびプラグイン同士のデータ連携は、抽象インターフェースとメッセージイベント（PluginBus）のみを経由する。

---

## 2. 7つの共通機能の論理定義

### 2.1. 共通UIレイアウトとルーティング

システム全体の整合性を保つための「外枠」UIを提供する。

- 共通のヘッダー、ナビゲーションサイドバー、通知領域のレンダリング。
- 動的ルーティング (`/plugins/[pluginId]`) を介した、プラグイン画面の動的マウント制御。

### 2.2. データベースアクセス基盤

すべてのモジュールで安全にデータを読み書きするための接続管理、および複数データベースエンジンへの抽象アクセスを提供する。

- 接続プーリング管理、各種DBエンジン（外部RDB、ローカルRDB、ブラウザストレージ等）へのアクセス仲介。
- プラグインが独自に定義するテーブル群とCoreテーブル群の接続・実行の抽象化。

### 2.3. プラグイン接続および動的マウント

プラグインマニフェスト（`meta.ts`）をロードし、システム内へ機能を動的にマウントする。

- プラグインの有効化/無効化のステータス管理。
- ユーザー権限（ロール）に基づいたナビゲーションメニューの表示/非表示制御。

### 2.4. イベント中継器 (PluginBus)

プラグイン間で相互にメッセージやデータを伝達するための非同期イベント中継器を提供する。

- 送信側プラグインは受信側プラグインの具体的な実装を知る必要がない（出版-購読型モデル）。
- `Promise.allSettled` による並列実行により、特定リスナーの失敗が他へ影響を与えない構造とする。

### 2.5. ユーザー認証およびアクセス制御 (Auth & Roles)

セキュアなシステムアクセスのための基本インフラを提供する。

- セッション管理、認証情報の検証（各種認証プロバイダの仲介）。
- ロール（管理者/一般メンバー等）に応じたAPIアクセス制御および画面閲覧制限。
- ユーザーアカウントの有効期限（`expires_at`）のチェック。

### 2.6. 法的・技術的自己防衛ゲート (免責ゲート & 自動監査ログ)

システム運用に伴う賠償リスクや操作ミスによるデータ不整合を、システム的に防ぐための防御策。

- **免責ライセンスゲート**: 起動時または未同意ユーザーに対して利用規約・承諾書への同意を強制し、同意Cookieがないすべてのアクセス（画面・API）をMiddleware層で遮断する。これにより、制作者側の予期せぬ法的責任や損害賠償リスクを低減する。
- **自動監査ログ機能**: アプリケーションの実装漏れを避けるため、データベースまたはデータストレージのレイヤーにおいて、データ変更（INSERT, UPDATE, DELETE等）の履歴を強制的に記録する。

### 2.7. 共通AI Provider

プラグインからLLM（Large Language Models）を呼び出すためのAPI中継器。

- APIキーなどの認証情報をCoreサーバーサイドで一括管理し、プラグイン側にはキーを露出させない。
- 呼び出し元のプラグインIDを記録し、AIの利用履歴・実行コストのログを保存する。

---

## 3. マルチデータベース（各種・複数対応）抽象化設計

多様な動作環境（外部クラウドRDB、ローカルSQLite、ローカルブラウザストレージ等）への適応、およびプラグインごとの複数接続に対応するため、DBアクセスを抽象化する。

### 3.1. 接続管理インターフェース (`IDatabaseManager`)

Coreはデータソースごとの接続・接続プールを管理するインターフェースを提供する。

```typescript
export interface IDatabaseConnection {
  query<T = any>(sql: string, params?: any[]): Promise<T>;
  execute(sql: string, params?: any[]): Promise<void>;
  close(): Promise<void>;
}

export interface IDatabaseManager {
  // 指定されたデータベース識別子(dbId)の接続を取得する（マルチDB対応）
  getConnection(dbId?: string): Promise<IDatabaseConnection>;
  registerConnection(dbId: string, connection: IDatabaseConnection): void;
}
```

### 3.2. データアクセスの抽象化 (Repository パターン)

プラグインは特定のDBエンジン依存コードを直接記述せず、データストアを隠蔽するRepositoryインターフェースを介してデータを読み書きする。これにより、PostgreSQL、SQLite、またはlocalStorageへの切り替えを容易にする。

---

## 4. 認証プロバイダ抽象化設計

運用要件（ID/パスワード認証、JWTによる外部システム連携、OAuth、ソーシャル認証等）に応じて、認証ロジックを差し替え可能とする。
また、本システムはプラグインの集合体であるため、**認証画面（ログインUI）は各プラグインが保持し、COREは認証と権限判定のロジック（バックエンド）のみを提供する**という完全な責任分離アーキテクチャを採用する。

### 4.1. 認証プロバイダインターフェース (`IAuthProvider`)

```typescript
export interface UserSessionContext {
  userId: string;
  email: string;
  isSystemAdmin: boolean;
  pluginRoles: Record<string, 'MANAGER' | 'USER' | 'NONE'>; // 各プラグインに対する権限
  expiresAt: Date | null;
  rawPayload?: any; // 各種認証方式における追加の認証トークンデータ
}

export interface IAuthProvider {
  // プラグインから渡された認証情報の検証と標準セッションの取得
  validateCredentials(credentials: any): Promise<UserSessionContext>;

  // ユーザーが特定のプラグインにアクセスする権限があるかを判定
  verifyPluginAccess(context: UserSessionContext, pluginId: string): boolean;
  // セッション有効性のチェック
  validateSession(tokenOrSessionId: string): Promise<boolean>;
  // セッションの破棄（ログアウト）
  revokeSession(tokenOrSessionId: string): Promise<void>;
}
```

---

## 5. 共通データベース設計 (RDB標準スキーマ例)

Core側で保持する主要テーブル定義（PostgreSQL互換の標準実装スキーマ）を以下に示す。他のデータベースエンジンを利用する場合は、これと同等の論理構造を持つスキーマを定義する。

### 5.1. 監査ログテーブル (`audit_logs`)

```sql
CREATE TABLE audit_logs (
    id BIGSERIAL PRIMARY KEY,
    table_name VARCHAR(63) NOT NULL,
    action VARCHAR(10) NOT NULL, -- 'INSERT', 'UPDATE', 'DELETE'
    changed_by VARCHAR(255) NOT NULL DEFAULT 'SYSTEM',
    old_data JSONB, -- 変更前のデータ
    new_data JSONB, -- 変更後のデータ
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_table_name ON audit_logs(table_name);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
```

### 5.2. 冪等性キー管理テーブル (`idempotency_keys`)

```sql
CREATE TABLE idempotency_keys (
    key TEXT PRIMARY KEY,
    request_hash VARCHAR(64) NOT NULL,
    response_status INTEGER NOT NULL,
    response_body JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_idempotency_keys_created_at ON idempotency_keys(created_at);
```

### 5.3. ユーザー管理テーブル (`users`)

```sql
CREATE TABLE users (
    id VARCHAR(255) PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'member',
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX idx_active_users_email ON users(email) WHERE deleted_at IS NULL;
```

---

## 6. セキュリティ・アクセス制御設計

### 6.1. 免責同意Middleware仕様

すべての画面・APIリクエストに対し、免責同意の有無を検証する。

```
[クライアントリクエスト]
        │
        ▼
[Next.js Middleware]
        │
        ├─► 同意不要パス（/login, _next/*, アセット等） ──► パス
        │
        ▼
[Cookie: crm_license_accepted_v{version} の検証]
        │
        ├─► 有効（'true'） ──► パス
        │
        ▼
[無効・未同意の場合]
        │
        ├─► APIリクエスト（/api/*） ──► [403 Forbidden] を返却
        │
        └─► 画面アクセス（/*） ──► [/login] へ強制リダイレクト
```

### 6.2. ユーザーロールと権限判定

- 画面遷移またはAPI呼び出し時、Coreのアクセス制御フィルターがセッション内の `role` および `expires_at` を検証する。
- 現在時刻が `expires_at`（有効期限）を超過している場合は、セッションを強制破棄し `/login` へリダイレクトする。
- プラグインの実行要求ロール（例：`requiredRole: "admin"`）に対して、ユーザーの保持するロールが一致しない場合は `403 Forbidden` を返す。

---

## 7. 共通UIレイアウト仕様

### 7.1. 動的サイドバーの構成

サイドバーは、全有効化プラグインのマニフェスト（`meta.ts`）から取得した情報に基づき、実行時に動的にレンダリングされる。

- 各プラグインの `name`, `route`, `icon` 情報を配列としてロード。
- ユーザーの権限（ロール）がプラグインの `requiredRole` を満たさない場合は、UIレンダリングから除外する。

### 7.2. 共通UIコンポーネント

Coreはプラグインが利用できる以下のUIコンポーネントを標準提供する。

1. **CSVエクスポートUI (`csv-exporter.tsx`)**:
   - クライアントサイドでのエスケープ処理（CSVインジェクション対策）を内包した、汎用データエクスポートボタン。
2. **カスタムフィールドUI (`custom-fields.tsx`)**:
   - JSONB型データを編集・バリデーションするための動的フォームUI。

---

## 8. ライセンスおよび免責条項 (MIT License)

本フレームワークは、オープンソースソフトウェア（MITライセンス）として公開・提供される。

### 8.1. MIT License 許諾条項

```text
Copyright (c) 2026 BaseKit Project Authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- 本許諾に基づき、二次利用者は商用・非商用問わず、コードの改変・再配布・サブライセンスを無償で行うことができる。
- 本ソフトウェアの利用により発生した損害に関して、著作者および著作権者は一切の法的責任（契約責任、不法行為責任等）を負わない。
