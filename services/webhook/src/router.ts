// Router HTTP do webhook (P3.2): valida autenticação por provedor, resolve o
// tenant, traduz o payload e SÓ ENFILEIRA — nenhum outro efeito colateral aqui.
// Responde 200 rápido (<5s) pro provedor não reentregar; o processamento real
// (dedup, lock, LLM, resposta) é do worker, consumindo a fila.
// Handler puro `(req) => Response` com deps injetadas — mesmo padrão do services/api.
import type { MessageQueueProducer, TenantRepository } from "@sirvase/core";
import { logger } from "@sirvase/core";
import {
  extractInstanceName,
  extractPhoneNumberId,
  parseCloudApiWebhook,
  parseEvolutionWebhook,
  verifyMetaSignature
} from "@sirvase/adapters";

export interface RouterDeps {
  tenants: TenantRepository;
  queue: MessageQueueProducer;
  metaVerifyToken?: string;
  metaAppSecret?: string;
  evolutionWebhookToken?: string;
}

function text(body: string, status = 200): Response {
  return new Response(body, { status });
}

export function createRouter(deps: RouterDeps) {
  return async function handle(req: Request): Promise<Response> {
    const url = new URL(req.url);

    if (req.method === "GET" && url.pathname === "/webhook/meta") {
      return handleMetaVerify(url, deps);
    }
    if (req.method === "POST" && url.pathname === "/webhook/meta") {
      return handleMetaMessage(req, deps);
    }
    if (req.method === "POST" && url.pathname === "/webhook/evolution") {
      return handleEvolutionMessage(req, url, deps);
    }

    return text("Not Found", 404);
  };
}

function handleMetaVerify(url: URL, deps: RouterDeps): Response {
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  if (mode === "subscribe" && token && token === deps.metaVerifyToken) {
    logger.info("webhook: verificação Meta OK");
    return text(challenge ?? "");
  }
  logger.warn("webhook: verificação Meta recusada (token não confere)");
  return text("Forbidden", 403);
}

/** Enfileira e responde. Falha no enqueue (Redis fora) → 500 DE PROPÓSITO: é o
 *  único caso em que QUEREMOS a reentrega do provedor (a mensagem ainda não está
 *  segura em lugar nenhum); a dedup do worker absorve a duplicata quando voltar. */
async function enqueueAndAck(
  deps: RouterDeps,
  tenantId: string,
  message: NonNullable<ReturnType<typeof parseCloudApiWebhook>>,
  okBody: string
): Promise<Response> {
  try {
    await deps.queue.enqueue({ tenantId, message });
    logger.info("webhook: mensagem enfileirada", {
      tenantId,
      messageId: message.messageId,
      from: message.from
    });
    return text(okBody);
  } catch (err) {
    logger.error("webhook: FALHA AO ENFILEIRAR (pedindo reentrega ao provedor)", {
      tenantId,
      messageId: message.messageId,
      err: err instanceof Error ? err.message : String(err)
    });
    return text("Internal Server Error", 500);
  }
}

async function handleMetaMessage(req: Request, deps: RouterDeps): Promise<Response> {
  const raw = await req.text();
  const signature = req.headers.get("X-Hub-Signature-256");
  if (!deps.metaAppSecret || !(await verifyMetaSignature(raw, signature, deps.metaAppSecret))) {
    logger.warn("webhook: assinatura Meta inválida");
    return text("Forbidden", 403);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return text("Bad Request", 400);
  }

  const phoneNumberId = extractPhoneNumberId(payload);
  if (!phoneNumberId) {
    logger.warn("webhook: payload Meta sem phone_number_id");
    return text("EVENT_RECEIVED"); // sempre 200 p/ Meta não reentregar
  }

  const tenant = await deps.tenants.findByPhoneNumberId(phoneNumberId);
  if (!tenant) {
    logger.warn("webhook: phone_number_id desconhecido, descartado", { phoneNumberId });
    return text("EVENT_RECEIVED");
  }

  const msg = parseCloudApiWebhook(payload);
  if (!msg) {
    return text("EVENT_RECEIVED"); // status/mídia/etc — não é mensagem de texto processável
  }

  return enqueueAndAck(deps, tenant.id, msg, "EVENT_RECEIVED");
}

async function handleEvolutionMessage(req: Request, url: URL, deps: RouterDeps): Promise<Response> {
  const token = url.searchParams.get("token");
  if (!deps.evolutionWebhookToken || token !== deps.evolutionWebhookToken) {
    logger.warn("webhook: token Evolution inválido");
    return text("Unauthorized", 401);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(await req.text());
  } catch {
    return text("Bad Request", 400);
  }

  const instanceName = extractInstanceName(payload);
  if (!instanceName) {
    logger.warn("webhook: payload Evolution sem instance");
    return text("EVENT_RECEIVED");
  }

  const tenant = await deps.tenants.findByWaNumber(instanceName);
  if (!tenant) {
    logger.warn("webhook: instância Evolution desconhecida, descartada", { instanceName });
    return text("EVENT_RECEIVED");
  }

  const msg = parseEvolutionWebhook(payload);
  if (!msg) {
    return text("EVENT_RECEIVED");
  }

  return enqueueAndAck(deps, tenant.id, msg, "EVENT_RECEIVED");
}
