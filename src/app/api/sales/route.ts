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
 * GET: 売上/見積一覧取得
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const order_type = searchParams.get('order_type');
    const customer_id = searchParams.get('customer_id');

    let queryText = 'SELECT * FROM sales_orders WHERE deleted_at IS NULL';
    const params: unknown[] = [];

    if (order_type) {
      params.push(order_type);
      queryText += ` AND order_type = $${params.length}`;
    }
    if (customer_id) {
      params.push(parseInt(customer_id, 10));
      queryText += ` AND customer_id = $${params.length}`;
    }

    queryText += ' ORDER BY id DESC';

    const result = await query(queryText, params);

    // itemsの取得 (N+1問題はデータ量が少ない前提でループにするか、別途取得してマージする)
    const salesOrders = result.rows;
    if (salesOrders.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    const orderIds = salesOrders.map((o) => o.id);
    const itemsResult = await query(
      `SELECT * FROM sales_order_items WHERE sales_order_id = ANY($1::int[])`,
      [orderIds]
    );

    const itemsByOrderId = itemsResult.rows.reduce(
      (acc, item) => {
        if (!acc[item.sales_order_id]) acc[item.sales_order_id] = [];
        acc[item.sales_order_id].push(item);
        return acc;
      },
      {} as Record<number, unknown[]>
    );

    const data = salesOrders.map((o) => ({
      ...o,
      items: itemsByOrderId[o.id] || [],
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('GET /api/sales エラー:', error);
    return NextResponse.json(
      { success: false, error: 'データ取得中にエラーが発生しました。' },
      { status: 500 }
    );
  }
}

/**
 * POST: 売上/見積の新規作成
 */
export async function POST(request: NextRequest) {
  let client;
  try {
    const body = await request.json();
    const { customer_id, order_type, payment_method, status, payment_status, sales_date, items } =
      body;

    if (!sales_date || !items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { success: false, error: '必須項目（日付、明細）が不足しています。' },
        { status: 400 }
      );
    }

    // 合計金額の計算
    let totalAmount = 0;
    for (const item of items) {
      totalAmount += Number(item.quantity) * Number(item.unit_price);
    }

    const operator = getOperator(request, body);
    client = await getClient();

    await client.query('BEGIN');
    await client.query("SELECT set_config('app.current_user_id', $1, true)", [operator]);

    // 伝票番号の生成 (見積: EST-YYYYMMDD-UUID, 売上: SAL-YYYYMMDD-UUID)
    const prefix = order_type === 'ESTIMATE' ? 'EST' : 'SAL';
    const dateStr = new Date(sales_date).toLocaleDateString('sv-SE').replace(/-/g, '');
    const shortUuid = crypto.randomUUID().split('-')[0].toUpperCase();
    const sales_no = `${prefix}-${dateStr}-${shortUuid}`;

    const insertOrderText = `
      INSERT INTO sales_orders (
        sales_no, customer_id, order_type, payment_method, 
        status, payment_status, total_amount, sales_date
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;
    const insertOrderParams = [
      sales_no,
      customer_id ? parseInt(customer_id, 10) : null,
      order_type || 'ACTUAL',
      payment_method || 'CASH',
      status || 'ORDERED',
      payment_status || 'UNPAID',
      totalAmount,
      sales_date,
    ];

    const orderResult = await client.query(insertOrderText, insertOrderParams);
    const newOrder = orderResult.rows[0];

    // 明細の保存
    const insertedItems = [];
    for (const item of items) {
      const insertItemText = `
        INSERT INTO sales_order_items (sales_order_id, product_id, quantity, unit_price)
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

    // プラグインバスに通知 (見積作成イベント or 売上作成イベント)
    const eventName = order_type === 'ESTIMATE' ? 'estimation:create' : 'sales:create';
    await pluginBus.emit(eventName, finalData);

    return NextResponse.json({ success: true, data: finalData }, { status: 201 });
  } catch (error) {
    console.error('POST /api/sales エラー:', error);
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
 * PUT: 売上/見積の更新
 */
export async function PUT(request: NextRequest) {
  let client;
  try {
    const body = await request.json();
    const { id, customer_id, payment_method, status, payment_status, sales_date, items } = body;

    if (!id || !sales_date || !items || !Array.isArray(items) || items.length === 0) {
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
      UPDATE sales_orders
      SET customer_id = $1, payment_method = $2, status = $3, 
          payment_status = $4, total_amount = $5, sales_date = $6
      WHERE id = $7 AND deleted_at IS NULL
      RETURNING *
    `;
    const updateOrderParams = [
      customer_id ? parseInt(customer_id, 10) : null,
      payment_method || 'CASH',
      status || 'ORDERED',
      payment_status || 'UNPAID',
      totalAmount,
      sales_date,
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

    // 一旦既存の明細をすべて削除
    await client.query('DELETE FROM sales_order_items WHERE sales_order_id = $1', [id]);

    // 新たに明細を保存
    const insertedItems = [];
    for (const item of items) {
      const insertItemText = `
        INSERT INTO sales_order_items (sales_order_id, product_id, quantity, unit_price)
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

    const eventName = updatedOrder.order_type === 'ESTIMATE' ? 'estimation:update' : 'sales:update';
    await pluginBus.emit(eventName, finalData);

    return NextResponse.json({ success: true, data: finalData });
  } catch (error) {
    console.error('PUT /api/sales エラー:', error);
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
      UPDATE sales_orders
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

    const eventName = deletedOrder.order_type === 'ESTIMATE' ? 'estimation:delete' : 'sales:delete';
    await pluginBus.emit(eventName, deletedOrder);

    return NextResponse.json({ success: true, message: '論理削除しました。', data: deletedOrder });
  } catch (error) {
    console.error('DELETE /api/sales エラー:', error);
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
