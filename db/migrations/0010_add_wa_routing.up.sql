-- Identidade universal de roteamento multi-provedor (Evolution + Meta Cloud API).
-- wa_number é a chave em comum: nome da instância na Evolution, número normalizado
-- (E.164 sem "+") nos dois casos. wa_phone_number_id (já existe) vira campo técnico
-- exclusivo da Meta (exigido pela Graph API pra montar a URL de envio).
ALTER TABLE tenants ADD COLUMN wa_number text UNIQUE;
ALTER TABLE tenants ADD COLUMN wa_provider text NOT NULL DEFAULT 'evolution'
  CHECK (wa_provider IN ('meta', 'evolution'));
