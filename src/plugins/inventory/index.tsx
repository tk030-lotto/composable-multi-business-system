/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect */
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { getCurrentRole } from '@/modules/advanced-rbac';

interface Product {
  id: number;
  product_code: string;
  name: string;
  sales_price: number;
  purchase_price: number;
  logical_stock: number;
  physical_stock: number;
  created_at: string;
}

export default function InventoryPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // モーダル制御
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // フォーム用ステート
  const [formCode, setFormCode] = useState<string>('');
  const [formName, setFormName] = useState<string>('');
  const [formSalesPrice, setFormSalesPrice] = useState<number>(0);
  const [formPurchasePrice, setFormPurchasePrice] = useState<number>(0);
  const [formLogicalStock, setFormLogicalStock] = useState<number>(0);
  const [formPhysicalStock, setFormPhysicalStock] = useState<number>(0);

  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [operatorName, setOperatorName] = useState('Owner');
  const [isStaff, setIsStaff] = useState(false);

  useEffect(() => {
    const currentRole = getCurrentRole();
    setIsStaff(currentRole === 'staff');
    setOperatorName(currentRole === 'staff' ? 'Staff' : 'Owner');
  }, []);

  const loadProducts = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/products');
      if (!res.ok) throw new Error('商品データの取得に失敗しました。');
      const data = await res.json();
      if (data.success) {
        setProducts(data.data);
      } else {
        throw new Error(data.error || 'データの取得に失敗しました。');
      }
    } catch (err: any) {
      setError(err.message || 'エラーが発生しました。');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const openCreateModal = () => {
    setEditingProduct(null);
    setFormCode('');
    setFormName('');
    setFormSalesPrice(0);
    setFormPurchasePrice(0);
    setFormLogicalStock(0);
    setFormPhysicalStock(0);
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (product: Product) => {
    setEditingProduct(product);
    setFormCode(product.product_code);
    setFormName(product.name);
    setFormSalesPrice(product.sales_price);
    setFormPurchasePrice(product.purchase_price);
    setFormLogicalStock(product.logical_stock);
    setFormPhysicalStock(product.physical_stock);
    setFormError(null);
    setIsModalOpen(true);
  };

  const saveProduct = async () => {
    if (!formCode || !formName) {
      setFormError('商品コードと商品名は必須です。');
      return;
    }

    setIsSaving(true);
    setFormError(null);

    try {
      const payload = {
        product_code: formCode,
        name: formName,
        sales_price: formSalesPrice,
        purchase_price: formPurchasePrice,
        logical_stock: formLogicalStock,
        physical_stock: formPhysicalStock,
      };

      const url = editingProduct ? `/api/products/${editingProduct.id}` : '/api/products';
      const method = editingProduct ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'x-operator-id': operatorName,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || '保存に失敗しました。');
      }

      setIsModalOpen(false);
      loadProducts();
    } catch (err: any) {
      setFormError(err.message || 'エラーが発生しました。');
    } finally {
      setIsSaving(false);
    }
  };

  const deleteProduct = async (id: number) => {
    if (!confirm('この商品を削除してもよろしいですか？（論理削除されます）')) return;

    try {
      const res = await fetch(`/api/products/${id}`, {
        method: 'DELETE',
        headers: {
          'x-operator-id': operatorName,
        },
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || '削除に失敗しました。');
      }
      loadProducts();
    } catch (err: any) {
      alert(err.message || 'エラーが発生しました。');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">在庫・商品マスター管理</h2>
          <p className="text-sm text-gray-500 mt-1">
            商品の基本情報および論理・物理在庫を管理します。
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded shadow transition-colors"
        >
          ＋ 新規商品登録
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded text-red-700">
          <p>{error}</p>
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-10 text-gray-500">読み込み中...</div>
      ) : (
        <div className="bg-white shadow overflow-hidden sm:rounded-lg">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  商品コード
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  商品名
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  販売単価 / 仕入単価
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  論理在庫 / 物理在庫
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {products.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-gray-500">
                    商品データがありません。
                  </td>
                </tr>
              ) : (
                products.map((product) => (
                  <tr key={product.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {product.product_code}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {product.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 text-right">
                      <div className="text-blue-600">
                        ¥{Number(product.sales_price).toLocaleString()}
                      </div>
                      <div className="text-red-600 text-xs">
                        ¥{Number(product.purchase_price).toLocaleString()}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 text-right">
                      <div className="font-bold text-gray-800">{product.logical_stock}</div>
                      <div className="text-gray-500 text-xs">{product.physical_stock}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => openEditModal(product)}
                        className="text-purple-600 hover:text-purple-900 mr-4"
                      >
                        編集
                      </button>
                      <button
                        onClick={() => deleteProduct(product.id)}
                        className="text-red-600 hover:text-red-900"
                        disabled={isStaff}
                        title={isStaff ? 'スタッフは削除できません' : ''}
                      >
                        削除
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* モーダル */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex justify-between items-center sticky top-0 bg-white z-10">
              <h3 className="text-lg font-bold text-gray-900">
                {editingProduct ? '商品を編集' : '新規商品登録'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 hover:text-gray-500"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-6">
              {formError && (
                <div className="bg-red-50 text-red-600 p-3 rounded text-sm font-medium">
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    商品コード <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formCode}
                    onChange={(e) => setFormCode(e.target.value)}
                    className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-purple-500 focus:border-purple-500 text-gray-900"
                    placeholder="例: ITEM-001"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    商品名 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-purple-500 focus:border-purple-500 text-gray-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t pt-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">販売単価</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <span className="text-gray-500 sm:text-sm">¥</span>
                    </div>
                    <input
                      type="number"
                      value={formSalesPrice}
                      onChange={(e) => setFormSalesPrice(Number(e.target.value))}
                      className="w-full border border-gray-300 rounded pl-7 pr-3 py-2 focus:ring-purple-500 focus:border-purple-500 text-gray-900"
                      min="0"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">仕入単価</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <span className="text-gray-500 sm:text-sm">¥</span>
                    </div>
                    <input
                      type="number"
                      value={formPurchasePrice}
                      onChange={(e) => setFormPurchasePrice(Number(e.target.value))}
                      className="w-full border border-gray-300 rounded pl-7 pr-3 py-2 focus:ring-purple-500 focus:border-purple-500 text-gray-900"
                      min="0"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t pt-4 bg-gray-50 p-4 rounded">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    論理在庫 <span className="text-xs text-gray-500">(手動調整用)</span>
                  </label>
                  <input
                    type="number"
                    value={formLogicalStock}
                    onChange={(e) => setFormLogicalStock(Number(e.target.value))}
                    className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-purple-500 focus:border-purple-500 text-gray-900"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    販売・仕入伝票の登録時に自動増減します。
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    物理在庫 <span className="text-xs text-gray-500">(手動調整用)</span>
                  </label>
                  <input
                    type="number"
                    value={formPhysicalStock}
                    onChange={(e) => setFormPhysicalStock(Number(e.target.value))}
                    className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-purple-500 focus:border-purple-500 text-gray-900"
                  />
                  <p className="text-xs text-gray-500 mt-1">出荷・入荷処理時に自動増減します。</p>
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 bg-gray-50 flex justify-end space-x-3 rounded-b-lg">
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded text-gray-700 bg-white hover:bg-gray-50"
                disabled={isSaving}
              >
                キャンセル
              </button>
              <button
                onClick={saveProduct}
                disabled={isSaving}
                className="px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50"
              >
                {isSaving ? '保存中...' : '保存する'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
