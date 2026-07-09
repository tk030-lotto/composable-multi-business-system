import { NextRequest, NextResponse } from 'next/server';
import { query, getClient } from '@/lib/db';
import pluginBus from '@/lib/plugin-bus';
import { checkApiPermission } from '@/modules/advanced-rbac';

export const dynamic = 'force-dynamic';

// リクエストヘッダーやパラメータから操作者名を取得する共通ヘルパー
function getOperator(request: NextRequest, body?: Record<string, unknown>): string {
  // 1. ヘッダー x-user-id から取得
  const headerUser = request.headers.get('x-user-id');
  if (headerUser) return headerUser;

  // 2. リクエストボディの changed_by から取得
  if (body && typeof body.changed_by === 'string') {
    return body.changed_by;
  }

  // 3. クエリパラメータの changed_by から取得
  const { searchParams } = new URL(request.url);
  const queryUser = searchParams.get('changed_by');
  if (queryUser) return queryUser;

  return 'SYSTEM';
}

// 動的カスタムフィールドのセキュリティバリデーション (サイズ制限、キー数制限、階層制限)
function validateCustomFields(customFields: unknown): { valid: boolean; error?: string } {
  if (customFields === undefined || customFields === null) {
    return { valid: true };
  }
  
  if (typeof customFields !== 'object' || Array.isArray(customFields)) {
    return { valid: false, error: 'カスタムフィールドはオブジェクト形式で指定してください。' };
  }

  // 1. キー数上限チェック（最大50項目）
  const keys = Object.keys(customFields);
  if (keys.length > 50) {
    return { valid: false, error: 'カスタムフィールドの項目数が多すぎます（最大50項目まで）。' };
  }

  // 2. ネスト（階層）深さチェック (最大3階層)
  function getDepth(obj: unknown): number {
    if (obj === null || typeof obj !== 'object') return 0;
    let maxDepth = 0;
    for (const key in obj as Record<string, unknown>) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        maxDepth = Math.max(maxDepth, getDepth((obj as Record<string, unknown>)[key]));
      }
    }
    return 1 + maxDepth;
  }

  const depth = getDepth(customFields);
  if (depth > 3) {
    return { valid: false, error: 'カスタムフィールドのネスト階層が深すぎます（最大3階層まで）。' };
  }

  // 3. データサイズ上限チェック（最大64KB）
  const jsonString = JSON.stringify(customFields);
  if (jsonString.length > 65536) {
    return { valid: false, error: 'カスタムフィールドのデータサイズが大きすぎます（最大64KBまで）。' };
  }

  return { valid: true };
}

/**
 * GET: 顧客一覧取得 (簡易検索対応)
 * 論理削除された顧客を除き、条件に合う顧客データを取得します
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const name = searchParams.get('name');
    const email = searchParams.get('email');
    const phone = searchParams.get('phone');
    const status = searchParams.get('status');

    let queryText = 'SELECT * FROM customers WHERE deleted_at IS NULL';
    const params: unknown[] = [];

    if (name) {
      params.push(`%${name}%`);
      queryText += ` AND name ILIKE $${params.length}`;
    }
    if (email) {
      params.push(`%${email}%`);
      queryText += ` AND email ILIKE $${params.length}`;
    }
    if (phone) {
      params.push(`%${phone}%`);
      queryText += ` AND phone ILIKE $${params.length}`;
    }
    if (status) {
      params.push(status);
      queryText += ` AND status = $${params.length}`;
    }

    queryText += ' ORDER BY id DESC';

    const result = await query(queryText, params);
    return NextResponse.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('GET /api/customers エラー:', error);
    return NextResponse.json(
      { success: false, error: '顧客データの取得中にエラーが発生しました。' },
      { status: 500 }
    );
  }
}

/**
 * POST: 顧客新規作成
 */
export async function POST(request: NextRequest) {
  let client;
  try {
    const body = await request.json();
    const { name, email, phone, status, custom_fields } = body;

    if (!name) {
      return NextResponse.json(
        { success: false, error: '「名前」は必須項目です。' },
        { status: 400 }
      );
    }

    // カスタムフィールドの防衛バリデーション
    const valResult = validateCustomFields(custom_fields);
    if (!valResult.valid) {
      return NextResponse.json(
        { success: false, error: valResult.error },
        { status: 400 }
      );
    }

    const operator = getOperator(request, body);
    client = await getClient();

    // トランザクション開始
    await client.query('BEGIN');

    // セッション変数 app.current_user_id を設定し、DBトリガーに操作者を伝える
    await client.query("SELECT set_config('app.current_user_id', $1, true)", [operator]);

    const insertText = `
      INSERT INTO customers (name, email, phone, status, custom_fields)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    const insertParams = [
      name,
      email || null,
      phone || null,
      status || '新規',
      custom_fields ? JSON.stringify(custom_fields) : '{}',
    ];

    const result = await client.query(insertText, insertParams);
    const newCustomer = result.rows[0];

    // トランザクションコミット
    await client.query('COMMIT');

    // プラグインバスにイベント通知
    await pluginBus.emit('customer:create', newCustomer);

    return NextResponse.json({ success: true, data: newCustomer }, { status: 201 });
  } catch (error) {
    console.error('POST /api/customers エラー:', error);
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('ロールバック中にエラーが発生しました:', rollbackError);
      }
    }
    return NextResponse.json(
      { success: false, error: '顧客データの登録中にエラーが発生しました。' },
      { status: 500 }
    );
  } finally {
    if (client) {
      client.release();
    }
  }
}

/**
 * PUT: 顧客情報更新
 */
export async function PUT(request: NextRequest) {
  let client;
  try {
    const body = await request.json();
    const { id, name, email, phone, status, custom_fields } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: '更新対象の「ID」は必須項目です。' },
        { status: 400 }
      );
    }
    if (!name) {
      return NextResponse.json(
        { success: false, error: '「名前」は必須項目です。' },
        { status: 400 }
      );
    }

    // カスタムフィールドの防衛バリデーション
    const valResult = validateCustomFields(custom_fields);
    if (!valResult.valid) {
      return NextResponse.json(
        { success: false, error: valResult.error },
        { status: 400 }
      );
    }

    const operator = getOperator(request, body);
    client = await getClient();

    await client.query('BEGIN');
    await client.query("SELECT set_config('app.current_user_id', $1, true)", [operator]);

    const updateText = `
      UPDATE customers
      SET name = $1, email = $2, phone = $3, status = $4, custom_fields = $5
      WHERE id = $6 AND deleted_at IS NULL
      RETURNING *
    `;
    const updateParams = [
      name,
      email || null,
      phone || null,
      status || '新規',
      custom_fields ? JSON.stringify(custom_fields) : '{}',
      id,
    ];

    const result = await client.query(updateText, updateParams);
    
    if (!result.rowCount) {
      await client.query('ROLLBACK');
      return NextResponse.json(
        { success: false, error: '指定されたIDの顧客データが見つからないか、既に削除されています。' },
        { status: 404 }
      );
    }

    const updatedCustomer = result.rows[0];
    await client.query('COMMIT');

    await pluginBus.emit('customer:update', updatedCustomer);

    return NextResponse.json({ success: true, data: updatedCustomer });
  } catch (error) {
    console.error('PUT /api/customers エラー:', error);
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('ロールバック中にエラーが発生しました:', rollbackError);
      }
    }
    return NextResponse.json(
      { success: false, error: '顧客データの更新中にエラーが発生しました。' },
      { status: 500 }
    );
  } finally {
    if (client) {
      client.release();
    }
  }
}

/**
 * DELETE: 顧客情報の論理削除
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

    const operator = getOperator(request);
    client = await getClient();

    await client.query('BEGIN');
    await client.query("SELECT set_config('app.current_user_id', $1, true)", [operator]);

    const deleteText = `
      UPDATE customers
      SET deleted_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING *
    `;
    
    const result = await client.query(deleteText, [parseInt(id, 10)]);

    if (!result.rowCount) {
      await client.query('ROLLBACK');
      return NextResponse.json(
        { success: false, error: '指定されたIDの顧客データが見つからないか、既に削除されています。' },
        { status: 404 }
      );
    }

    const deletedCustomer = result.rows[0];
    await client.query('COMMIT');

    await pluginBus.emit('customer:delete', deletedCustomer);

    return NextResponse.json({ success: true, message: '顧客データを論理削除しました。', data: deletedCustomer });
  } catch (error) {
    console.error('DELETE /api/customers エラー:', error);
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('ロールバック中にエラーが発生しました:', rollbackError);
      }
    }
    return NextResponse.json(
      { success: false, error: '顧客データの削除中にエラーが発生しました。' },
      { status: 500 }
    );
  } finally {
    if (client) {
      client.release();
    }
  }
}
