/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { getClient } from '@/lib/db';

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let client;
  try {
    const resolvedParams = await params;
    const { id } = resolvedParams;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'IDが指定されていません。' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { product_code, name, sales_price, purchase_price, logical_stock, physical_stock } = body;

    if (!product_code || !name) {
      return NextResponse.json(
        { success: false, error: '必須項目が不足しています。' },
        { status: 400 }
      );
    }

    client = await getClient();

    // Begin transaction for audit log
    await client.query('BEGIN');
    const operator = request.headers.get('x-operator-id') || 'SYSTEM';
    await client.query("SELECT set_config('app.current_user_id', $1, true)", [operator]);

    const updateText = `
      UPDATE products
      SET product_code = $1, name = $2, sales_price = $3, purchase_price = $4, logical_stock = $5, physical_stock = $6
      WHERE id = $7 AND deleted_at IS NULL
      RETURNING *
    `;
    const updateValues = [
      product_code,
      name,
      sales_price || 0,
      purchase_price || 0,
      logical_stock || 0,
      physical_stock || 0,
      id,
    ];

    const result = await client.query(updateText, updateValues);

    if (result.rowCount === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json(
        { success: false, error: '指定された商品が見つかりません。' },
        { status: 404 }
      );
    }

    await client.query('COMMIT');

    return NextResponse.json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    console.error('PUT /api/products/[id] エラー:', error);
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // ignore
      }
    }

    if (error.code === '23505') {
      return NextResponse.json(
        { success: false, error: 'この商品コードは既に別の商品で使われています。' },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { success: false, error: '更新中にエラーが発生しました。' },
      { status: 500 }
    );
  } finally {
    if (client) client.release();
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let client;
  try {
    const resolvedParams = await params;
    const { id } = resolvedParams;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'IDが指定されていません。' },
        { status: 400 }
      );
    }

    client = await getClient();

    // Begin transaction for audit log
    await client.query('BEGIN');
    const operator = request.headers.get('x-operator-id') || 'SYSTEM';
    await client.query("SELECT set_config('app.current_user_id', $1, true)", [operator]);

    // 論理削除
    const deleteText = `
      UPDATE products
      SET deleted_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING *
    `;

    const result = await client.query(deleteText, [id]);

    if (result.rowCount === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json(
        { success: false, error: '指定された商品が見つからないか、既に削除されています。' },
        { status: 404 }
      );
    }

    await client.query('COMMIT');

    return NextResponse.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('DELETE /api/products/[id] エラー:', error);
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // ignore
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
