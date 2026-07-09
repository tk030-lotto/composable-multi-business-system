/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect, react-hooks/exhaustive-deps, @typescript-eslint/no-unused-vars */
'use client';

import React, { useState, useEffect } from 'react';

export interface CustomFieldDefinition {
  key: string;
  label: string;
  type: 'text' | 'number' | 'select';
  options?: string[];
}

interface CustomFieldsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
}

export default function CustomFieldsModal({ isOpen, onClose, onSave }: CustomFieldsModalProps) {
  const [fields, setFields] = useState<CustomFieldDefinition[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 新規フィールド登録用のフォームステート
  const [newKey, setNewKey] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newType, setNewType] = useState<'text' | 'number' | 'select'>('text');
  const [newOptionsText, setNewOptionsText] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // 設定のロード
  const loadSettings = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/settings?key=custom_fields');
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.data) {
          setFields(data.data);
        } else {
          setFields([]);
        }
      }
    } catch (err) {
      console.error('カスタムフィールド定義のロードに失敗しました。', err);
      setError('設定のロードに失敗しました。');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadSettings();
    }
  }, [isOpen]);


  // フィールドの追加
  const handleAddField = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const key = newKey.trim();
    const label = newLabel.trim();

    if (!key) {
      setFormError('キー名は必須です。');
      return;
    }
    // 半角英数字とアンダースコアのみ許可
    if (!/^[a-zA-Z0-9_]+$/.test(key)) {
      setFormError('キー名は半角英数字とアンダースコア(_)のみ使用できます。');
      return;
    }

    if (key === 'memo') {
      setFormError('「memo」はシステムで予約されているため使用できません。');
      return;
    }

    if (fields.some(f => f.key === key)) {
      setFormError(`キー名「${key}」は既に登録されています。`);
      return;
    }

    if (!label) {
      setFormError('表示ラベルは必須です。');
      return;
    }

    let options: string[] | undefined = undefined;
    if (newType === 'select') {
      const parsedOptions = newOptionsText
        .split(/[,，\n]/)
        .map(o => o.trim())
        .filter(o => o.length > 0);
      
      if (parsedOptions.length === 0) {
        setFormError('選択肢タイプの場合は、選択肢を1つ以上入力してください。');
        return;
      }
      options = parsedOptions;
    }

    const newField: CustomFieldDefinition = {
      key,
      label,
      type: newType,
      ...(options ? { options } : {})
    };

    setFields([...fields, newField]);

    // フォームリセット
    setNewKey('');
    setNewLabel('');
    setNewType('text');
    setNewOptionsText('');
  };

  // フィールドの削除
  const handleDeleteField = (index: number) => {
    const newFields = fields.filter((_, i) => i !== index);
    setFields(newFields);
  };

  // 順序の変更 (上へ)
  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const newFields = [...fields];
    const temp = newFields[index];
    newFields[index] = newFields[index - 1];
    newFields[index - 1] = temp;
    setFields(newFields);
  };

  // 順序の変更 (下へ)
  const handleMoveDown = (index: number) => {
    if (index === fields.length - 1) return;
    const newFields = [...fields];
    const temp = newFields[index];
    newFields[index] = newFields[index + 1];
    newFields[index + 1] = temp;
    setFields(newFields);
  };

  // 保存処理
  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          key: 'custom_fields',
          value: fields
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || '設定の保存に失敗しました。');
      }

      onSave();
      onClose();
    } catch (err: any) {
      setError(err.message || '保存中にエラーが発生しました。');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card field-settings-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>⚙️ カスタムフィールド動的設定</h2>
          <button type="button" className="close-btn" onClick={onClose}>&times;</button>
        </div>

        <div className="modal-body settings-modal-body">
          {error && (
            <div className="error-alert">
              <span>⚠️</span> {error}
            </div>
          )}

          <div className="settings-grid">
            {/* 左側: 現在の登録フィールド一覧 */}
            <div className="fields-list-section">
              <h3>登録済みのフィールド (表示順)</h3>
              {isLoading ? (
                <div className="loading-state-mini">
                  <div className="spinner-mini"></div>
                  <p>読み込み中...</p>
                </div>
              ) : fields.length === 0 ? (
                <div className="empty-state-mini">
                  <span>📭</span>
                  <p>追加されたフィールドはありません。右側のフォームから追加してください。</p>
                </div>
              ) : (
                <div className="fields-list">
                  {fields.map((field, index) => (
                    <div key={field.key} className="field-item-card">
                      <div className="field-item-info">
                        <div className="field-item-header">
                          <strong>{field.label}</strong>
                          <span className="field-item-key">({field.key})</span>
                        </div>
                        <div className="field-item-meta">
                          <span className="type-badge">{field.type === 'text' ? 'テキスト' : field.type === 'number' ? '数値' : '選択肢'}</span>
                          {field.type === 'select' && field.options && (
                            <div className="options-preview">
                              {field.options.map(o => (
                                <span key={o} className="option-chip">{o}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="field-item-actions">
                        <button
                          type="button"
                          className="sort-btn"
                          disabled={index === 0}
                          onClick={() => handleMoveUp(index)}
                          title="上へ"
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          className="sort-btn"
                          disabled={index === fields.length - 1}
                          onClick={() => handleMoveDown(index)}
                          title="下へ"
                        >
                          ▼
                        </button>
                        <button
                          type="button"
                          className="delete-item-btn"
                          onClick={() => handleDeleteField(index)}
                          title="削除"
                        >
                          &times;
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 右側: フィールド新規追加フォーム */}
            <div className="fields-add-section">
              <h3>➕ フィールドの新規追加</h3>
              <form onSubmit={handleAddField} className="field-add-form">
                {formError && (
                  <div className="form-error-alert">
                    <span>⚠️</span> {formError}
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">キー名 (システム識別用) <span className="required-star">*</span></label>
                  <input
                    type="text"
                    required
                    value={newKey}
                    onChange={(e) => setNewKey(e.target.value)}
                    placeholder="例: hobby (半角英数字)"
                    className="form-input"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">表示ラベル (日本語名) <span className="required-star">*</span></label>
                  <input
                    type="text"
                    required
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    placeholder="例: 趣味"
                    className="form-input"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">入力タイプ</label>
                  <select
                    value={newType}
                    onChange={(e) => setNewType(e.target.value as any)}
                    className="form-select"
                  >
                    <option value="text">テキスト</option>
                    <option value="number">数値</option>
                    <option value="select">選択肢 (ドロップダウン)</option>
                  </select>
                </div>

                {newType === 'select' && (
                  <div className="form-group">
                    <label className="form-label">選択肢 (カンマ区切りまたは改行で入力) <span className="required-star">*</span></label>
                    <textarea
                      required
                      value={newOptionsText}
                      onChange={(e) => setNewOptionsText(e.target.value)}
                      placeholder="例: 選択肢A, 選択肢B, 選択肢C"
                      rows={3}
                      className="form-textarea"
                    />
                  </div>
                )}

                <button type="submit" className="btn-secondary btn-block" style={{ marginTop: '1rem' }}>
                  一覧に追加する
                </button>
              </form>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button
            type="button"
            className="btn-secondary"
            onClick={onClose}
            disabled={isSaving}
          >
            キャンセル
          </button>
          <button
            type="button"
            className="btn-primary btn-save-gradient"
            onClick={handleSave}
            disabled={isSaving || isLoading}
            style={{ marginLeft: '0.75rem' }}
          >
            {isSaving ? '保存中...' : '変更をDBに保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
