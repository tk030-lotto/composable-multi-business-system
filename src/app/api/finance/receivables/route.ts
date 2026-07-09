import { NextResponse } from 'next/server';
import { query, getClient } from '@/lib/db';
import pluginBus from '@/lib/plugin-bus';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'UNPAID';

    // sales_orders から情報を取得
    const result = await query(
      `
      SELECT id, sales_no, order_type, status, payment_status, total_amount, sales_date, created_at
      FROM sales_orders
      WHERE deleted_at IS NULL AND payment_status = $1
      ORDER BY created_at DESC
      `,
      [status]
    );

    return NextResponse.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Receivables API Error:', error);
    return NextResponse.json(
      { success: false, error: '売掛金の取得に失敗しました。', code: 'DATABASE_ERROR' },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    // 操作ユーザーIDの取得 (Middleware/セッション等で設定されている想定ですが、今回は SYSTEM として扱います)
    const operator = 'SYSTEM';

    const body = await request.json();
    const { id, payment_status } = body;

    if (!id || !payment_status) {
      return NextResponse.json(
        { success: false, error: '必要なフィールドが不足しています。', code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }

    const client = await getClient();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.current_user_id', $1, true)", [operator]);

      // 更新処理
      const updateResult = await client.query(
        `
        UPDATE sales_orders
        SET payment_status = $1
        WHERE id = $2 AND deleted_at IS NULL
        RETURNING *
        `,
        [payment_status, id]
      );

      if (updateResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return NextResponse.json(
          { success: false, error: '対象の売上伝票が見つかりません。', code: 'NOT_FOUND' },
          { status: 404 }
        );
      }

      const updatedRecord = updateResult.rows[0];
      await client.query('COMMIT');

      // 入金済みになったらイベント発行
      if (payment_status === 'PAID') {
        await pluginBus.emit('finance:payment_received', updatedRecord);
      }

      return NextResponse.json({ success: true, data: updatedRecord });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Receivables Update Error:', error);
    return NextResponse.json(
      { success: false, error: '入金ステータスの更新に失敗しました。', code: 'DATABASE_ERROR' },
      { status: 500 }
    );
  }
}
