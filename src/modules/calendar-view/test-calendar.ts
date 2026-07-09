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

import { query } from '../../lib/db';

// 簡易アサーション
function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ アサーション失敗: ${message}`);
    process.exit(1);
  }
  console.log(`🟢 パス: ${message}`);
}

const API_BASE_URL = 'http://localhost:3000/api/reservations';
const CUSTOMER_API_URL = 'http://localhost:3000/api/customers';

// 認証クッキー付与ラッパー
async function fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
  const licenseVersion = process.env.NEXT_PUBLIC_LICENSE_AGREEMENT_VERSION || '1.0.0';
  const cookieName = `crm_license_accepted_v${licenseVersion}`;
  const cookieHeader = `${cookieName}=true`;

  const headers = new Headers(options.headers || {});
  headers.set('Cookie', cookieHeader);

  return fetch(url, {
    ...options,
    headers,
  });
}

async function runTests() {
  console.log('================================================');
  console.log('   モジュールB (カレンダービュー) 統合テスト     ');
  console.log('================================================');

  // Next.js サーバー起動確認
  try {
    await fetch(API_BASE_URL);
  } catch (err) {
    console.error('\n🔴 【エラー】Next.js開発サーバーが起動していません。');
    console.log('テスト実行前に `npm run dev` を起動してください。\n');
    process.exit(1);
  }

  let testCustomerId: number;
  let testReservationId: number;

  try {
    // ----------------------------------------------------------------
    // 0. テスト用顧客データの作成
    // ----------------------------------------------------------------
    console.log('\n--- 0. テスト用顧客データの作成 ---');
    const customerRes = await fetchWithAuth(CUSTOMER_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'API_TEST_カレンダー顧客',
        email: 'calendar-test@example.com',
        phone: '090-7777-7777',
        status: '新規'
      })
    });
    const customerData = await customerRes.json();
    assert(customerRes.status === 201 && customerData.success, 'テスト用顧客の作成に成功すること');
    testCustomerId = customerData.data.id;
    console.log(`テスト顧客ID: ${testCustomerId}`);

    // テスト前クリーンアップ
    await query('DELETE FROM reservations WHERE customer_id = $1', [testCustomerId]);

    // ----------------------------------------------------------------
    // 1. POST (予約新規登録) の検証
    // ----------------------------------------------------------------
    console.log('\n--- 1. POST /api/reservations (予約登録) ---');
    const now = new Date();
    const startStr = new Date(now.getTime() + 3600000).toISOString(); // 1時間後
    const endStr = new Date(now.getTime() + 7200000).toISOString();  // 2時間後

    const postBody = {
      customer_id: testCustomerId,
      title: 'テスト会議',
      start_time: startStr,
      end_time: endStr,
      memo: 'カレンダー機能の自動テストです。'
    };

    const postRes = await fetchWithAuth(API_BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(postBody)
    });
    
    const postData = await postRes.json();
    console.log('レスポンスステータス:', postRes.status);
    assert(postRes.status === 201 && postData.success, '予約が正常に登録されること(201)');
    testReservationId = postData.data.id;
    assert(testReservationId > 0, '登録された予約のIDが返されること');

    // DB確認
    const dbCheck = await query('SELECT * FROM reservations WHERE id = $1', [testReservationId]);
    assert(dbCheck.rowCount === 1, 'データベースに予約レコードが作成されていること');
    assert(dbCheck.rows[0].title === 'テスト会議', '予約タイトルが正確に保存されていること');

    // ----------------------------------------------------------------
    // 1-b. バリデーションエラーのテスト (異常系)
    // ----------------------------------------------------------------
    console.log('\n--- 1-b. バリデーションエラー検証 ---');

    // 開始時刻が終了時刻より遅い
    const invalidBody1 = {
      customer_id: testCustomerId,
      title: '不正予約',
      start_time: endStr,
      end_time: startStr
    };
    const invalidRes1 = await fetchWithAuth(API_BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(invalidBody1)
    });
    const invalidData1 = await invalidRes1.json();
    assert(invalidRes1.status === 400 && !invalidData1.success, '開始時刻が終了時刻より遅い場合は400エラーとなること');

    // 存在しない顧客ID
    const invalidBody2 = {
      customer_id: 99999,
      title: '不正予約2',
      start_time: startStr,
      end_time: endStr
    };
    const invalidRes2 = await fetchWithAuth(API_BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(invalidBody2)
    });
    const invalidData2 = await invalidRes2.json();
    assert(invalidRes2.status === 400 && !invalidData2.success, '存在しない顧客IDでの登録は400エラーとなること');

    // ----------------------------------------------------------------
    // 2. GET (予約取得・期間フィルタ) の検証
    // ----------------------------------------------------------------
    console.log('\n--- 2. GET /api/reservations (予約一覧・期間取得) ---');
    const startRange = new Date(now.getTime() - 86400000).toISOString(); // 1日前から
    const endRange = new Date(now.getTime() + 86400000).toISOString();  // 1日後まで

    const getRes = await fetchWithAuth(`${API_BASE_URL}?start=${encodeURIComponent(startRange)}&end=${encodeURIComponent(endRange)}`);
    const getData = await getRes.json();
    assert(getRes.status === 200 && getData.success, '期間指定での予約取得に成功すること(200)');
    assert(getData.data.length > 0, '取得された予約が1件以上含まれること');
    
    // 顧客情報が結合されて返ってきているか確認
    const resItem = getData.data.find((r: any) => r.id === testReservationId);
    assert(resItem !== undefined, '登録した予約データが一覧に含まれていること');
    assert(resItem.customer_name === 'API_TEST_カレンダー顧客', '顧客情報(customer_name)が正しく結合されていること');

    // ----------------------------------------------------------------
    // 3. PUT (予約更新) の検証
    // ----------------------------------------------------------------
    console.log('\n--- 3. PUT /api/reservations (予約更新) ---');
    const putBody = {
      id: testReservationId,
      title: 'テスト会議_更新版',
      memo: 'メモを更新しました。'
    };
    const putRes = await fetchWithAuth(API_BASE_URL, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(putBody)
    });
    const putData = await putRes.json();
    assert(putRes.status === 200 && putData.success, '予約情報が正常に更新されること(200)');
    assert(putData.data.title === 'テスト会議_更新版', 'タイトルが更新されていること');
    assert(putData.data.memo === 'メモを更新しました。', 'メモが更新されていること');

    // ----------------------------------------------------------------
    // 4. プラグインバス (連動論理削除) の検証
    // ----------------------------------------------------------------
    console.log('\n--- 4. プラグインバス経由の連動論理削除検証 ---');
    
    // 顧客を削除する (API 経由で DELETE)
    console.log('顧客を論理削除中...');
    const deleteCustomerRes = await fetchWithAuth(`${CUSTOMER_API_URL}?id=${testCustomerId}`, {
      method: 'DELETE'
    });
    assert(deleteCustomerRes.status === 200, '顧客が正常に論理削除されること');

    // 少し待って、カレンダープラグインの非同期処理を待つ
    await new Promise(resolve => setTimeout(resolve, 500));

    // 予約が連動して論理削除されているか確認
    const checkResDb = await query('SELECT * FROM reservations WHERE id = $1', [testReservationId]);
    assert(checkResDb.rows[0].deleted_at !== null, '顧客削除に伴い、紐づく予約の deleted_at にタイムスタンプが入っていること(連動論理削除成功)');

    // ----------------------------------------------------------------
    // 5. テストデータの完全消去 (クリーンアップ)
    // ----------------------------------------------------------------
    console.log('\nクリーンアップ中...');
    await query('DELETE FROM reservations WHERE customer_id = $1', [testCustomerId]);
    await query('DELETE FROM audit_logs WHERE customer_id = $1', [testCustomerId]);
    await query('DELETE FROM customers WHERE id = $1', [testCustomerId]);
    console.log('🟢 クリーンアップ完了');

    console.log('\n================================================');
    console.log('🎉 【テスト成功】カレンダーモジュールの全項目が正常動作しました！');
    console.log('================================================');

  } catch (error) {
    console.error('\n🔴 【テスト失敗】例外が発生しました。');
    console.error(error);
    process.exit(1);
  }
}

runTests();
