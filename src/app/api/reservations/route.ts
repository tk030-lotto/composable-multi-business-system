import { NextRequest, NextResponse } from 'next/server';
import { query, getClient } from '@/lib/db';
import { checkApiPermission } from '@/modules/advanced-rbac';

export const dynamic = 'force-dynamic';

// モジュール内初期化フラグ（サーバー起動時に1回だけテーブル確認を実行するための最適化）
let isReservationsTableInitialized = false;

// リクエストヘッダーから操作者名を取得する共通ヘルパー（BUG-02: 監査ログ用）
function getOperator(request: NextRequest): string {
  return request.headers.get('x-user-id') || 'SYSTEM';
}

/**
 * 予約管理テーブルの存在保証（自己修復機能）
 * サーバー起動後の初回呼び出し時に1回だけ実行され、以降はフラグによりスキップされる。
 */
async function ensureReservationsTableExists() {
  if (isReservationsTableInitialized) return;

  await query(`
    CREATE TABLE IF NOT EXISTS reservations (
        id SERIAL PRIMARY KEY,
        customer_id INT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        start_time TIMESTAMP WITH TIME ZONE NOT NULL,
        end_time TIMESTAMP WITH TIME ZONE NOT NULL,
        memo TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL
    );
  `);
  
  // 既存テーブルが存在する場合の自己修復マイグレーション
  await query(`
    ALTER TABLE reservations ADD COLUMN IF NOT EXISTS memo TEXT;
    ALTER TABLE reservations ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;
  `);
  
  // 必要に応じてインデックスを追加
  await query(`
    CREATE INDEX IF NOT EXISTS idx_reservations_customer_id ON reservations (customer_id);
    CREATE INDEX IF NOT EXISTS idx_reservations_deleted_at ON reservations (deleted_at) WHERE deleted_at IS NULL;
  `);

  isReservationsTableInitialized = true;
}

/**
 * GET: 予約一覧の取得
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const start = searchParams.get('start');
    const end = searchParams.get('end');
    const customerId = searchParams.get('customer_id');

    await ensureReservationsTableExists();

    let queryText = `
      SELECT r.*, c.name as customer_name, c.email as customer_email, c.phone as customer_phone
      FROM reservations r
      INNER JOIN customers c ON r.customer_id = c.id
      WHERE r.deleted_at IS NULL AND c.deleted_at IS NULL
    `;
    const params: unknown[] = [];

    if (start) {
      params.push(start);
      queryText += ` AND r.end_time >= $${params.length}`;
    }
    if (end) {
      params.push(end);
      queryText += ` AND r.start_time <= $${params.length}`;
    }
    if (customerId) {
      const parsedId = parseInt(customerId, 10);
      if (isNaN(parsedId) || parsedId <= 0) {
        return NextResponse.json(
          { success: false, error: '無効な顧客IDです。' },
          { status: 400 }
        );
      }
      params.push(parsedId);
      queryText += ` AND r.customer_id = $${params.length}`;
    }

    queryText += ' ORDER BY r.start_time ASC, r.id ASC';

    const result = await query(queryText, params);
    return NextResponse.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('GET /api/reservations エラー:', error);
    return NextResponse.json(
      { success: false, error: '予約データの取得中にエラーが発生しました。' },
      { status: 500 }
    );
  }
}

/**
 * POST: 予約新規登録
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { customer_id, title, start_time, end_time, memo } = body;

    if (!customer_id || !title || !start_time || !end_time) {
      return NextResponse.json(
        { success: false, error: '「顧客ID」「予約名」「開始日時」「終了日時」は必須項目です。' },
        { status: 400 }
      );
    }

    const parsedCustomerId = parseInt(customer_id, 10);
    if (isNaN(parsedCustomerId) || parsedCustomerId <= 0) {
      return NextResponse.json(
        { success: false, error: '有効な顧客IDを指定してください。' },
        { status: 400 }
      );
    }

    const start = new Date(start_time);
    const end = new Date(end_time);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return NextResponse.json(
        { success: false, error: '無効な日時フォーマットです。' },
        { status: 400 }
      );
    }

    if (start >= end) {
      return NextResponse.json(
        { success: false, error: '開始日時は終了日時よりも前の時刻である必要があります。' },
        { status: 400 }
      );
    }

    await ensureReservationsTableExists();

    // 顧客が存在するか確認 (論理削除されていないもの)
    const customerCheck = await query(
      'SELECT id FROM customers WHERE id = $1 AND deleted_at IS NULL',
      [parsedCustomerId]
    );
    if (customerCheck.rowCount === 0) {
      return NextResponse.json(
        { success: false, error: '指定された顧客が存在しないか、既に削除されています。' },
        { status: 400 }
      );
    }

    const insertText = `
      INSERT INTO reservations (customer_id, title, start_time, end_time, memo)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    const insertParams = [
      parsedCustomerId,
      title,
      start.toISOString(),
      end.toISOString(),
      memo || null
    ];

    const result = await query(insertText, insertParams);
    return NextResponse.json({ success: true, data: result.rows[0] }, { status: 201 });
  } catch (error) {
    console.error('POST /api/reservations エラー:', error);
    return NextResponse.json(
      { success: false, error: '予約データの登録中にエラーが発生しました。' },
      { status: 500 }
    );
  }
}

/**
 * PUT: 予約情報更新
 */
export async function PUT(request: NextRequest) {
  let client;
  try {
    const body = await request.json();
    const { id, customer_id, title, start_time, end_time, memo } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: '更新対象の「ID」は必須項目です。' },
        { status: 400 }
      );
    }

    const parsedId = parseInt(id, 10);
    if (isNaN(parsedId) || parsedId <= 0) {
      return NextResponse.json(
        { success: false, error: '有効な予約IDを指定してください。' },
        { status: 400 }
      );
    }

    await ensureReservationsTableExists();

    // 既存の予約が存在するか確認
    const existingCheck = await query(
      'SELECT * FROM reservations WHERE id = $1 AND deleted_at IS NULL',
      [parsedId]
    );
    if (existingCheck.rowCount === 0) {
      return NextResponse.json(
        { success: false, error: '指定された予約データが見つかりません。' },
        { status: 404 }
      );
    }

    const currentReservation = existingCheck.rows[0];

    // 更新用の値を準備
    const finalCustomerId = customer_id !== undefined ? parseInt(customer_id, 10) : currentReservation.customer_id;
    const finalTitle = title !== undefined ? title : currentReservation.title;
    const finalStartTime = start_time !== undefined ? new Date(start_time) : new Date(currentReservation.start_time);
    const finalEndTime = end_time !== undefined ? new Date(end_time) : new Date(currentReservation.end_time);
    const finalMemo = memo !== undefined ? memo : currentReservation.memo;

    if (isNaN(finalCustomerId) || finalCustomerId <= 0) {
      return NextResponse.json(
        { success: false, error: '有効な顧客IDを指定してください。' },
        { status: 400 }
      );
    }

    if (isNaN(finalStartTime.getTime()) || isNaN(finalEndTime.getTime())) {
      return NextResponse.json(
        { success: false, error: '無効な日時フォーマットです。' },
        { status: 400 }
      );
    }

    if (finalStartTime >= finalEndTime) {
      return NextResponse.json(
        { success: false, error: '開始日時は終了日時よりも前の時刻である必要があります。' },
        { status: 400 }
      );
    }

    // 顧客チェック (変更された場合のみ)
    if (finalCustomerId !== currentReservation.customer_id) {
      const customerCheck = await query(
        'SELECT id FROM customers WHERE id = $1 AND deleted_at IS NULL',
        [finalCustomerId]
      );
      if (customerCheck.rowCount === 0) {
        return NextResponse.json(
          { success: false, error: '指定された顧客が存在しないか、既に削除されています。' },
          { status: 400 }
        );
      }
    }

    // BUG-02: トランザクション内で set_config を実行して監査ログに操作者を記録
    const operator = getOperator(request);
    client = await getClient();
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.current_user_id', $1, true)", [operator]);

    const updateText = `
      UPDATE reservations
      SET customer_id = $1, title = $2, start_time = $3, end_time = $4, memo = $5, updated_at = CURRENT_TIMESTAMP
      WHERE id = $6 AND deleted_at IS NULL
      RETURNING *
    `;
    const updateParams = [
      finalCustomerId,
      finalTitle,
      finalStartTime.toISOString(),
      finalEndTime.toISOString(),
      finalMemo || null,
      parsedId
    ];

    const result = await client.query(updateText, updateParams);
    await client.query('COMMIT');
    return NextResponse.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('PUT /api/reservations エラー:', error);
    if (client) {
      try { await client.query('ROLLBACK'); } catch (rbErr) { console.error('ロールバック失敗:', rbErr); }
    }
    return NextResponse.json(
      { success: false, error: '予約データの更新中にエラーが発生しました。' },
      { status: 500 }
    );
  } finally {
    if (client) client.release();
  }
}

/**
 * DELETE: 予約情報の論理削除
 */
export async function DELETE(request: NextRequest) {
  // RBAC権限チェック
  const perm = checkApiPermission(request, 'owner');
  if (!perm.allowed) {
    return NextResponse.json(
      { success: false, error: perm.error },
      { status: 403 }
    );
  }

  let client;
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { success: false, error: '削除対象の「ID」は必須パラメータです。' },
        { status: 400 }
      );
    }

    const parsedId = parseInt(id, 10);
    if (isNaN(parsedId) || parsedId <= 0) {
      return NextResponse.json(
        { success: false, error: '有効な予約IDを指定してください。' },
        { status: 400 }
      );
    }

    await ensureReservationsTableExists();

    // BUG-02: トランザクション内で set_config を実行して監査ログに操作者を記録
    const operator = getOperator(request);
    client = await getClient();
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.current_user_id', $1, true)", [operator]);

    const deleteText = `
      UPDATE reservations
      SET deleted_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING *
    `;
    const result = await client.query(deleteText, [parsedId]);

    if (result.rowCount === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json(
        { success: false, error: '指定された予約データが見つかりません。' },
        { status: 404 }
      );
    }

    await client.query('COMMIT');
    return NextResponse.json({
      success: true,
      message: '予約データを削除しました。',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('DELETE /api/reservations エラー:', error);
    if (client) {
      try { await client.query('ROLLBACK'); } catch (rbErr) { console.error('ロールバック失敗:', rbErr); }
    }
    return NextResponse.json(
      { success: false, error: '予約データの削除中にエラーが発生しました。' },
      { status: 500 }
    );
  } finally {
    if (client) client.release();
  }
}
