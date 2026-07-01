-- Subscriptions: billing (Asaas, mensalidade fixa, trial 14d). Um por tenant
-- (idx unique). Preenchido de fato no Épico 8; schema já fica pronto.
CREATE TABLE subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plan text NOT NULL,
  status text NOT NULL DEFAULT 'trial'
    CHECK (status IN ('trial', 'active', 'past_due', 'cancelled', 'expired')),
  trial_ends_at timestamptz,
  gateway_id text,
  gateway_subscription_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_subscriptions_tenant_id ON subscriptions (tenant_id);
