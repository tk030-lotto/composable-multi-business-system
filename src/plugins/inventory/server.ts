/* eslint-disable @typescript-eslint/no-explicit-any */
import { getClient } from '@/lib/db';

/**
 * 簡易的な在庫連動ロジック
 * ※本来は前回状態（old_data）との差分を計算して在庫を戻す/増やす処理が必要ですが、
 * 実証モジュールのため、新規作成(create)時の基本的な増減のみ実装します。
 */
export function registerInventoryPlugin(bus: any) {
  // --- 売上 (Sales) ---
  bus.on('sales:create', async (data: any) => {
    // ACTUAL（本売上）のみ論理在庫を減らす
    if (data.order_type !== 'ACTUAL' || !data.items) return;

    let client;
    try {
      client = await getClient();
      await client.query('BEGIN');

      for (const item of data.items) {
        if (!item.product_id) continue;
        await client.query(
          `UPDATE products 
           SET logical_stock = logical_stock - $1 
           WHERE id = $2 AND deleted_at IS NULL`,
          [item.quantity, item.product_id]
        );
      }

      await client.query('COMMIT');
      console.log('[Inventory Plugin] 売上作成に伴い、論理在庫を引き落としました。', data.id);
    } catch (err) {
      if (client) await client.query('ROLLBACK');
      console.error('[Inventory Plugin] 在庫引き落としエラー:', err);
    } finally {
      if (client) client.release();
    }
  });

  bus.on('sales:update', async (data: any) => {
    // SHIPPEDに変更されたら物理在庫を減らすなど（今回はモックとしてログのみ）
    if (data.order_type !== 'ACTUAL') return;
    console.log('[Inventory Plugin] 売上が更新されました。在庫差分調整が必要です。', data.id);
    // TODO: old_data（audit_logs）を取得して差分をproductsに反映する
  });

  // --- 仕入 (Procurement) ---
  bus.on('procurement:create', async (data: any) => {
    if (!data.items) return;

    let client;
    try {
      client = await getClient();
      await client.query('BEGIN');

      // 発注時は「入荷予定」として論理在庫を増やす
      for (const item of data.items) {
        if (!item.product_id) continue;
        await client.query(
          `UPDATE products 
           SET logical_stock = logical_stock + $1 
           WHERE id = $2 AND deleted_at IS NULL`,
          [item.quantity, item.product_id]
        );
      }

      await client.query('COMMIT');
      console.log('[Inventory Plugin] 発注作成に伴い、論理在庫を加算しました。', data.id);
    } catch (err) {
      if (client) await client.query('ROLLBACK');
      console.error('[Inventory Plugin] 在庫加算エラー:', err);
    } finally {
      if (client) client.release();
    }
  });

  bus.on('procurement:update', async (data: any) => {
    console.log('[Inventory Plugin] 発注が更新されました。在庫差分調整が必要です。', data.id);
  });
}
