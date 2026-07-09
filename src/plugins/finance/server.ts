import pluginBus from '@/lib/plugin-bus';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function registerFinancePlugin(bus: typeof pluginBus) {
  // 今回は消込処理が主体のため、イベントの初期登録はログ出力のみとします。
  // 将来的な拡張（他プラグインからの決済ステータス自動連携など）に備えています。
  if (process.env.NODE_ENV !== 'production') {
    console.log('[Finance Plugin] Registered');
  }
}
