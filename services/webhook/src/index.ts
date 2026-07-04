// Entrypoint do serviço Webhook. Duas rotas fixas — Evolution ativa, Cloud API pronta —
// ver claude.md §4 e PLANO_EXECUCAO.md Épico 4. Wiring real: repo Postgres + adapters
// reais. Ainda casca de eco (sem fila/LLM) — pipeline completo chega nos Épicos 2/3/5.
import { settings } from "@sirvase/config";
import { logger } from "@sirvase/core";
import { CloudApiProvider, EvolutionApiProvider } from "@sirvase/adapters";
import { PgTenantRepository } from "@sirvase/db";
import { createRouter } from "./router.ts";

const PORT = 3001;

if (!settings.evolution.apiUrl || !settings.evolution.apiKey) {
  logger.warn(
    "webhook: EVOLUTION_API_URL/EVOLUTION_API_KEY ausentes — sendText da Evolution vai falhar"
  );
}
if (!settings.whatsapp.accessToken) {
  logger.warn(
    "webhook: WHATSAPP_ACCESS_TOKEN ausente — sendText da Meta vai falhar (esperado até o app aprovar)"
  );
}

const handle = createRouter({
  tenants: new PgTenantRepository(),
  makeEvolutionProvider: (instanceName) =>
    new EvolutionApiProvider(
      settings.evolution.apiUrl ?? "",
      settings.evolution.apiKey ?? "",
      instanceName
    ),
  makeCloudApiProvider: (phoneNumberId) =>
    new CloudApiProvider(
      settings.whatsapp.accessToken ?? "",
      phoneNumberId,
      settings.whatsapp.graphVersion
    ),
  metaVerifyToken: settings.whatsapp.verifyToken,
  metaAppSecret: settings.whatsapp.appSecret,
  evolutionWebhookToken: settings.evolution.webhookToken
});

const server = Bun.serve({ port: PORT, fetch: handle });

logger.info(`webhook ouvindo em http://localhost:${server.port}`);
