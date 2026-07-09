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

const CUSTOMER_API_URL = 'http://localhost:3000/api/customers';
const AUDIT_LOG_API_URL = 'http://localhost:3000/api/audit-logs';
const SETTINGS_API_URL = 'http://localhost:3000/api/settings';

// 認証＆ロールクッキー付与ラッパー
async function fetchWithRole(url: string, role: 'owner' | 'staff' | null, options: RequestInit = {}): Promise<Response> {
  const licenseVersion = process.env.NEXT_PUBLIC_LICENSE_AGREEMENT_VERSION || '1.0.0';
  const licenseCookie = `crm_license_accepted_v${licenseVersion}=true`;
  const roleCookie = role ? `crm_user_role=${role}` : '';
  const cookieHeader = [licenseCookie, roleCookie].filter(Boolean).join('; ');

  const headers = new Headers(options.headers || {});
  headers.set('Cookie', cookieHeader);

  return fetch(url, {
    ...options,
    headers,
  });
}

async function runTests() {
  console.log('================================================');
  console.log('      モジュールC (詳細権限・RBAC) 統合テスト     ');
  console.log('================================================');

  // Next.js サーバー起動確認
  try {
    await fetch(CUSTOMER_API_URL);
  } catch (err) {
    console.error('\n🔴 【エラー】Next.js開発サーバーが起動していません。');
    console.log('テスト実行前に `npm run dev` を起動してください。\n');
    process.exit(1);
  }

  // 環境変数 ENABLE_MODULE_ADVANCED_RBAC の状態確認
  if (process.env.ENABLE_MODULE_ADVANCED_RBAC !== 'true') {
    console.warn('⚠️ 警告: 環境変数 ENABLE_MODULE_ADVANCED_RBAC が "true" ではありません。');
    console.warn('テストを実行するためには、.envでモジュールCを有効にしてください。');
    process.exit(1);
  }

  try {
    // ----------------------------------------------------------------
    // 準備: テスト用顧客データの作成 (Ownerで実行)
    // ----------------------------------------------------------------
    console.log('\n--- [準備] テスト用顧客データの作成 (Owner) ---');
    const customerRes = await fetchWithRole(CUSTOMER_API_URL, 'owner', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'API_TEST_RBAC顧客',
        email: 'rbac-test@example.com',
        phone: '090-9999-9999',
        status: '新規'
      })
    });
    const customerData = await customerRes.json();
    assert(customerRes.status === 201 && customerData.success, 'Ownerロールでテスト用顧客の作成に成功すること');
    const testCustomerId = customerData.data.id;
    console.log(`テスト顧客ID: ${testCustomerId}`);

    // ----------------------------------------------------------------
    // 検証1: スタッフ (Staff) ロールによる顧客削除の禁止
    // ----------------------------------------------------------------
    console.log('\n--- [検証1] Staffロールによる顧客削除の制限 ---');
    const deleteStaffRes = await fetchWithRole(`${CUSTOMER_API_URL}?id=${testCustomerId}`, 'staff', {
      method: 'DELETE'
    });
    const deleteStaffData = await deleteStaffRes.json();
    assert(deleteStaffRes.status === 403, 'Staffロールでの顧客削除リクエストは 403 Forbidden となること');
    assert(deleteStaffData.success === false && deleteStaffData.error.includes('Owner'), '適切なエラーメッセージが返却されること');

    // DB上で実際に削除されていないことを確認
    const checkDb1 = await query('SELECT * FROM customers WHERE id = $1 AND deleted_at IS NULL', [testCustomerId]);
    assert(checkDb1.rowCount === 1, 'データベース内の顧客データが論理削除されていないこと');

    // ----------------------------------------------------------------
    // 検証2: スタッフ (Staff) ロールによる操作履歴（監査ログ）閲覧の禁止
    // ----------------------------------------------------------------
    console.log('\n--- [検証2] Staffロールによる操作履歴閲覧の制限 ---');
    const getLogsStaffRes = await fetchWithRole(`${AUDIT_LOG_API_URL}?limit=10`, 'staff');
    const getLogsStaffData = await getLogsStaffRes.json();
    assert(getLogsStaffRes.status === 403, 'Staffロールでの操作履歴取得リクエストは 403 Forbidden となること');
    assert(getLogsStaffData.success === false, 'success=false が返却されること');

    // ----------------------------------------------------------------
    // 検証3: スタッフ (Staff) ロールによる設定変更の禁止
    // ----------------------------------------------------------------
    console.log('\n--- [検証3] Staffロールによるシステム設定変更の制限 ---');
    const postSettingsStaffRes = await fetchWithRole(SETTINGS_API_URL, 'staff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: 'custom_fields',
        value: []
      })
    });
    const postSettingsStaffData = await postSettingsStaffRes.json();
    assert(postSettingsStaffRes.status === 403, 'Staffロールでのシステム設定変更リクエストは 403 Forbidden となること');
    assert(postSettingsStaffData.success === false, 'success=false が返却されること');

    // ----------------------------------------------------------------
    // 検証4: オーナー (Owner) ロールによる通常削除の許可
    // ----------------------------------------------------------------
    console.log('\n--- [検証4] Ownerロールによる顧客削除の許可 ---');
    const deleteOwnerRes = await fetchWithRole(`${CUSTOMER_API_URL}?id=${testCustomerId}`, 'owner', {
      method: 'DELETE'
    });
    const deleteOwnerData = await deleteOwnerRes.json();
    assert(deleteOwnerRes.status === 200 && deleteOwnerData.success, 'Ownerロールでの顧客削除は正常終了(200)すること');

    // DB上で削除されたことを確認
    const checkDb2 = await query('SELECT * FROM customers WHERE id = $1 AND deleted_at IS NOT NULL', [testCustomerId]);
    assert(checkDb2.rowCount === 1, 'データベース内の顧客データが正常に論理削除されていること');

    // ----------------------------------------------------------------
    // クリーンアップ
    // ----------------------------------------------------------------
    console.log('\nクリーンアップ中...');
    await query('DELETE FROM audit_logs WHERE customer_id = $1', [testCustomerId]);
    await query('DELETE FROM customers WHERE id = $1', [testCustomerId]);
    console.log('🟢 クリーンアップ完了');

    console.log('\n================================================');
    console.log('🎉 【テスト成功】詳細権限モジュールの全項目が正常動作しました！');
    console.log('================================================');

  } catch (error) {
    console.error('\n🔴 【テスト失敗】例外が発生しました。');
    console.error(error);
    process.exit(1);
  }
}

runTests();
