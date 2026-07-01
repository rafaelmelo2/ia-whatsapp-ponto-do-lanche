-- Tenant secrets: token da Cloud API (e outros) por tenant, cifrado. A cifra real
-- (ENCRYPTION_KEY) entra no Épico 6; aqui só a estrutura. UNIQUE (tenant_id, key).
CREATE TABLE tenant_secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  key text NOT NULL,
  value_encrypted text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, key)
);

CREATE INDEX idx_tenant_secrets_tenant_id ON tenant_secrets (tenant_id);
