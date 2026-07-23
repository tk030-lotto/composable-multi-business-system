export type Role = 'ADMIN' | 'MANAGER' | 'USER';

export type PluginId = 'customers' | 'estimates' | 'sales' | 'purchases' | 'inventory' | 'finance' | 'settings' | '*';

export const ROLE_PERMISSIONS: Record<Role, PluginId[]> = {
  ADMIN: ['*'],
  MANAGER: ['customers', 'estimates', 'sales', 'purchases', 'inventory', 'finance'], // settings以外
  USER: ['sales', 'inventory'], // 売上と在庫のみ
};

/**
 * 指定したRoleが特定のプラグインにアクセス可能かを判定する
 */
export function hasPluginAccess(role: Role, pluginId: string): boolean {
  const permissions = ROLE_PERMISSIONS[role];
  if (!permissions) return false;
  
  if (permissions.includes('*')) return true;
  
  return permissions.includes(pluginId as PluginId);
}
