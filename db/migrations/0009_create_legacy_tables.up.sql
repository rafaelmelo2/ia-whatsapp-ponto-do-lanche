-- Tabelas legadas mantidas por compatibilidade durante a coexistência com o n8n
-- (rede de segurança, princípio 4). Aposentadas quando a versão nova se provar.
CREATE TABLE leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  name text,
  phone text,
  message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_leads_tenant_id ON leads (tenant_id);

CREATE TABLE n8n_chat_histories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  session_id text,
  role text,
  content text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_n8n_chat_histories_tenant_id ON n8n_chat_histories (tenant_id);
