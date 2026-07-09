import { PluginMeta } from '../crm/meta'; // crmから型を借りる

export const meta: PluginMeta = {
  id: 'sales',
  name: '売上管理',
  route: '/plugins/sales',
  enabled: true,
  category: 'business',
  requiredRole: 'member',
  networkRequired: false,
};
