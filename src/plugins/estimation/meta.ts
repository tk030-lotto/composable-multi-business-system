import { PluginMeta } from '../crm/meta'; // crmから型を借りる（本来は共通ファイルに置くべきですが現状のまま）

export const meta: PluginMeta = {
  id: 'estimation',
  name: '見積管理',
  route: '/plugins/estimation',
  enabled: true,
  category: 'business',
  requiredRole: 'member',
  networkRequired: false,
};
