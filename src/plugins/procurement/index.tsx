/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect, @typescript-eslint/no-unused-vars */
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { getCurrentRole } from '@/modules/advanced-rbac';

interface PurchaseOrderItem {
  id?: number;
  product_id: number | null;
  quantity: number;
  unit_price: number;
}

interface PurchaseOrder {
  id: number;
  purchase_no: string;
  supplier_name: string;
  status: string;
  expense_status: string;
  total_amount: number;
  purchase_date: string;
  items: PurchaseOrderItem[];
  created_at: string;
}

export default function ProcurementPage() {
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // モーダル制御
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<PurchaseOrder | null>(null);

  // フォーム用ステート
  const [formSupplierName, setFormSupplierName] = useState<string>('');
  const [formPurchaseDate, setFormPurchaseDate] = useState<string>('');
  const [formStatus, setFormStatus] = useState<string>('ORDERED');
  const [formItems, setFormItems] = useState<PurchaseOrderItem[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [operatorName, setOperatorName] = useState('Owner');
  const [isStaff, setIsStaff] = useState(false);

  useEffect(() => {
    const currentRole = getCurrentRole();
    setIsStaff(currentRole === 'staff');
    setOperatorName(currentRole === 'staff' ? 'Staff' : 'Owner');
  }, []);

  const loadPurchaseOrders = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/purchases');
      if (!res.ok) throw new Error('仕入データの取得に失敗しました。');
      const data = await res.json();
      if (data.success) {
        setPurchaseOrders(data.data);
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
    loadPurchaseOrders();
  }, [loadPurchaseOrders]);

  const openCreateModal = () => {
    setEditingOrder(null);
    setFormSupplierName('');
    setFormPurchaseDate(new Date().toLocaleDateString('sv-SE'));
    setFormStatus('ORDERED'); // 発注済
    setFormItems([{ product_id: null, quantity: 1, unit_price: 0 }]);
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (order: PurchaseOrder) => {
    setEditingOrder(order);
    setFormSupplierName(order.supplier_name);
    setFormPurchaseDate(new Date(order.purchase_date).toLocaleDateString('sv-SE'));
    setFormStatus(order.status);

    if (order.items && order.items.length > 0) {
      setFormItems(order.items.map((i) => ({ ...i })));
    } else {
      setFormItems([{ product_id: null, quantity: 1, unit_price: 0 }]);
    }

    setFormError(null);
    setIsModalOpen(true);
  };

  const addItem = () => {
    setFormItems([...formItems, { product_id: null, quantity: 1, unit_price: 0 }]);
  };

  const removeItem = (index: number) => {
    if (formItems.length <= 1) return;
    const newItems = [...formItems];
    newItems.splice(index, 1);
    setFormItems(newItems);
  };

  const updateItem = (index: number, field: keyof PurchaseOrderItem, value: any) => {
    const newItems = [...formItems];
    newItems[index] = { ...newItems[index], [field]: value };
    setFormItems(newItems);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formPurchaseDate) {
      setFormError('仕入日（発注日）は必須です。');
      return;
    }
    if (!formSupplierName) {
      setFormError('仕入先名は必須です。');
      return;
    }
    if (formItems.length === 0) {
      setFormError('明細が1件以上必要です。');
      return;
    }

    setIsSaving(true);
    setFormError(null);

    const bodyData = {
      id: editingOrder?.id,
      supplier_name: formSupplierName,
      status: formStatus,
      expense_status: editingOrder?.expense_status || 'UNPAID',
      purchase_date: formPurchaseDate,
      items: formItems,
      changed_by: operatorName,
    };

    try {
      const method = editingOrder ? 'PUT' : 'POST';
      const res = await fetch('/api/purchases', {
        method,
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': operatorName,
        },
        body: JSON.stringify(bodyData),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || '保存中にエラーが発生しました。');
      }

      setIsModalOpen(false);
      loadPurchaseOrders();
    } catch (err: any) {
      setFormError(err.message || '保存中にエラーが発生しました。');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: number, purchase_no: string) => {
    if (!confirm(`伝票番号「${purchase_no}」を削除してもよろしいですか？`)) return;

    try {
      const res = await fetch(`/api/purchases?id=${id}`, {
        method: 'DELETE',
        headers: { 'x-user-id': operatorName },
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || '削除中にエラーが発生しました。');
      }

      loadPurchaseOrders();
    } catch (err: any) {
      setError(err.message || '削除中にエラーが発生しました。');
    }
  };

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString('ja-JP');
    } catch (e) {
      return dateString;
    }
  };

  const calcTotal = (items: PurchaseOrderItem[]) => {
    return items.reduce((sum, item) => sum + Number(item.quantity) * Number(item.unit_price), 0);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', width: '100%' }}>
      <section className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">仕入伝票数</div>
          <div className="stat-value">{isLoading ? '...' : purchaseOrders.length}</div>
          <div className="stat-change up">
            <span>📄</span> 登録済み伝票
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">仕入合計金額</div>
          <div className="stat-value">
            {isLoading
              ? '...'
              : `¥${purchaseOrders.reduce((sum, order) => sum + Number(order.total_amount), 0).toLocaleString()}`}
          </div>
          <div className="stat-change up">
            <span>💸</span> 全期間の合計
          </div>
        </div>
      </section>

      <section className="content-card">
        <div className="card-header-flex">
          <h2 className="card-title-sub">仕入データ一覧</h2>
          <button type="button" className="btn-primary" onClick={openCreateModal}>
            + 新規仕入登録
          </button>
        </div>

        {error && (
          <div className="error-alert" style={{ marginTop: '1rem' }}>
            <span>⚠️</span> {error}
          </div>
        )}

        <div className="table-responsive" style={{ marginTop: '1rem' }}>
          {isLoading ? (
            <div className="loading-state">
              <div className="spinner"></div>
              <p>データを読み込み中...</p>
            </div>
          ) : purchaseOrders.length === 0 ? (
            <div className="empty-state">
              <span>📭</span>
              <p>該当する仕入データが見つかりませんでした。</p>
            </div>
          ) : (
            <table className="mock-table">
              <thead>
                <tr>
                  <th>伝票番号</th>
                  <th>日付</th>
                  <th>仕入先名</th>
                  <th>合計金額</th>
                  <th>ステータス</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {purchaseOrders.map((order) => (
                  <tr key={order.id}>
                    <td>
                      <strong>{order.purchase_no}</strong>
                    </td>
                    <td>{formatDate(order.purchase_date)}</td>
                    <td>{order.supplier_name}</td>
                    <td>¥{Number(order.total_amount).toLocaleString()}</td>
                    <td>
                      <span
                        className={`status-badge ${order.status === 'ORDERED' ? 'status-new' : 'status-completed'}`}
                      >
                        {order.status === 'ORDERED' ? '発注済 (仮仕入)' : '受領済 (入荷済)'}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="action-btn-edit"
                        onClick={() => openEditModal(order)}
                      >
                        詳細/編集
                      </button>
                      {!isStaff && (
                        <button
                          type="button"
                          className="action-btn-delete"
                          onClick={() => handleDelete(order.id, order.purchase_no)}
                        >
                          削除
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {isModalOpen && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div
            className="modal-card"
            style={{ maxWidth: '800px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h2>{editingOrder ? `仕入編集: ${editingOrder.purchase_no}` : '新規仕入登録'}</h2>
              <button type="button" className="close-btn" onClick={() => setIsModalOpen(false)}>
                &times;
              </button>
            </div>

            <form onSubmit={handleSave}>
              <div className="modal-body">
                {formError && (
                  <div className="form-error-alert">
                    <span>⚠️</span> {formError}
                  </div>
                )}

                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label">
                      日付 <span className="required-star">*</span>
                    </label>
                    <input
                      type="date"
                      required
                      value={formPurchaseDate}
                      onChange={(e) => setFormPurchaseDate(e.target.value)}
                      className="form-input"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">
                      仕入先名 <span className="required-star">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={formSupplierName}
                      onChange={(e) => setFormSupplierName(e.target.value)}
                      placeholder="例：株式会社〇〇"
                      className="form-input"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">ステータス</label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value)}
                    className="form-select"
                  >
                    <option value="ORDERED">発注済 (仮仕入)</option>
                    <option value="RECEIVED">受領済 (入荷済)</option>
                  </select>
                </div>

                <div className="form-group" style={{ marginTop: '1.5rem' }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '0.5rem',
                    }}
                  >
                    <label className="form-label" style={{ margin: 0 }}>
                      仕入明細 <span className="required-star">*</span>
                    </label>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ padding: '0.25rem 0.5rem', fontSize: '0.85rem' }}
                      onClick={addItem}
                    >
                      + 行を追加
                    </button>
                  </div>
                  <table className="mock-table" style={{ marginTop: 0 }}>
                    <thead>
                      <tr>
                        <th>商品ID</th>
                        <th>単価 (¥)</th>
                        <th>数量</th>
                        <th>小計</th>
                        <th style={{ width: '50px' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {formItems.map((item, idx) => (
                        <tr key={idx}>
                          <td>
                            <input
                              type="number"
                              className="form-input"
                              placeholder="手動入力"
                              value={item.product_id || ''}
                              onChange={(e) =>
                                updateItem(
                                  idx,
                                  'product_id',
                                  e.target.value ? parseInt(e.target.value, 10) : null
                                )
                              }
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              required
                              min="0"
                              className="form-input"
                              value={item.unit_price}
                              onChange={(e) =>
                                updateItem(idx, 'unit_price', parseFloat(e.target.value))
                              }
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              required
                              min="1"
                              className="form-input"
                              value={item.quantity}
                              onChange={(e) =>
                                updateItem(idx, 'quantity', parseInt(e.target.value, 10))
                              }
                            />
                          </td>
                          <td style={{ verticalAlign: 'middle' }}>
                            ¥{(Number(item.quantity) * Number(item.unit_price)).toLocaleString()}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <button
                              type="button"
                              className="action-btn-delete"
                              onClick={() => removeItem(idx)}
                              disabled={formItems.length <= 1}
                              style={{ padding: '0.2rem 0.5rem' }}
                            >
                              &times;
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={3} style={{ textAlign: 'right', fontWeight: 'bold' }}>
                          合計:
                        </td>
                        <td
                          colSpan={2}
                          style={{
                            fontWeight: 'bold',
                            fontSize: '1.1rem',
                            color: 'var(--primary-color)',
                          }}
                        >
                          ¥{calcTotal(formItems).toLocaleString()}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isSaving}
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={isSaving}
                  style={{ marginLeft: '0.75rem' }}
                >
                  {isSaving ? '保存中...' : editingOrder ? '更新する' : '登録する'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
