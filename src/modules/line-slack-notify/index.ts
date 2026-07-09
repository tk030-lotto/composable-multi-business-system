type Customer = {
  id: number;
  name: string;
  email?: string | null;
  phone?: string | null;
  status: string;
  custom_fields?: any;
};

// カスタムフィールドを文字列フォーマットに変換するヘルパー
function formatCustomFields(customFields: any): string {
  if (!customFields) return ' (なし)';
  
  let fieldsObj = customFields;
  if (typeof customFields === 'string') {
    try {
      fieldsObj = JSON.parse(customFields);
    } catch {
      return ` (解析不可: ${customFields})`;
    }
  }

  const keys = Object.keys(fieldsObj);
  if (keys.length === 0) return ' (なし)';

  let text = '';
  for (const key of keys) {
    const value = fieldsObj[key];
    const valText = typeof value === 'object' ? JSON.stringify(value) : value;
    text += `\n  - ${key}: ${valText}`;
  }
  return text;
}

// 各イベントのメッセージフォーマッタ
export function formatCreateMessage(customer: Customer): string {
  return `【CRM通知: 顧客新規作成】
ID: ${customer.id}
名前: ${customer.name}
メール: ${customer.email || '未設定'}
電話: ${customer.phone || '未設定'}
ステータス: ${customer.status}
カスタムフィールド:${formatCustomFields(customer.custom_fields)}`;
}

export function formatUpdateMessage(customer: Customer): string {
  return `【CRM通知: 顧客情報更新】
ID: ${customer.id}
名前: ${customer.name}
メール: ${customer.email || '未設定'}
電話: ${customer.phone || '未設定'}
ステータス: ${customer.status}
カスタムフィールド:${formatCustomFields(customer.custom_fields)}`;
}

export function formatDeleteMessage(customer: Customer): string {
  return `【CRM通知: 顧客論理削除】
ID: ${customer.id}
名前: ${customer.name} が論理削除されました。`;
}

// LINE Notify 送信関数
// ⚠️ BUG-01修正: LINE Notify は 2025年3月31日にサービス終了済み。
// 以前の実装は dead endpoint へ fetch を送り続けており、タイムアウト待ちでAPIが遅延するリスクがあった。
// LINE Messaging API (Bot) への移行が必要な場合は、この関数をそちらの実装で置き換えてください。
export async function sendLineNotification(message: string, token: string): Promise<boolean> {
  console.warn(
    '[LINE Notify] サービス終了済みのため送信をスキップしました。LINE Messaging API への移行をご検討ください。\n',
    'メッセージ内容:', message
  );
  return false;
}


// Slack Webhook 送信関数
export async function sendSlackNotification(message: string, webhookUrl: string): Promise<boolean> {
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ text: message })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[Slack通知エラー] ステータス: ${response.status}, 詳細: ${errText}`);
      return false;
    }
    return true;
  } catch (error) {
    console.error('[Slack通知例外発生]', error);
    return false;
  }
}

// メインの通知送信関数
export async function sendNotifications(message: string, lineToken?: string, slackUrl?: string) {
  const promises: Promise<any>[] = [];

  if (lineToken) {
    promises.push(
      sendLineNotification(message, lineToken).then(success => {
        if (success) {
          console.log('[LINE通知] 送信に成功しました。');
        }
      })
    );
  } else {
    console.log('[LINE通知スキップ: 未設定]\n' + message);
  }

  if (slackUrl) {
    promises.push(
      sendSlackNotification(message, slackUrl).then(success => {
        if (success) {
          console.log('[Slack通知] 送信に成功しました。');
        }
      })
    );
  } else {
    console.log('[Slack通知スキップ: 未設定]\n' + message);
  }

  if (promises.length > 0) {
    await Promise.allSettled(promises);
  }
}

// プラグインの初期化とリスナー登録
export function registerNotificationPlugins(bus: any) {
  const lineToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const slackUrl = process.env.SLACK_WEBHOOK_URL;

  console.log('===== LINE / Slack 通知プラグインを登録中 =====');
  if (lineToken) console.log('LINE通知: 有効');
  if (slackUrl) console.log('Slack通知: 有効');
  console.log('==============================================');

  bus.on('customer:create', async (customer: any) => {
    const message = formatCreateMessage(customer);
    await sendNotifications(message, lineToken, slackUrl);
  });

  bus.on('customer:update', async (customer: any) => {
    const message = formatUpdateMessage(customer);
    await sendNotifications(message, lineToken, slackUrl);
  });

  bus.on('customer:delete', async (customer: any) => {
    const message = formatDeleteMessage(customer);
    await sendNotifications(message, lineToken, slackUrl);
  });
}
