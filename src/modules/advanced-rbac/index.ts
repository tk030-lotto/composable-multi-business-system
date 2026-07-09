import { NextRequest } from 'next/server';

/**
 * RBACモジュールが有効かどうかを返します。
 */
export function isRbacEnabled(): boolean {
  return (
    process.env.ENABLE_MODULE_ADVANCED_RBAC === 'true' ||
    process.env.NEXT_PUBLIC_ENABLE_MODULE_ADVANCED_RBAC === 'true'
  );
}

/**
 * 現在のユーザーロールを取得します。
 * クライアントサイドとサーバーサイドの双方に対応しています。
 * Cookie `crm_user_role` が存在しない、または無効な場合はデフォルトで 'owner' を返します。
 */
export function getCurrentRole(request?: NextRequest): 'owner' | 'staff' {
  if (!isRbacEnabled()) {
    return 'owner';
  }

  if (request) {
    // サーバーサイド (NextRequest が渡された場合)
    const roleCookie = request.cookies.get('crm_user_role');
    const role = roleCookie?.value;
    return role === 'staff' ? 'staff' : 'owner';
  } else {
    // クライアントサイド (ブラウザ環境)
    if (typeof document !== 'undefined') {
      const cookies = document.cookie.split(';');
      const roleCookie = cookies.find((item) => item.trim().startsWith('crm_user_role='));
      if (roleCookie) {
        const role = roleCookie.split('=')[1]?.trim();
        return role === 'staff' ? 'staff' : 'owner';
      }
    }
    return 'owner';
  }
}

/**
 * APIリクエストの実行権限をチェックします。
 * 要求される最小ロールが 'owner' で、現在のロールが 'staff' の場合は 403 エラーメッセージを返します。
 */
export function checkApiPermission(
  request: NextRequest,
  requiredRole: 'owner' | 'staff'
): { allowed: boolean; error?: string } {
  if (!isRbacEnabled()) {
    return { allowed: true };
  }

  const currentRole = getCurrentRole(request);

  if (requiredRole === 'owner' && currentRole !== 'owner') {
    return {
      allowed: false,
      error: 'この操作を実行する権限がありません。管理者（Owner）権限が必要です。',
    };
  }

  return { allowed: true };
}
