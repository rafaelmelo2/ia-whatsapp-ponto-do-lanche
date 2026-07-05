// Handler de UM job da fila (roda no worker): dedup → lock → pipeline.
// A ordem importa (claude.md §6):
//   1. dedup por message_id ANTES de qualquer efeito colateral (Regra de Ouro 4);
//   2. lock por (tenant_id, from) serializa a conversa — mata o fan-out;
//   3. pipeline (LLM, pedido, resposta, sessão).
// Erro DEPOIS do mark de dedup → compensa (unmark) e relança, senão o retry do
// BullMQ seria engolido como "duplicata" e a mensagem se perderia.
import { logger } from "../observability/logger.js";
import type { ConversationLock } from "../ports/lock.js";
import type { LlmProvider } from "../ports/llm.js";
import type { MenuSource } from "../ports/menu.js";
import type { IncomingJobHandler, IncomingMessageJob } from "../ports/queue.js";
import type {
  OrderRepository,
  ProcessedMessageRepository,
  SessionRepository,
  TenantRepository,
  TenantRow
} from "../ports/repositories.js";
import type { WhatsAppProvider } from "../ports/whatsapp.js";
import { processIncomingMessage } from "./processIncomingMessage.js";

export interface IncomingJobDeps {
  tenants: TenantRepository;
  processed: ProcessedMessageRepository;
  lock: ConversationLock;
  llm: LlmProvider;
  menuSource: MenuSource;
  sessions: SessionRepository;
  orders: OrderRepository;
  /** Provider de ENVIO escolhido pelo tenant (tenants.wa_provider), nunca pela rota de entrada. */
  whatsappFor: (tenant: TenantRow) => WhatsAppProvider;
}

export interface IncomingJobOptions {
  /** TTL do lock — teto de processamento de uma mensagem (default 60s). */
  lockTtlMs?: number;
  /** Intervalo entre tentativas de adquirir o lock (default 150ms). */
  lockRetryMs?: number;
  /** Espera máxima pelo lock antes de desistir e deixar o job pro retry (default 30s). */
  lockMaxWaitMs?: number;
}

export class LockTimeoutError extends Error {
  constructor(tenantId: string, from: string) {
    super(`Lock de conversa ocupado além do limite (tenant ${tenantId}, from ${from})`);
    this.name = "LockTimeoutError";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createIncomingJobHandler(
  deps: IncomingJobDeps,
  options: IncomingJobOptions = {}
): IncomingJobHandler {
  const lockTtlMs = options.lockTtlMs ?? 60_000;
  const lockRetryMs = options.lockRetryMs ?? 150;
  const lockMaxWaitMs = options.lockMaxWaitMs ?? 30_000;

  return async function handleIncomingJob(job: IncomingMessageJob): Promise<void> {
    const { tenantId, message } = job;
    const logCtx = { tenantId, messageId: message.messageId, from: message.from };

    // Tenant sempre fresco do banco (status/config podem ter mudado desde o enqueue).
    const tenant = await deps.tenants.findById(tenantId);
    if (!tenant || !tenant.active) {
      logger.warn("worker: tenant inexistente/inativo, job descartado", logCtx);
      return; // sem throw: retry não vai ressuscitar o tenant
    }

    // 1) Dedup — antes de QUALQUER efeito colateral.
    const firstTime = await deps.processed.markProcessed(tenantId, message.messageId);
    if (!firstTime) {
      logger.info("worker: mensagem duplicada, descartada pela dedup", logCtx);
      return;
    }

    try {
      // 2) Lock por (tenant_id, from) — espera com retry; estourou → job volta pra fila.
      const deadline = Date.now() + lockMaxWaitMs;
      let acquired = await deps.lock.acquire(tenantId, message.from, lockTtlMs);
      while (!acquired && Date.now() < deadline) {
        await sleep(lockRetryMs);
        acquired = await deps.lock.acquire(tenantId, message.from, lockTtlMs);
      }
      if (!acquired) {
        throw new LockTimeoutError(tenantId, message.from);
      }

      // 3) Pipeline.
      try {
        await processIncomingMessage(
          {
            llm: deps.llm,
            menuSource: deps.menuSource,
            whatsapp: deps.whatsappFor(tenant),
            sessions: deps.sessions,
            orders: deps.orders
          },
          tenant,
          message
        );
      } finally {
        await deps.lock.release(tenantId, message.from);
      }
    } catch (error) {
      // Compensa a dedup pra o retry do job não ser descartado como duplicata.
      await deps.processed.unmark(tenantId, message.messageId);
      throw error;
    }
  };
}
