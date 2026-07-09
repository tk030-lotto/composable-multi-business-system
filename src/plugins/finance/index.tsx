/* eslint-disable react-hooks/set-state-in-effect */
'use client';

import { useState, useEffect } from 'react';

type Receivable = {
  id: number;
  sales_no: string;
  order_type: string;
  payment_status: string;
  total_amount: string;
  sales_date: string;
};

type Payable = {
  id: number;
  purchase_no: string;
  supplier_name: string;
  expense_status: string;
  total_amount: string;
  purchase_date: string;
};

export default function FinancePlugin() {
  const [activeTab, setActiveTab] = useState<'receivables' | 'payables'>('receivables');
  const [receivables, setReceivables] = useState<Receivable[]>([]);
  const [payables, setPayables] = useState<Payable[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchReceivables = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/finance/receivables?status=UNPAID');
      const data = await res.json();
      if (data.success) {
        setReceivables(data.data);
      } else {
        console.error(data.error);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchPayables = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/finance/payables?status=UNPAID');
      const data = await res.json();
      if (data.success) {
        setPayables(data.data);
      } else {
        console.error(data.error);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'receivables') {
      fetchReceivables();
    } else {
      fetchPayables();
    }
  }, [activeTab]);

  const markAsPaidReceivable = async (id: number) => {
    if (!confirm('この売掛金を入金済みにしますか？')) return;
    try {
      const res = await fetch('/api/finance/receivables', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, payment_status: 'PAID' }),
      });
      const data = await res.json();
      if (data.success) {
        fetchReceivables();
      } else {
        alert(data.error || 'エラーが発生しました');
      }
    } catch (err) {
      console.error(err);
      alert('通信エラーが発生しました');
    }
  };

  const markAsPaidPayable = async (id: number) => {
    if (!confirm('この買掛金を支払済みにしますか？')) return;
    try {
      const res = await fetch('/api/finance/payables', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, expense_status: 'PAID' }),
      });
      const data = await res.json();
      if (data.success) {
        fetchPayables();
      } else {
        alert(data.error || 'エラーが発生しました');
      }
    } catch (err) {
      console.error(err);
      alert('通信エラーが発生しました');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">決済管理 (Finance)</h2>
      </div>

      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveTab('receivables')}
          className={`py-2 px-4 border-b-2 font-medium text-sm ${
            activeTab === 'receivables'
              ? 'border-indigo-500 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          売掛金（未入金）
        </button>
        <button
          onClick={() => setActiveTab('payables')}
          className={`py-2 px-4 border-b-2 font-medium text-sm ${
            activeTab === 'payables'
              ? 'border-indigo-500 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          買掛金（未払い）
        </button>
      </div>

      <div className="bg-white shadow rounded-lg p-4">
        {loading ? (
          <p className="text-gray-500">読み込み中...</p>
        ) : activeTab === 'receivables' ? (
          <div>
            {receivables.length === 0 ? (
              <p className="text-gray-500">未入金の売上データはありません。</p>
            ) : (
              <table className="min-w-full divide-y divide-gray-200">
                <thead>
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      伝票番号
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      売上日
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      金額
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {receivables.map((r) => (
                    <tr key={r.id}>
                      <td className="px-4 py-2 text-sm text-gray-900">{r.sales_no}</td>
                      <td className="px-4 py-2 text-sm text-gray-500">
                        {new Date(r.sales_date).toLocaleDateString('ja-JP')}
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-900">
                        ¥{Number(r.total_amount).toLocaleString()}
                      </td>
                      <td className="px-4 py-2 text-sm">
                        <button
                          onClick={() => markAsPaidReceivable(r.id)}
                          className="bg-indigo-600 text-white px-3 py-1 rounded text-sm hover:bg-indigo-700"
                        >
                          消込 (入金済にする)
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ) : (
          <div>
            {payables.length === 0 ? (
              <p className="text-gray-500">未払いの仕入データはありません。</p>
            ) : (
              <table className="min-w-full divide-y divide-gray-200">
                <thead>
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      伝票番号
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      仕入先
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      仕入日
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      金額
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {payables.map((p) => (
                    <tr key={p.id}>
                      <td className="px-4 py-2 text-sm text-gray-900">{p.purchase_no}</td>
                      <td className="px-4 py-2 text-sm text-gray-900">{p.supplier_name}</td>
                      <td className="px-4 py-2 text-sm text-gray-500">
                        {new Date(p.purchase_date).toLocaleDateString('ja-JP')}
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-900">
                        ¥{Number(p.total_amount).toLocaleString()}
                      </td>
                      <td className="px-4 py-2 text-sm">
                        <button
                          onClick={() => markAsPaidPayable(p.id)}
                          className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700"
                        >
                          消込 (支払済にする)
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
