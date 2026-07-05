// Entrypoint do serviço Webhook (P3.2): valida → resolve tenant → ENFILEIRA →
// 200 <5s. Nada de LLM/envio aqui — isso é o worker. Duas rotas fixas, uma por
// provedor (claude.md §4): /webhook/evolution (ativa) e /webhook/meta (pronta).
import { settings } from "@sirvase/config";
import { logger } from "@sirvase/core";
import { BullMqProducer } from "@sirvase/adapters";
import { PgTenantRepository } from "@sirvase/db";
import { createRouter } from "./router.ts";

const PORT = 3001;

if (!settings.evolution.webhookToken) {
  logger.warn("webhook: EVOLUTION_WEBHOOK_TOKEN ausente — rota /webhook/evolution vai recusar tudo");
}
if (!settings.whatsapp.appSecret) {
  logger.warn("webhook: WHATSAPP_APP_SECRET ausente — rota /webhook/meta vai recusar tudo");
}

const handle = createRouter({
  tenants: new PgTenantRepository(),
  queue: new BullMqProducer(settings.queue.name, {
    host: settings.redis.host,
    port: settings.redis.port,
    password: settings.redis.password
  }),
  metaVerifyToken: settings.whatsapp.verifyToken,
  metaAppSecret: settings.whatsapp.appSecret,
  evolutionWebhookToken: settings.evolution.webhookToken
});

const server = Bun.serve({ port: PORT, fetch: handle });

logger.info(`webhook ouvindo em http://localhost:${server.port}`);
