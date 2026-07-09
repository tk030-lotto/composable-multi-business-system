/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { NextRequest, NextResponse } from 'next/server';
import { getClient } from '@/lib/db';

export async function GET(request: NextRequest) {
  let client;
  try {
    client = await getClient();
    const result = await client.query(
      `SELECT * FROM products WHERE deleted_at IS NULL ORDER BY created_at DESC`
    );
    return NextResponse.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('GET /api/products エラー:', error);
    return NextResponse.json(
      { success: false, error: '商品情報の取得に失敗しました。' },
      { status: 500 }
    );
  } finally {
    if (client) client.release();
  }
}

export async function POST(request: NextRequest) {
  let client;
  try {
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

    const insertText = `
      INSERT INTO products (
        product_code, name, sales_price, purchase_price, logical_stock, physical_stock
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
    const insertValues = [
      product_code,
      name,
      sales_price || 0,
      purchase_price || 0,
      logical_stock || 0,
      physical_stock || 0,
    ];

    const result = await client.query(insertText, insertValues);
    await client.query('COMMIT');

    return NextResponse.json({ success: true, data: result.rows[0] }, { status: 201 });
  } catch (error: any) {
    console.error('POST /api/products エラー:', error);
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // ignore
      }
    }

    // Unique constraint violation check
    if (error.code === '23505') {
      return NextResponse.json(
        { success: false, error: 'この商品コードは既に登録されています。' },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { success: false, error: '登録中にエラーが発生しました。' },
      { status: 500 }
    );
  } finally {
    if (client) client.release();
  }
}
