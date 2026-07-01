-- Sessions: estado da conversa. Chave de lookup passa a ser (tenant_id, phone_number).
CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  phone_number text NOT NULL,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_activity timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, phone_number)
);

CREATE INDEX idx_sessions_tenant_id ON sessions (tenant_id);
CREATE INDEX idx_sessions_last_activity ON sessions (tenant_id, last_activity);
