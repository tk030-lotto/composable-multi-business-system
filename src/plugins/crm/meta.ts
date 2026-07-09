export type PluginMeta = {
  id: string;
  name: string;
  route: string;
  enabled: boolean;
  icon?: string;
  category: 'business' | 'operation' | 'defense' | 'ai';
  requiredRole?: 'admin' | 'member';
  networkRequired?: boolean;
};

export const meta: PluginMeta = {
  id: 'crm',
  name: '顧客管理',
  route: '/plugins/crm',
  enabled: true,
  category: 'business',
  requiredRole: 'member',
  networkRequired: false,
};
