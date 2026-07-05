// P2.3 — as variáveis do prompt vêm do tenant do BANCO, não mais de YAML por
// cliente (o loadConfig de src/clients/*/config.yaml foi pra _legacy). A config
// de negócio mora em `tenants.config` (jsonb) e é validada aqui com o mesmo
// ConfigSchema; colunas de primeira classe da tabela vencem o jsonb quando
// ambos existem (são a fonte canônica editável pelo painel/admin).
import type { TenantRow } from "../ports/repositories.js";
import { AppConfig, ConfigSchema } from "./tenantConfigSchema.js";

/** Erro de config de tenant inválida — quem chama decide se derruba o boot
 *  (wiring) ou rejeita só a mensagem (pipeline). */
export class TenantConfigError extends Error {
  constructor(
    public readonly tenantId: string,
    detail: string
  ) {
    super(`Config inválida do tenant ${tenantId}: ${detail}`);
    this.name = "TenantConfigError";
  }
}

export function tenantConfigFromRow(tenant: TenantRow): AppConfig {
  const result = ConfigSchema.safeParse(tenant.config);
  if (!result.success) {
    throw new TenantConfigError(tenant.id, result.error.message);
  }

  const config = result.data;

  // Colunas canônicas da tabela sobrepõem o jsonb.
  config.store.id = tenant.id;
  config.store.name = tenant.storeName;
  if (tenant.catalogApiUrl) {
    config.menu.api_url = tenant.catalogApiUrl;
  }
  // Personalidade do prompt: a coluna dedicada (editável no painel) vence o tone.style do jsonb.
  if (tenant.systemPromptPersonality) {
    config.tone.style = tenant.systemPromptPersonality;
  }

  return config;
}
