-- Tenants: evolução de `saas_stores` do sistema antigo. Chave de roteamento
-- agora é `wa_phone_number_id` (Cloud API), não mais `instance_name` (Evolution).
CREATE TABLE tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_name text NOT NULL,
  store_type text,
  catalog_api_url text,
  pix_key text,
  system_prompt_personality text,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  wa_phone_number_id text UNIQUE,
  waba_id text,
  status text NOT NULL DEFAULT 'trial'
    CHECK (status IN ('trial', 'active', 'past_due', 'suspended')),
  plan text,
  cardapio_source text NOT NULL DEFAULT 'internal'
    CHECK (cardapio_source IN ('internal', 'external')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
