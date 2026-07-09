-- 1. 監査ログテーブル
CREATE TABLE audit_logs (
    id SERIAL PRIMARY KEY,
    table_name VARCHAR(50) NOT NULL,                             -- 対象のテーブル名
    record_id INT NOT NULL,                                      -- 対象のエンティティID
    action VARCHAR(20) NOT NULL,                                 -- CREATE, UPDATE, DELETE
    changed_by VARCHAR(255) DEFAULT 'SYSTEM',                    -- セッションから取得する操作者
    old_data JSONB,                                              -- 変更前のレコード（JSONB）
    new_data JSONB,                                              -- 変更後のレコード（JSONB）
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. 冪等性キー管理テーブル（二重送信・多重決済防止用）
CREATE TABLE idempotency_keys (
    id SERIAL PRIMARY KEY,
    key VARCHAR(255) UNIQUE NOT NULL,                            -- クライアントから送信された冪等性キー
    request_hash VARCHAR(255) NOT NULL,                          -- リクエストボディのハッシュ値
    response_body TEXT NOT NULL,                                 -- 処理済みのキャッシュレスポンス
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. 全自動ロギング用トリガー関数（操作者の動的記録に対応）
CREATE OR REPLACE FUNCTION log_all_changes()
RETURNS TRIGGER AS $$
DECLARE
    current_user_id VARCHAR(255);
BEGIN
    -- セッション変数から操作ユーザーIDを取得（設定されていなければ 'SYSTEM'）
    BEGIN
        current_user_id := current_setting('app.current_user_id', true);
    EXCEPTION WHEN OTHERS THEN
        current_user_id := 'SYSTEM';
    END;

    IF (current_user_id IS NULL OR current_user_id = '') THEN
        current_user_id := 'SYSTEM';
    END IF;

    -- INSERT（作成）時
    IF (TG_OP = 'INSERT') THEN
        INSERT INTO audit_logs(table_name, record_id, action, changed_by, new_data)
        VALUES (TG_TABLE_NAME, NEW.id, 'CREATE', current_user_id, to_jsonb(NEW));

    -- UPDATE（更新）時
    ELSIF (TG_OP = 'UPDATE') THEN
        -- 変更がない場合はログを記録しない（パフォーマンス最適化）
        IF (OLD IS DISTINCT FROM NEW) THEN
            INSERT INTO audit_logs(table_name, record_id, action, changed_by, old_data, new_data)
            VALUES (TG_TABLE_NAME, NEW.id, 'UPDATE', current_user_id, to_jsonb(OLD), to_jsonb(NEW));
        END IF;

    -- DELETE（物理削除）時
    ELSIF (TG_OP = 'DELETE') THEN
        INSERT INTO audit_logs(table_name, record_id, action, changed_by, old_data)
        VALUES (TG_TABLE_NAME, OLD.id, 'DELETE', current_user_id, to_jsonb(OLD));
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. トリガーの適用（各主要テーブルに自動バインド）
-- 顧客管理
CREATE TABLE customers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    status VARCHAR(50) DEFAULT '新規',
    custom_fields JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL              -- 論理削除用
);
CREATE TRIGGER trg_customers_audit AFTER INSERT OR UPDATE OR DELETE ON customers FOR EACH ROW EXECUTE FUNCTION log_all_changes();

-- 商品・在庫マスター
CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    product_code VARCHAR(50) NOT NULL,                           -- UNIQUE制約は部分インデックス側で定義
    name VARCHAR(255) NOT NULL,
    sales_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    purchase_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    logical_stock INT NOT NULL DEFAULT 0,
    physical_stock INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL              -- 論理削除用
);
-- 論理削除を考慮した部分ユニークインデックス（削除されていないコードのみ重複不可）
CREATE UNIQUE INDEX idx_unique_product_code ON products (product_code) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_products_audit AFTER INSERT OR UPDATE OR DELETE ON products FOR EACH ROW EXECUTE FUNCTION log_all_changes();

-- 売上・見積管理
CREATE TABLE sales_orders (
    id SERIAL PRIMARY KEY,
    sales_no VARCHAR(50) NOT NULL,                                -- 自動採番コード（部分インデックスでユニーク化）
    customer_id INT,                                             -- 論理参照（物理FKなし）
    order_type VARCHAR(20) NOT NULL DEFAULT 'ACTUAL',            -- ESTIMATE / ACTUAL
    payment_method VARCHAR(20) NOT NULL DEFAULT 'CASH',          -- CASH / BANK
    status VARCHAR(20) NOT NULL DEFAULT 'ORDERED',               -- ORDERED / SHIPPED
    payment_status VARCHAR(20) NOT NULL DEFAULT 'UNPAID',         -- UNPAID / PAID
    total_amount NUMERIC(12, 2) NOT NULL,
    sales_date DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL              -- 論理削除用
);
-- 論理削除を考慮した部分ユニークインデックス
CREATE UNIQUE INDEX idx_unique_sales_no ON sales_orders (sales_no) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_sales_orders_audit AFTER INSERT OR UPDATE OR DELETE ON sales_orders FOR EACH ROW EXECUTE FUNCTION log_all_changes();

CREATE TABLE sales_order_items (
    id SERIAL PRIMARY KEY,
    sales_order_id INT REFERENCES sales_orders(id) ON DELETE CASCADE,
    product_id INT,                                               -- 論理参照（物理FKなし）
    quantity INT NOT NULL,
    unit_price NUMERIC(12, 2) NOT NULL
);
-- 売上明細の変更も自動監査ログへ強制記録
CREATE TRIGGER trg_sales_order_items_audit AFTER INSERT OR UPDATE OR DELETE ON sales_order_items FOR EACH ROW EXECUTE FUNCTION log_all_changes();

-- 仕入管理
CREATE TABLE purchase_orders (
    id SERIAL PRIMARY KEY,
    purchase_no VARCHAR(50) NOT NULL,                             -- 部分インデックスでユニーク化
    supplier_name VARCHAR(255) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ORDERED',               -- ORDERED / RECEIVED
    expense_status VARCHAR(20) NOT NULL DEFAULT 'UNPAID',         -- UNPAID / PAID
    total_amount NUMERIC(12, 2) NOT NULL,
    purchase_date DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL              -- 論理削除用
);
-- 論理削除を考慮した部分ユニークインデックス
CREATE UNIQUE INDEX idx_unique_purchase_no ON purchase_orders (purchase_no) WHERE deleted_at IS NULL;
CREATE TRIGGER trg_purchase_orders_audit AFTER INSERT OR UPDATE OR DELETE ON purchase_orders FOR EACH ROW EXECUTE FUNCTION log_all_changes();

CREATE TABLE purchase_order_items (
    id SERIAL PRIMARY KEY,
    purchase_order_id INT REFERENCES purchase_orders(id) ON DELETE CASCADE,
    product_id INT,                                               -- 論理参照（物理FKなし）
    quantity INT NOT NULL,
    unit_price NUMERIC(12, 2) NOT NULL
);
-- 仕入明細の変更も自動監査ログへ強制記録
CREATE TRIGGER trg_purchase_order_items_audit AFTER INSERT OR UPDATE OR DELETE ON purchase_order_items FOR EACH ROW EXECUTE FUNCTION log_all_changes();

-- システム設定テーブル
CREATE TABLE settings (
    key VARCHAR(255) PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 予約管理テーブル
CREATE TABLE reservations (
    id SERIAL PRIMARY KEY,
    customer_id INT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    memo TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL
);
CREATE INDEX idx_reservations_customer_id ON reservations (customer_id);
