import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { checkApiPermission } from '@/modules/advanced-rbac';

export const dynamic = 'force-dynamic';

/**
 * テーブル自動修復用のヘルパー
 * アプリケーションのポータビリティと「手離れの良さ」を高めるため、
 * エンドポイント呼び出し時にテーブルが存在しない場合は自動作成します。
 * IMP-03: 初回のみ実行するよう初期化フラグで最適化（reservations と同パターン）
 */
let isSettingsTableInitialized = false;

async function ensureSettingsTableExists() {
  if (isSettingsTableInitialized) return;
  await query(`
    CREATE TABLE IF NOT EXISTS settings (
        key VARCHAR(255) PRIMARY KEY,
        value JSONB NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);
  isSettingsTableInitialized = true;
}


/**
 * GET: 設定情報の取得
 * 設計方针: 設定の読み取りはスタッフも含め全ロールが可能（権限チェックなし）。
 * 書き込み（POST）はオーナーのみ専用。audit-logsのGETの「オーナーのみ」との意図的な差異。
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');

    if (!key) {
      return NextResponse.json(
        { success: false, error: '「key」は必須パラメータです。' },
        { status: 400 }
      );
    }

    // テーブルの存在保証 (自己修復)
    await ensureSettingsTableExists();

    const result = await query('SELECT value FROM settings WHERE key = $1', [key]);

    if (result.rowCount === 0) {
      // 特定のキーのデフォルト値設定 (custom_fieldsは空配列)
      const defaultValue = key === 'custom_fields' ? [] : null;
      return NextResponse.json({ success: true, data: defaultValue });
    }

    return NextResponse.json({ success: true, data: result.rows[0].value });
  } catch (error) {
    console.error('GET /api/settings エラー:', error);
    return NextResponse.json(
      { success: false, error: '設定情報の取得中にエラーが発生しました。' },
      { status: 500 }
    );
  }
}

/**
 * POST: 設定情報の保存 (Upsert対応)
 */
export async function POST(request: NextRequest) {
  // RBAC権限チェック
  const perm = checkApiPermission(request, 'owner');
  if (!perm.allowed) {
    return NextResponse.json(
      { success: false, error: perm.error },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const { key, value } = body;

    if (!key) {
      return NextResponse.json(
        { success: false, error: '「key」は必須項目です。' },
        { status: 400 }
      );
    }

    if (value === undefined || value === null) {
      return NextResponse.json(
        { success: false, error: '「value」は必須項目です。' },
        { status: 400 }
      );
    }

    // テーブルの存在保証 (自己修復)
    await ensureSettingsTableExists();

    // Upsertの実行 (キー衝突時はvalueと更新日時を上書き)
    const upsertText = `
      INSERT INTO settings (key, value)
      VALUES ($1, $2)
      ON CONFLICT (key)
      DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;
    const upsertParams = [key, JSON.stringify(value)];
    const result = await query(upsertText, upsertParams);

    return NextResponse.json({
      success: true,
      message: '設定情報を保存しました。',
      data: result.rows[0].value
    });
  } catch (error) {
    console.error('POST /api/settings エラー:', error);
    return NextResponse.json(
      { success: false, error: '設定情報の保存中にエラーが発生しました。' },
      { status: 500 }
    );
  }
}
