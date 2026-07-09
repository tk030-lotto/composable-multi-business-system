import fs from 'fs';
import path from 'path';

// .env ロード
try {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf8');
    for (const line of envConfig.split('\n')) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let value = match[2] || '';
        value = value.trim();
        if (value.startsWith('"') && value.endsWith('"')) {
          value = value.slice(1, -1);
        } else if (value.startsWith("'") && value.endsWith("'")) {
          value = value.slice(1, -1);
        }
        process.env[key] = value;
      }
    }
  }
} catch (err) {}

import {
  formatCreateMessage,
  formatUpdateMessage,
  formatDeleteMessage,
  sendLineNotification,
  sendSlackNotification,
  registerNotificationPlugins
} from './index';

// 簡易的なアサーション関数
function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ アサーション失敗: ${message}`);
    process.exit(1);
  }
  console.log(`🟢 パス: ${message}`);
}

async function runTests() {
  console.log('================================================');
  console.log('   モジュールA (LINE/Slack通知) 単体テスト       ');
  console.log('================================================');

  const dummyCustomer = {
    id: 999,
    name: 'テスト顧客',
    email: 'test@example.com',
    phone: '090-0000-0000',
    status: '対応中',
    custom_fields: {
      "趣味": "プログラミング",
      "難易度": "高"
    }
  };

  // 1. メッセージフォーマットの検証
  console.log('\n--- 1. メッセージフォーマッタの検証 ---');
  
  const createMsg = formatCreateMessage(dummyCustomer);
  assert(createMsg.includes('【CRM通知: 顧客新規作成】'), '作成メッセージにタイトルが含まれること');
  assert(createMsg.includes('名前: テスト顧客'), '作成メッセージに顧客名が含まれること');
  assert(createMsg.includes('- 趣味: プログラミング'), 'カスタムフィールドの内容が含まれること');

  const updateMsg = formatUpdateMessage(dummyCustomer);
  assert(updateMsg.includes('【CRM通知: 顧客情報更新】'), '更新メッセージにタイトルが含まれること');

  const deleteMsg = formatDeleteMessage(dummyCustomer);
  assert(deleteMsg.includes('【CRM通知: 顧客論理削除】'), '削除メッセージにタイトルが含まれること');
  assert(deleteMsg.includes('テスト顧客 が論理削除されました。'), '削除メッセージに論理削除の旨が含まれること');

  // カスタムフィールドが文字列の場合
  const customerWithStrCF = {
    ...dummyCustomer,
    custom_fields: '{"備考": "文字列のCF"}'
  };
  const createMsgStrCF = formatCreateMessage(customerWithStrCF);
  assert(createMsgStrCF.includes('- 備考: 文字列のCF'), '文字列形式のカスタムフィールドが正しくパースされること');

  // カスタムフィールドが空の場合
  const customerNoCF = {
    ...dummyCustomer,
    custom_fields: {}
  };
  const createMsgNoCF = formatCreateMessage(customerNoCF);
  assert(createMsgNoCF.includes('カスタムフィールド: (なし)'), '空のカスタムフィールドが「(なし)」と表示されること');

  // 2. HTTP送信処理のモック検証
  console.log('\n--- 2. 送信処理の検証 (モック) ---');
  
  const originalFetch = global.fetch;
  let fetchCallCount = 0;
  let lastFetchUrl = '';
  let lastFetchOptions: any = null;

  // fetch をモック化
  global.fetch = (async (url: RequestInfo | URL, options?: RequestInit) => {
    fetchCallCount++;
    lastFetchUrl = url.toString();
    lastFetchOptions = options;
    return {
      ok: true,
      text: async () => 'OK'
    } as Response;
  }) as typeof global.fetch;

  // LINE通知の送信テスト
  fetchCallCount = 0;
  const lineSuccess = await sendLineNotification('LINEテストメッセージ', 'DUMMY_LINE_TOKEN');
  assert(lineSuccess === true, 'LINE送信が成功(true)を返すこと');
  assert(fetchCallCount === 1, 'fetchが1回呼び出されること');
  assert(lastFetchUrl === 'https://notify-api.line.me/api/notify', 'LINE APIのURL宛てに送信されること');
  assert(lastFetchOptions.method === 'POST', 'POSTリクエストであること');
  assert(lastFetchOptions.headers['Authorization'] === 'Bearer DUMMY_LINE_TOKEN', 'Authorizationヘッダーにトークンが設定されていること');
  assert(lastFetchOptions.body.includes('message='), 'ボディにmessageパラメータが含まれること');

  // Slack通知の送信テスト
  fetchCallCount = 0;
  const slackSuccess = await sendSlackNotification('Slackテストメッセージ', 'https://hooks.slack.com/services/DUMMY');
  assert(slackSuccess === true, 'Slack送信が成功(true)を返すこと');
  assert(fetchCallCount === 1, 'fetchが1回呼び出されること');
  assert(lastFetchUrl === 'https://hooks.slack.com/services/DUMMY', 'Slack WebhookのURL宛てに送信されること');
  assert(lastFetchOptions.method === 'POST', 'POSTリクエストであること');
  assert(lastFetchOptions.headers['Content-Type'] === 'application/json', 'Content-Typeがjsonであること');
  const payload = JSON.parse(lastFetchOptions.body);
  assert(payload.text === 'Slackテストメッセージ', '送信データにメッセージが含まれること');

  // 送信エラー時の例外ハンドリングテスト
  global.fetch = (async () => {
    return {
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error'
    } as Response;
  }) as typeof global.fetch;
  const lineFail = await sendLineNotification('エラーテスト', 'DUMMY');
  assert(lineFail === false, 'APIエラー時にLINE送信が失敗(false)を返すこと');

  const slackFail = await sendSlackNotification('エラーテスト', 'DUMMY');
  assert(slackFail === false, 'APIエラー時にSlack送信が失敗(false)を返すこと');

  // 例外スロー時のテスト
  global.fetch = (async () => {
    throw new Error('Network Error');
  }) as typeof global.fetch;
  const lineException = await sendLineNotification('例外テスト', 'DUMMY');
  assert(lineException === false, 'ネットワーク例外時にLINE送信が失敗(false)を返すこと');

  const slackException = await sendSlackNotification('例外テスト', 'DUMMY');
  assert(slackException === false, 'ネットワーク例外時にSlack送信が失敗(false)を返すこと');

  // 元の fetch に戻す
  global.fetch = originalFetch;

  // 3. プラグインバス経由の呼び出し検証
  console.log('\n--- 3. プラグインバスとの連携検証 ---');
  
  // ダミーのイベントバス
  const mockBus = {
    events: {} as any,
    on(event: string, listener: any) {
      this.events[event] = listener;
    },
    async emit(event: string, data: any) {
      if (this.events[event]) {
        await this.events[event](data);
      }
    }
  };

  // テスト用に環境変数を設定して登録
  process.env.LINE_CHANNEL_ACCESS_TOKEN = 'TEST_LINE_TOKEN';
  process.env.SLACK_WEBHOOK_URL = 'TEST_SLACK_URL';

  let lastFetchUrls: string[] = [];
  global.fetch = (async (url: RequestInfo | URL, options?: RequestInit) => {
    lastFetchUrls.push(url.toString());
    return {
      ok: true,
      text: async () => 'OK'
    } as Response;
  }) as typeof global.fetch;

  registerNotificationPlugins(mockBus);

  // customer:create イベントを発火
  lastFetchUrls = [];
  await mockBus.emit('customer:create', dummyCustomer);
  assert(lastFetchUrls.length === 2, 'customer:create 時、LINEとSlackの両方に送信が試みられること');
  assert(lastFetchUrls.includes('https://notify-api.line.me/api/notify'), 'LINEへ送信されること');
  assert(lastFetchUrls.includes('TEST_SLACK_URL'), 'Slackへ送信されること');

  // customer:update イベントを発火
  lastFetchUrls = [];
  await mockBus.emit('customer:update', dummyCustomer);
  assert(lastFetchUrls.length === 2, 'customer:update 時、送信が実行されること');

  // customer:delete イベントを発火
  lastFetchUrls = [];
  await mockBus.emit('customer:delete', dummyCustomer);
  assert(lastFetchUrls.length === 2, 'customer:delete 時、送信が実行されること');

  // fetch を戻す
  global.fetch = originalFetch;

  console.log('\n================================================');
  console.log('🎉 【テスト成功】モジュールAのすべての単体テストがパスしました！');
  console.log('================================================');
}

runTests().catch(err => {
  console.error('テスト実行中にエラーが発生しました:', err);
  process.exit(1);
});
