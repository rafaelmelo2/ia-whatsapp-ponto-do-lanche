// Pipeline de UMA mensagem entrante (era o miolo do _legacy/index.ts, reescrito
// hexagonal): depende SÓ de portas — roda ponta a ponta com mocks, sem rede.
// Fora do escopo daqui (chega no Épico 3, no worker): dedup por message_id,
// lock por (tenant_id, from) e fila. O worker chama esta função por job.
import { tenantConfigFromRow } from "../config/tenantConfigFromRow.js";
import { PromptGuard } from "../llm/guard.js";
import { PromptBuilder } from "../llm/promptBuilder.js";
import { findItemPrice, renderMenu } from "../menu/renderMenu.js";
import { logger } from "../observability/logger.js";
import { OrderParser } from "../orders/orderParser.js";
import type { LlmMessage, LlmProvider } from "../ports/llm.js";
import type { MenuSource } from "../ports/menu.js";
import type { OrderRepository, OrderRow, SessionRepository, TenantRow } from "../ports/repositories.js";
import type { IncomingMessage, WhatsAppProvider } from "../ports/whatsapp.js";

export interface PipelineDeps {
  llm: LlmProvider;
  menuSource: MenuSource;
  whatsapp: WhatsAppProvider;
  sessions: SessionRepository;
  orders: OrderRepository;
}

export interface PipelineResult {
  /** Texto enviado ao cliente (já sem o bloco <<<JSON…>>>). */
  reply: string;
  /** Pedido persistido, quando a conversa fechou um. */
  order: OrderRow | null;
}

/** Turno de conversa guardado em sessions.context.history. */
export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
  at: number;
}

// Limite herdado do legado: segura o tamanho do prompt sem sumário de contexto.
const MAX_HISTORY_TURNS = 30;

function historyFromContext(context: Record<string, unknown>): ChatTurn[] {
  const history = context.history;
  if (!Array.isArray(history)) return [];
  return history.filter(
    (turn): turn is ChatTurn =>
      typeof turn === "object" &&
      turn !== null &&
      (turn as ChatTurn).role !== undefined &&
      typeof (turn as ChatTurn).content === "string"
  );
}

/**
 * Processa uma mensagem já autenticada/roteada: monta prompt do tenant, chama o
 * LLM, valida com o guard, extrai pedido (se fechou), responde e persiste estado.
 * Retorna `null` quando a mensagem não é processável (grupo).
 */
export async function processIncomingMessage(
  deps: PipelineDeps,
  tenant: TenantRow,
  message: IncomingMessage
): Promise<PipelineResult | null> {
  const logCtx = { tenantId: tenant.id, messageId: message.messageId, from: message.from };

  if (message.isGroup) {
    logger.info("pipeline: mensagem de grupo ignorada", logCtx);
    return null;
  }

  const config = tenantConfigFromRow(tenant);

  // Confirmação de leitura é cosmética — falha não pode derrubar o atendimento.
  try {
    await deps.whatsapp.markAsRead(message.from, message.messageId);
  } catch (error) {
    logger.warn("pipeline: markAsRead falhou (seguindo)", { ...logCtx, error });
  }

  // Estado da conversa + cardápio do tenant
  const session = await deps.sessions.getByPhone(tenant.id, message.from);
  const history = historyFromContext(session?.context ?? {});
  const menuItems = await deps.menuSource.getMenu(tenant);
  const menuRendered = renderMenu(config.store.name, menuItems);

  // Prompt + LLM
  const systemPrompt = new PromptBuilder().build(config, menuRendered);
  const llmMessages: LlmMessage[] = [
    { role: "system", content: systemPrompt },
    ...history.map((turn): LlmMessage => ({ role: turn.role, content: turn.content })),
    { role: "user", content: message.body }
  ];
  const llmResult = await deps.llm.generate(llmMessages, {
    model: config.llm.model,
    temperature: config.llm.temperature,
    maxTokens: config.llm.max_tokens
  });

  // Guard: mesma correção barata do legado (headers Markdown viram bullet)
  let answer = llmResult.content;
  const validation = new PromptGuard().validate(answer);
  if (!validation.isValid) {
    logger.warn("pipeline: resposta reprovada no guard, aplicando correção", {
      ...logCtx,
      reason: validation.reason
    });
    answer = answer.replace(/^#+\s/gm, "* ");
  }

  // Extração de pedido (bloco <<<JSON…>>> quando o cliente confirmou)
  const parser = new OrderParser();
  const extraction = parser.extract(answer);
  const reply = parser.cleanResponse(answer);

  let order: OrderRow | null = null;
  if (extraction) {
    // Recalcula o total com preço do cardápio — nunca confiar em preço do LLM.
    let total = 0;
    for (const item of extraction.items) {
      const price = findItemPrice(menuItems, item.name);
      if (price === null) {
        logger.warn("pipeline: item do pedido não está no cardápio, fora do total", {
          ...logCtx,
          item: item.name
        });
        continue;
      }
      total += price * item.quantity;
    }

    order = await deps.orders.create(tenant.id, {
      customerPhone: message.from,
      items: extraction.items,
      total,
      deliveryNeeded: extraction.deliveryNeeded,
      address: extraction.address ?? null,
      paymentMethod: extraction.paymentMethod ?? null,
      source: "bot",
      // Idempotência: a mensagem que fechou o pedido só pode gerar UM pedido.
      idempotencyKey: message.messageId
    });
    logger.info("pipeline: pedido criado", { ...logCtx, orderId: order.id, total });
  }

  await deps.whatsapp.sendText(message.from, reply);

  // Persiste a conversa (verdade em sessions.context — Épico 3 só migra o lock/efêmero pro Redis)
  const now = Date.now();
  const newTurns: ChatTurn[] = [
    { role: "user", content: message.body, at: now },
    { role: "assistant", content: reply, at: now }
  ];
  const newHistory = [...history, ...newTurns].slice(-MAX_HISTORY_TURNS);
  await deps.sessions.upsert(tenant.id, message.from, {
    ...(session?.context ?? {}),
    history: newHistory
  });

  return { reply, order };
}
