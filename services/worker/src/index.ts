// Entrypoint do serviço Worker (P3.3): consome a fila e processa de verdade —
// dedup por message_id → lock por (tenant_id, from) → pipeline do core (LLM,
// pedido, resposta). O provider de ENVIO é escolhido por tenants.wa_provider,
// nunca pela rota que originou a mensagem (claude.md §4).
import { settings } from "@sirvase/config";
import { createIncomingJobHandler, logger, type TenantRow, type WhatsAppProvider } from "@sirvase/core";
import {
  BullMqConsumer,
  CloudApiProvider,
  EvolutionApiProvider,
  ExternalApiMenuSource,
  OpenRouterLlmProvider,
  RedisConversationLock
} from "@sirvase/adapters";
import {
  PgOrderRepository,
  PgProcessedMessageRepository,
  PgSessionRepository,
  PgTenantRepository
} from "@sirvase/db";

if (!settings.evolution.apiUrl || !settings.evolution.apiKey) {
  logger.warn("worker: EVOLUTION_API_URL/EVOLUTION_API_KEY ausentes — envio via Evolution vai falhar");
}
if (!settings.whatsapp.accessToken) {
  logger.warn("worker: WHATSAPP_ACCESS_TOKEN ausente — envio via Meta vai falhar (esperado até o app aprovar)");
}

function whatsappFor(tenant: TenantRow): WhatsAppProvider {
  if (tenant.waProvider === "meta") {
    return new CloudApiProvider(
      settings.whatsapp.accessToken ?? "",
      tenant.waPhoneNumberId ?? "",
      settings.whatsapp.graphVersion
    );
  }
  // Evolution: nome da instância É o wa_number do tenant (decisão claude.md §4).
  return new EvolutionApiProvider(
    settings.evolution.apiUrl ?? "",
    settings.evolution.apiKey ?? "",
    tenant.waNumber ?? ""
  );
}

const redisUrl = `redis://:${encodeURIComponent(settings.redis.password)}@${settings.redis.host}:${settings.redis.port}`;
const lock = new RedisConversationLock(redisUrl);

const handler = createIncomingJobHandler({
  tenants: new PgTenantRepository(),
  processed: new PgProcessedMessageRepository(),
  lock,
  llm: new OpenRouterLlmProvider(settings.llm.apiKey, settings.llm.baseUrl),
  // ⚠️ Só cardápio externo por ora; internal-crud (menu_items) chega com P6.2/P7.4.
  menuSource: new ExternalApiMenuSource(),
  sessions: new PgSessionRepository(),
  orders: new PgOrderRepository(),
  whatsappFor
});

const consumer = new BullMqConsumer(
  settings.queue.name,
  { host: settings.redis.host, port: settings.redis.port, password: settings.redis.password },
  { concurrency: settings.queue.concurrency }
);
consumer.start(handler);
logger.info("worker consumindo a fila", {
  queue: settings.queue.name,
  concurrency: settings.queue.concurrency
});

async function shutdown(signal: string): Promise<void> {
  logger.info(`worker: ${signal} recebido, encerrando gracioso (jobs em voo terminam)`);
  await consumer.close();
  lock.close();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
