/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect, react-hooks/exhaustive-deps, @typescript-eslint/no-unused-vars */
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import CustomFieldsModal, { CustomFieldDefinition } from './components/custom-fields';
import { getCurrentRole } from '@/modules/advanced-rbac';

interface Customer {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  status: string;
  custom_fields: {
    memo?: string;
    [key: string]: any;
  };
  created_at: string;
  updated_at: string;
}

export default function HomePage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [logsCount, setLogsCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // カスタムフィールド定義のステート
  const [fieldDefinitions, setFieldDefinitions] = useState<CustomFieldDefinition[]>([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // 検索条件
  const [searchName, setSearchName] = useState('');
  const [searchPhone, setSearchPhone] = useState('');
  const [searchStatus, setSearchStatus] = useState('');

  // モーダル制御
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

  // フォーム用ステート
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formStatus, setFormStatus] = useState('新規');
  const [formMemo, setFormMemo] = useState('');
  const [dynamicFields, setDynamicFields] = useState<{ [key: string]: any }>({});
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // ログインユーザー名 (ヘッダーの管理者ロールと連動)
  const [operatorName, setOperatorName] = useState('Owner');
  const [isStaff, setIsStaff] = useState(false);

  useEffect(() => {
    const currentRole = getCurrentRole();
    setIsStaff(currentRole === 'staff');
    setOperatorName(currentRole === 'staff' ? 'Staff' : 'Owner');
  }, []);

  // カスタムフィールド定義のロード
  const loadFieldDefinitions = useCallback(async () => {
    try {
      const res = await fetch('/api/settings?key=custom_fields');
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setFieldDefinitions(data.data || []);
        }
      }
    } catch (err) {
      console.error('カスタムフィールド定義のロードに失敗しました。', err);
    }
  }, []);

  // 顧客リストのロード
  const loadCustomers = useCallback(async (nameVal = searchName, phoneVal = searchPhone, statusVal = searchStatus) => {
    setIsLoading(true);
    setError(null);
    try {
      const queryParams = new URLSearchParams();
      if (nameVal) queryParams.set('name', nameVal);
      if (phoneVal) queryParams.set('phone', phoneVal);
      if (statusVal) queryParams.set('status', statusVal);

      const res = await fetch(`/api/customers?${queryParams.toString()}`);
      if (!res.ok) {
        throw new Error('顧客データの取得に失敗しました。');
      }
      const data = await res.json();
      if (data.success) {
        setCustomers(data.data);
      } else {
        throw new Error(data.error || '顧客データの取得に失敗しました。');
      }
    } catch (err: any) {
      setError(err.message || 'エラーが発生しました。');
    } finally {
      setIsLoading(false);
    }
  }, [searchName, searchPhone, searchStatus]);

  // ログ件数の取得
  const loadLogsCount = useCallback(async () => {
    // スタッフの場合は監査ログAPIの権限がないためスキップ
    if (getCurrentRole() === 'staff') {
      setLogsCount(0);
      return;
    }
    try {
      const res = await fetch('/api/audit-logs?limit=100');
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          // IMP-04: limit=100 で取得しているため、100件の場合は「100+」として別管理
          setLogsCount(data.data.length >= 100 ? -1 : data.data.length);
        }
      }
    } catch (err) {
      console.error('操作ログの取得に失敗しました。', err);
    }
  }, []);

  // 初回ロード
  useEffect(() => {
    loadCustomers();
    loadLogsCount();
    loadFieldDefinitions();
  }, [loadCustomers, loadLogsCount, loadFieldDefinitions]);

  // 検索実行
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadCustomers(searchName, searchPhone, searchStatus);
  };

  // 検索リセット
  const handleReset = () => {
    setSearchName('');
    setSearchPhone('');
    setSearchStatus('');
    loadCustomers('', '', '');
  };

  // 新規登録モーダルを開く
  const openCreateModal = () => {
    setEditingCustomer(null);
    setFormName('');
    setFormEmail('');
    setFormPhone('');
    setFormStatus('新規');
    setFormMemo('');
    setDynamicFields({});
    setFormError(null);
    setIsModalOpen(true);
  };

  // 編集モーダルを開く
  const openEditModal = (customer: Customer) => {
    setEditingCustomer(customer);
    setFormName(customer.name);
    setFormEmail(customer.email || '');
    setFormPhone(customer.phone || '');
    setFormStatus(customer.status);
    setFormMemo(customer.custom_fields?.memo || '');

    // 動的フィールドの初期値マッピング
    const initialDynamic: { [key: string]: any } = {};
    fieldDefinitions.forEach(field => {
      initialDynamic[field.key] = customer.custom_fields?.[field.key] !== undefined
        ? customer.custom_fields[field.key]
        : '';
    });
    setDynamicFields(initialDynamic);

    setFormError(null);
    setIsModalOpen(true);
  };

  // 保存処理 (新規/編集)
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      setFormError('名前は必須項目です。');
      return;
    }

    setIsSaving(true);
    setFormError(null);

    const bodyData = {
      id: editingCustomer?.id,
      name: formName,
      email: formEmail || null,
      phone: formPhone || null,
      status: formStatus,
      custom_fields: {
        ...editingCustomer?.custom_fields,
        ...dynamicFields,
        memo: formMemo,
      },
      changed_by: operatorName,
    };

    try {
      const method = editingCustomer ? 'PUT' : 'POST';
      const res = await fetch('/api/customers', {
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
      loadCustomers();
      loadLogsCount();
    } catch (err: any) {
      setFormError(err.message || '保存中にエラーが発生しました。');
    } finally {
      setIsSaving(false);
    }
  };

  // 削除処理 (論理削除)
  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`顧客「${name}」を削除してもよろしいですか？\n（この操作は論理削除であり、履歴は保持されます）`)) {
      return;
    }

    try {
      const res = await fetch(`/api/customers?id=${id}`, {
        method: 'DELETE',
        headers: {
          'x-user-id': operatorName,
        },
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || '削除中にエラーが発生しました。');
      }

      loadCustomers();
      loadLogsCount();
    } catch (err: any) {
      // QOL-01: alert() を排除し、テーブル上部のエラーバナーへ表示
      setError(err.message || '削除中にエラーが発生しました。');
    }
  };

  // 日時フォーマット
  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleString('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      return dateString;
    }
  };

  // 指標カード用計算
  const totalCustomers = customers.length;

  // 今月の新規登録顧客数を算出
  const thisMonthNewCustomers = customers.filter((customer) => {
    if (!customer.created_at) return false;
    const date = new Date(customer.created_at);
    const now = new Date();
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  }).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', width: '100%' }}>
      {/* 指標カードセクション */}
      <section className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">顧客総数 (稼働中)</div>
          <div className="stat-value">{isLoading ? '...' : totalCustomers}</div>
          <div className="stat-change up">
            <span>📊</span> データベース同期済
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">今月の新規登録</div>
          <div className="stat-value">{isLoading ? '...' : thisMonthNewCustomers}</div>
          <div className="stat-change up">
            <span>✨</span> 今月登録の顧客数
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">システム操作履歴</div>
          {/* IMP-04: -1 は 100+件超えを意味する特殊値 */}
          <div className="stat-value">{isStaff ? '非表示' : logsCount === -1 ? '100+' : logsCount}</div>
          <div className="stat-change neutral">
            <span>🛡️</span> {isStaff ? '管理者のみ閲覧可能' : '100% 監査証跡監視中'}
          </div>
        </div>
      </section>

      {/* メインの顧客一覧セクション */}
      <section className="content-card">
        <div className="card-header-flex">
          <h2 className="card-title-sub">顧客データベース (PostgreSQL接続中)</h2>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            {!isStaff && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setIsSettingsOpen(true)}
              >
                ⚙️ フィールド設定
              </button>
            )}
            <button
              type="button"
              className="btn-primary"
              onClick={openCreateModal}
            >
              + 顧客新規登録
            </button>
          </div>
        </div>

        {/* 検索・フィルタリングフォーム */}
        <form onSubmit={handleSearch} className="search-filter-bar">
          <div className="search-inputs">
            <input
              type="text"
              placeholder="顧客名で検索..."
              value={searchName}
              onChange={(e) => setSearchName(e.target.value)}
              className="form-input-inline"
            />
            <input
              type="text"
              placeholder="電話番号で検索..."
              value={searchPhone}
              onChange={(e) => setSearchPhone(e.target.value)}
              className="form-input-inline"
            />
            <select
              value={searchStatus}
              onChange={(e) => setSearchStatus(e.target.value)}
              className="form-select-inline"
            >
              <option value="">すべてのステータス</option>
              <option value="新規">新規</option>
              <option value="対応中">対応中</option>
              <option value="保留">保留</option>
              <option value="成約">成約</option>
            </select>
          </div>
          <div className="search-actions">
            <button type="submit" className="btn-secondary">検索</button>
            <button type="button" onClick={handleReset} className="btn-tertiary">クリア</button>
          </div>
        </form>

        {error && (
          <div className="error-alert">
            <span>⚠️</span> {error}
          </div>
        )}

        <div className="table-responsive" style={{ marginTop: '1rem' }}>
          {isLoading ? (
            <div className="loading-state">
              <div className="spinner"></div>
              <p>データを読み込み中...</p>
            </div>
          ) : customers.length === 0 ? (
            <div className="empty-state">
              <span>📭</span>
              <p>該当する顧客データが見つかりませんでした。</p>
            </div>
          ) : (
            <table className="mock-table">
              <thead>
                <tr>
                  <th>顧客名</th>
                  <th>メールアドレス</th>
                  <th>電話番号</th>
                  <th>カスタム項目</th>
                  <th>ステータス</th>
                  <th>登録日時</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => (
                  <tr key={customer.id}>
                    <td>
                      <strong>{customer.name}</strong>
                    </td>
                    <td>{customer.email || <span className="null-placeholder">-</span>}</td>
                    <td>{customer.phone || <span className="null-placeholder">-</span>}</td>
                    <td>
                      {fieldDefinitions.length === 0 ? (
                        <span className="null-placeholder">-</span>
                      ) : (
                        <div className="dynamic-fields-cell">
                          {fieldDefinitions.map(fd => {
                            const val = customer.custom_fields?.[fd.key];
                            if (val === undefined || val === null || val === '') return null;
                            return (
                              <div key={fd.key} className="field-preview-badge">
                                <span className="badge-label">{fd.label}:</span>
                                <span className="badge-value">{val}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className={`status-badge ${
                        customer.status === '新規' ? 'status-new' :
                        customer.status === '対応中' ? 'status-active' :
                        customer.status === '保留' ? 'status-pending' :
                        customer.status === '成約' ? 'status-completed' : ''
                      }`}>
                        {customer.status}
                      </span>
                    </td>
                    <td>{formatDate(customer.created_at)}</td>
                    <td>
                      <button
                        type="button"
                        className="action-btn-edit"
                        onClick={() => openEditModal(customer)}
                      >
                        詳細/編集
                      </button>
                      {!isStaff && (
                        <button
                          type="button"
                          className="action-btn-delete"
                          onClick={() => handleDelete(customer.id, customer.name)}
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

      {/* 新規登録・編集モーダル */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingCustomer ? '顧客情報の詳細・編集' : '新規顧客の登録'}</h2>
              <button
                type="button"
                className="close-btn"
                onClick={() => setIsModalOpen(false)}
              >
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

                <div className="form-group">
                  <label className="form-label">顧客名 <span className="required-star">*</span></label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="例：山田 太郎"
                    className="form-input"
                  />
                </div>

                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label">メールアドレス</label>
                    <input
                      type="email"
                      value={formEmail}
                      onChange={(e) => setFormEmail(e.target.value)}
                      placeholder="example@mail.com"
                      className="form-input"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">電話番号</label>
                    <input
                      type="text"
                      value={formPhone}
                      onChange={(e) => setFormPhone(e.target.value)}
                      placeholder="090-0000-0000"
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
                    <option value="新規">新規</option>
                    <option value="対応中">対応中</option>
                    <option value="保留">保留</option>
                    <option value="成約">成約</option>
                  </select>
                </div>

                {/* 動的カスタムフィールド群 */}
                {fieldDefinitions.map((field) => (
                  <div className="form-group" key={field.key}>
                    <label className="form-label">{field.label}</label>
                    {field.type === 'select' ? (
                      <select
                        value={dynamicFields[field.key] || ''}
                        onChange={(e) => setDynamicFields({
                          ...dynamicFields,
                          [field.key]: e.target.value
                        })}
                        className="form-select"
                      >
                        <option value="">未選択</option>
                        {field.options?.map(opt => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={field.type === 'number' ? 'number' : 'text'}
                        value={dynamicFields[field.key] || ''}
                        onChange={(e) => setDynamicFields({
                          ...dynamicFields,
                          [field.key]: field.type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value
                        })}
                        placeholder={`${field.label}を入力してください`}
                        className="form-input"
                      />
                    )}
                  </div>
                ))}

                <div className="form-group">
                  <label className="form-label">メモ (顧客情報補足)</label>
                  <textarea
                    value={formMemo}
                    onChange={(e) => setFormMemo(e.target.value)}
                    placeholder="自由に入力してください（ご要望、アプローチ履歴など）"
                    rows={4}
                    className="form-textarea"
                  />
                </div>

                {editingCustomer && (
                  <div className="system-meta-info">
                    <p>データ登録日時: {formatDate(editingCustomer.created_at)}</p>
                    <p>最終更新日時: {formatDate(editingCustomer.updated_at)}</p>
                  </div>
                )}
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
                  {isSaving ? '保存中...' : (editingCustomer ? '更新する' : '登録する')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* カスタムフィールド設定モーダル */}
      <CustomFieldsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onSave={loadFieldDefinitions}
      />
    </div>
  );
}
