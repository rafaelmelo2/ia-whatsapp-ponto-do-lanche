-- Orders: mantém o schema do sistema antigo (items jsonb, total, status enum).
-- Adiciona `source` (bot|painel) e `idempotency_key` (dedup de criação).
CREATE TABLE orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_phone text NOT NULL,
  items jsonb NOT NULL,
  total numeric(10, 2) NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'preparing', 'delivering', 'completed', 'cancelled')),
  delivery_needed boolean NOT NULL DEFAULT false,
  address text,
  payment_method text,
  source text NOT NULL DEFAULT 'bot'
    CHECK (source IN ('bot', 'painel')),
  idempotency_key text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_orders_tenant_id ON orders (tenant_id);
CREATE INDEX idx_orders_status ON orders (tenant_id, status);
CREATE INDEX idx_orders_customer_phone ON orders (tenant_id, customer_phone);
