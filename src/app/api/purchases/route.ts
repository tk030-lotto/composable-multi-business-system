import { NextRequest, NextResponse } from 'next/server';
import { query, getClient } from '@/lib/db';
import pluginBus from '@/lib/plugin-bus';
import { checkApiPermission } from '@/modules/advanced-rbac';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

function getOperator(request: NextRequest, body?: Record<string, unknown>): string {
  const headerUser = request.headers.get('x-user-id');
  if (headerUser) return headerUser;
  if (body && typeof body.changed_by === 'string') return body.changed_by;
  const { searchParams } = new URL(request.url);
  const queryUser = searchParams.get('changed_by');
  if (queryUser) return queryUser;
  return 'SYSTEM';
}

/**
 * GET: 仕入一覧取得
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    let queryText = 'SELECT * FROM purchase_orders WHERE deleted_at IS NULL';
    const params: unknown[] = [];

    if (status) {
      params.push(status);
      queryText += ` AND status = $${params.length}`;
    }

    queryText += ' ORDER BY id DESC';

    const result = await query(queryText, params);
    const purchaseOrders = result.rows;

    if (purchaseOrders.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    const orderIds = purchaseOrders.map((o) => o.id);
    const itemsResult = await query(
      `SELECT * FROM purchase_order_items WHERE purchase_order_id = ANY($1::int[])`,
      [orderIds]
    );

    const itemsByOrderId = itemsResult.rows.reduce(
      (acc, item) => {
        if (!acc[item.purchase_order_id]) acc[item.purchase_order_id] = [];
        acc[item.purchase_order_id].push(item);
        return acc;
      },
      {} as Record<number, unknown[]>
    );

    const data = purchaseOrders.map((o) => ({
      ...o,
      items: itemsByOrderId[o.id] || [],
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('GET /api/purchases エラー:', error);
    return NextResponse.json(
      { success: false, error: 'データ取得中にエラーが発生しました。' },
      { status: 500 }
    );
  }
}

/**
 * POST: 仕入の新規作成
 */
export async function POST(request: NextRequest) {
  let client;
  try {
    const body = await request.json();
    const { supplier_name, status, expense_status, purchase_date, items } = body;

    if (!supplier_name || !purchase_date || !items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { success: false, error: '必須項目（仕入先名、日付、明細）が不足しています。' },
        { status: 400 }
      );
    }

    let totalAmount = 0;
    for (const item of items) {
      totalAmount += Number(item.quantity) * Number(item.unit_price);
    }

    const operator = getOperator(request, body);
    client = await getClient();

    await client.query('BEGIN');
    await client.query("SELECT set_config('app.current_user_id', $1, true)", [operator]);

    // 伝票番号の生成 (PUR-YYYYMMDD-UUID)
    const dateStr = new Date(purchase_date).toLocaleDateString('sv-SE').replace(/-/g, '');
    const shortUuid = crypto.randomUUID().split('-')[0].toUpperCase();
    const purchase_no = `PUR-${dateStr}-${shortUuid}`;

    const insertOrderText = `
      INSERT INTO purchase_orders (
        purchase_no, supplier_name, status, expense_status, total_amount, purchase_date
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
    const insertOrderParams = [
      supplier_name,
      status || 'ORDERED',
      expense_status || 'UNPAID',
      totalAmount,
      purchase_date,
    ];

    const orderResult = await client.query(insertOrderText, insertOrderParams);
    const newOrder = orderResult.rows[0];

    const insertedItems = [];
    for (const item of items) {
      const insertItemText = `
        INSERT INTO purchase_order_items (purchase_order_id, product_id, quantity, unit_price)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `;
      const itemResult = await client.query(insertItemText, [
        newOrder.id,
        item.product_id ? parseInt(item.product_id, 10) : null,
        parseInt(item.quantity, 10),
        parseFloat(item.unit_price),
      ]);
      insertedItems.push(itemResult.rows[0]);
    }

    await client.query('COMMIT');

    const finalData = { ...newOrder, items: insertedItems };

    await pluginBus.emit('procurement:create', finalData);

    return NextResponse.json({ success: true, data: finalData }, { status: 201 });
  } catch (error) {
    console.error('POST /api/purchases エラー:', error);
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* ignore */
      }
    }
    return NextResponse.json(
      { success: false, error: '登録中にエラーが発生しました。' },
      { status: 500 }
    );
  } finally {
    if (client) client.release();
  }
}

/**
 * PUT: 仕入の更新
 */
export async function PUT(request: NextRequest) {
  let client;
  try {
    const body = await request.json();
    const { id, supplier_name, status, expense_status, purchase_date, items } = body;

    if (
      !id ||
      !supplier_name ||
      !purchase_date ||
      !items ||
      !Array.isArray(items) ||
      items.length === 0
    ) {
      return NextResponse.json(
        { success: false, error: '必須項目が不足しています。' },
        { status: 400 }
      );
    }

    let totalAmount = 0;
    for (const item of items) {
      totalAmount += Number(item.quantity) * Number(item.unit_price);
    }

    const operator = getOperator(request, body);
    client = await getClient();

    await client.query('BEGIN');
    await client.query("SELECT set_config('app.current_user_id', $1, true)", [operator]);

    const updateOrderText = `
      UPDATE purchase_orders
      SET supplier_name = $1, status = $2, expense_status = $3, 
          total_amount = $4, purchase_date = $5
      WHERE id = $6 AND deleted_at IS NULL
      RETURNING *
    `;
    const updateOrderParams = [
      supplier_name,
      status || 'ORDERED',
      expense_status || 'UNPAID',
      totalAmount,
      purchase_date,
      id,
    ];

    const orderResult = await client.query(updateOrderText, updateOrderParams);
    if (!orderResult.rowCount) {
      await client.query('ROLLBACK');
      return NextResponse.json(
        { success: false, error: '指定されたデータが見つかりません。' },
        { status: 404 }
      );
    }
    const updatedOrder = orderResult.rows[0];

    await client.query('DELETE FROM purchase_order_items WHERE purchase_order_id = $1', [id]);

    const insertedItems = [];
    for (const item of items) {
      const insertItemText = `
        INSERT INTO purchase_order_items (purchase_order_id, product_id, quantity, unit_price)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `;
      const itemResult = await client.query(insertItemText, [
        id,
        item.product_id ? parseInt(item.product_id, 10) : null,
        parseInt(item.quantity, 10),
        parseFloat(item.unit_price),
      ]);
      insertedItems.push(itemResult.rows[0]);
    }

    await client.query('COMMIT');

    const finalData = { ...updatedOrder, items: insertedItems };

    await pluginBus.emit('procurement:update', finalData);

    return NextResponse.json({ success: true, data: finalData });
  } catch (error) {
    console.error('PUT /api/purchases エラー:', error);
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* ignore */
      }
    }
    return NextResponse.json(
      { success: false, error: '更新中にエラーが発生しました。' },
      { status: 500 }
    );
  } finally {
    if (client) client.release();
  }
}

/**
 * DELETE: 論理削除
 */
export async function DELETE(request: NextRequest) {
  const perm = checkApiPermission(request, 'owner');
  if (!perm.allowed) {
    return NextResponse.json({ success: false, error: perm.error }, { status: 403 });
  }

  let client;
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: 'IDは必須です。' }, { status: 400 });
    }

    const operator = getOperator(request);
    client = await getClient();

    await client.query('BEGIN');
    await client.query("SELECT set_config('app.current_user_id', $1, true)", [operator]);

    const deleteText = `
      UPDATE purchase_orders
      SET deleted_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING *
    `;
    const result = await client.query(deleteText, [parseInt(id, 10)]);

    if (!result.rowCount) {
      await client.query('ROLLBACK');
      return NextResponse.json(
        { success: false, error: '指定されたデータが見つかりません。' },
        { status: 404 }
      );
    }

    const deletedOrder = result.rows[0];
    await client.query('COMMIT');

    await pluginBus.emit('procurement:delete', deletedOrder);

    return NextResponse.json({ success: true, message: '論理削除しました。', data: deletedOrder });
  } catch (error) {
    console.error('DELETE /api/purchases エラー:', error);
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* ignore */
      }
    }
    return NextResponse.json(
      { success: false, error: '削除中にエラーが発生しました。' },
      { status: 500 }
    );
  } finally {
    if (client) client.release();
  }
}
