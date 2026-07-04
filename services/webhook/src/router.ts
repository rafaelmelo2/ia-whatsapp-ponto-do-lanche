// Router HTTP do webhook. Handler puro `(req) => Response` com deps injetadas — mesmo
// padrão do services/api/src/router.ts. Duas rotas fixas, uma por provedor; o pipeline
// real (fila/dedup/LLM) chega nos Épicos 2/3/5 — por ora, eco de volta (mesma casca que
// já existia só pra Meta, estendida pros dois provedores).
import type { TenantRepository, WhatsAppProvider } from "@sirvase/core";
import { logger } from "@sirvase/core";
import { extractInstanceName, extractPhoneNumberId, verifyMetaSignature } from "@sirvase/adapters";

export interface RouterDeps {
  tenants: TenantRepository;
  makeEvolutionProvider: (instanceName: string) => WhatsAppProvider;
  makeCloudApiProvider: (phoneNumberId: string) => WhatsAppProvider;
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

  const provider = deps.makeCloudApiProvider(phoneNumberId);
  const msg = provider.parseWebhook(payload);
  if (msg) {
    logger.info("webhook: mensagem Meta recebida", { tenantId: tenant.id, from: msg.from });
    try {
      await provider.sendText(msg.from, `eco: ${msg.body}`);
    } catch (err) {
      logger.error("webhook: falha ao enviar eco via Meta", {
        tenantId: tenant.id,
        err: err instanceof Error ? err.message : String(err)
      });
    }
  }

  return text("EVENT_RECEIVED");
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

  const provider = deps.makeEvolutionProvider(instanceName);
  const msg = provider.parseWebhook(payload);
  if (msg) {
    logger.info("webhook: mensagem Evolution recebida", { tenantId: tenant.id, from: msg.from });
    try {
      await provider.sendText(msg.from, `eco: ${msg.body}`);
    } catch (err) {
      logger.error("webhook: falha ao enviar eco via Evolution", {
        tenantId: tenant.id,
        err: err instanceof Error ? err.message : String(err)
      });
    }
  }

  return text("EVENT_RECEIVED");
}
