import { NextResponse } from 'next/server';
import { query, getClient } from '@/lib/db';
import pluginBus from '@/lib/plugin-bus';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'UNPAID';

    const result = await query(
      `
      SELECT id, purchase_no, supplier_name, status, expense_status, total_amount, purchase_date, created_at
      FROM purchase_orders
      WHERE deleted_at IS NULL AND expense_status = $1
      ORDER BY created_at DESC
      `,
      [status]
    );

    return NextResponse.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Payables API Error:', error);
    return NextResponse.json(
      { success: false, error: '買掛金の取得に失敗しました。', code: 'DATABASE_ERROR' },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const operator = 'SYSTEM';

    const body = await request.json();
    const { id, expense_status } = body;

    if (!id || !expense_status) {
      return NextResponse.json(
        { success: false, error: '必要なフィールドが不足しています。', code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }

    const client = await getClient();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.current_user_id', $1, true)", [operator]);

      const updateResult = await client.query(
        `
        UPDATE purchase_orders
        SET expense_status = $1
        WHERE id = $2 AND deleted_at IS NULL
        RETURNING *
        `,
        [expense_status, id]
      );

      if (updateResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return NextResponse.json(
          { success: false, error: '対象の仕入伝票が見つかりません。', code: 'NOT_FOUND' },
          { status: 404 }
        );
      }

      const updatedRecord = updateResult.rows[0];
      await client.query('COMMIT');

      // 支払済みになったらイベント発行
      if (expense_status === 'PAID') {
        await pluginBus.emit('finance:payment_sent', updatedRecord);
      }

      return NextResponse.json({ success: true, data: updatedRecord });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Payables Update Error:', error);
    return NextResponse.json(
      { success: false, error: '支払ステータスの更新に失敗しました。', code: 'DATABASE_ERROR' },
      { status: 500 }
    );
  }
}
