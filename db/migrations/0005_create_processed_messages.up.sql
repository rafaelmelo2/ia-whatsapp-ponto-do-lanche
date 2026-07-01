-- Processed messages: dedup por message_id da Meta. INSERT ... ON CONFLICT DO
-- NOTHING antes de qualquer efeito colateral garante idempotência (princípio 7).
CREATE TABLE processed_messages (
  message_id text PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_processed_messages_tenant_id ON processed_messages (tenant_id);
