import Link from 'next/link';

export default function Home() {
  const plugins = [
    { name: '顧客管理 (CRM)', path: '/plugins/crm' },
    { name: '見積管理', path: '/plugins/estimation' },
    { name: '売上管理', path: '/plugins/sales' },
    { name: '発注・仕入管理', path: '/plugins/procurement' },
    { name: '在庫・商品管理', path: '/plugins/inventory' },
    { name: '決済・消込管理', path: '/plugins/finance' },
  ];

  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1 className="text-3xl font-bold mb-6 text-gray-800">BaseKit Portal</h1>
      <p className="mb-6 text-gray-600">マウント済みプラグイン一覧</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
        {plugins.map((plugin) => (
          <Link
            key={plugin.path}
            href={plugin.path}
            className="block p-6 bg-white border border-gray-200 rounded-lg shadow hover:bg-gray-50 transition-colors"
          >
            <h5 className="text-xl font-bold tracking-tight text-gray-900">{plugin.name}</h5>
          </Link>
        ))}
      </div>
    </div>
  );
}
