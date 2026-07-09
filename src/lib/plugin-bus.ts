type EventListener = (data: unknown) => void | Promise<void>;

class PluginBus {
  private listeners: { [event: string]: EventListener[] } = {};

  /**
   * イベントにリスナーを登録
   */
  on(event: string, listener: EventListener) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(listener);
  }

  /**
   * イベントを発火（全リスナーを非同期で安全に実行）
   */
  async emit(event: string, data: unknown) {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[PluginBus] イベント発火: ${event}`, data);
    }
    const eventListeners = this.listeners[event] || [];

    // 並列実行（Promise.allSettled）により、特定プラグインの失敗に影響されず非同期で実行
    await Promise.allSettled(
      eventListeners.map(async (listener) => {
        try {
          await listener(data);
        } catch (err) {
          console.error(`イベント [${event}] のリスナー実行中にエラーが発生しました:`, err);
        }
      })
    );
  }
}

const pluginBus = new PluginBus();

import { registerInventoryPlugin } from '@/plugins/inventory/server';

// 本来はモードなどによって出し分けるが、実証のためすべて登録
registerInventoryPlugin(pluginBus);

export default pluginBus;
