import { query } from '../../lib/db';

/**
 * 顧客削除（論理削除）イベントを処理し、紐付く予約データを連動削除（論理削除）します。
 */
export function registerCalendarPlugin(bus: any) {
  console.log('===== カレンダー・予約連携プラグインを登録中 =====');
  console.log('カレンダー連携: 有効 (顧客論理削除時の予約連動削除に対応)');
  console.log('==================================================');

  bus.on('customer:delete', async (customer: any) => {
    const customerId = customer.id;
    console.log(`[Calendarプラグイン] 顧客 ID: ${customerId} が論理削除されたため、関連予約を連動削除します...`);

    try {
      // 予約データを論理削除するクエリ
      const deleteText = `
        UPDATE reservations 
        SET deleted_at = CURRENT_TIMESTAMP 
        WHERE customer_id = $1 AND deleted_at IS NULL 
        RETURNING *
      `;
      const result = await query(deleteText, [customerId]);
      const deletedCount = result.rowCount !== null ? result.rowCount : 0;
      
      console.log(`[Calendarプラグイン] 関連予約の連動削除成功: ${deletedCount} 件の予約を削除しました。`);
    } catch (error) {
      // エラーが発生しても、メインの顧客論理削除処理を落とさないように catch
      console.error('[Calendarプラグイン] 関連予約の連動削除中にエラーが発生しました:', error);
    }
  });
}
