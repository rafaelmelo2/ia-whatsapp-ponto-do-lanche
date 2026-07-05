// Prova do DoD de P3.3 — O TESTE DO FAN-OUT: mensagens simultâneas do mesmo
// cliente nunca geram resposta nem pedido duplicado. Tudo com mocks (sem rede,
// sem Redis, sem Postgres): dedup in-memory com a semântica do ON CONFLICT,
// lock in-memory com a semântica do SET NX PX, fila com a semântica do BullMQ.
// De quebra prova o P3.4: o contexto mora no SessionRepository (Postgres na
// vida real), então "reiniciar o worker" (novo handler) não perde a conversa.
import { describe, expect, it } from "bun:test";
import type { IncomingMessage, LlmProvider, TenantRow } from "@sirvase/core";
import { createIncomingJobHandler } from "@sirvase/core";
import {
  InMemoryConversationLock,
  InMemoryMessageQueue,
  InMemoryOrderRepository,
  InMemoryProcessedMessageRepository,
  InMemorySessionRepository,
  InMemoryTenantRepository,
  MockLlmProvider,
  MockMenuSource,
  MockWhatsAppProvider
} from "@sirvase/adapters";

const TENANT_ID = "33333333-3333-3333-3333-333333333333";

const TENANT_CONFIG = {
  store: { id: "loja", name: "Loja Fanout", phone: "+5511999999999" },
  hours: { open: "19:00", close: "22:30", days_open: ["Sábado"] },
  payments: { methods: ["Pix"] },
  delivery: { enabled: true, eta_min: 20, eta_max: 50 },
  menu: { api_url: "http://mock.local/menu", currency: "BRL" },
  upsell: { default_suggestions: [], best_sellers_tag: "top" },
  tone: { greeting: "Oi!", emojis: "moderado", style: "direto" },
  llm: { model: "mock/modelo", temperature: 0.5, max_tokens: 1000 }
};

function makeTenant(): TenantRow {
  const now = new Date();
  return {
    id: TENANT_ID,
    storeName: "Loja Fanout",
    storeType: "hamburgueria",
    catalogApiUrl: "http://mock.local/menu",
    pixKey: null,
    systemPromptPersonality: null,
    config: TENANT_CONFIG,
    active: true,
    waNumber: "5511999990002",
    waProvider: "evolution",
    waPhoneNumberId: null,
    wabaId: null,
    status: "active",
    plan: null,
    cardapioSource: "external",
    createdAt: now,
    updatedAt: now
  };
}

function makeMessage(body: string, messageId: string): IncomingMessage {
  return { from: "5511977776666", body, isGroup: false, messageId };
}

interface Setup {
  handler: ReturnType<typeof createIncomingJobHandler>;
  deps: {
    tenants: InMemoryTenantRepository;
    processed: InMemoryProcessedMessageRepository;
    lock: InMemoryConversationLock;
    llm: MockLlmProvider;
    menuSource: MockMenuSource;
    sessions: InMemorySessionRepository;
    orders: InMemoryOrderRepository;
    whatsapp: MockWhatsAppProvider;
  };
}

function setup(llmResponses: string[], llmOverride?: LlmProvider): Setup {
  const whatsapp = new MockWhatsAppProvider();
  const deps = {
    tenants: new InMemoryTenantRepository([makeTenant()]),
    processed: new InMemoryProcessedMessageRepository(),
    lock: new InMemoryConversationLock(),
    llm: new MockLlmProvider(llmResponses),
    menuSource: new MockMenuSource(),
    sessions: new InMemorySessionRepository(),
    orders: new InMemoryOrderRepository(),
    whatsapp
  };
  const handler = createIncomingJobHandler(
    { ...deps, llm: llmOverride ?? deps.llm, whatsappFor: () => whatsapp },
    { lockRetryMs: 5, lockMaxWaitMs: 2000 }
  );
  return { handler, deps };
}

const ORDER_RESPONSE =
  "Fechado!\n<<<JSON\n" + JSON.stringify({ items: [{ name: "X-Tudo", quantity: 1 }] }) + "\n>>>";

describe("fan-out (P3.3): dedup + lock serializam a conversa", () => {
  it("a MESMA mensagem entregue 2x simultaneamente gera UMA resposta e UM pedido", async () => {
    const { handler, deps } = setup([ORDER_RESPONSE, ORDER_RESPONSE]);
    const job = { tenantId: TENANT_ID, message: makeMessage("pode fechar", "msg-dup") };

    // Reentrega simultânea (pior caso: passou pela fila 2x — ex. jobId diferente por bug do provedor)
    await Promise.all([handler(job), handler(job)]);

    expect(deps.llm.calls).toHaveLength(1); // LLM chamado UMA vez
    expect(deps.whatsapp.sent).toHaveLength(1); // UMA resposta ao cliente
    expect(await deps.orders.listByTenant(TENANT_ID)).toHaveLength(1); // UM pedido
  });

  it("duas mensagens DIFERENTES simultâneas do mesmo cliente são serializadas pelo lock", async () => {
    const { handler, deps } = setup(["Resposta 1.", "Resposta 2."]);

    await Promise.all([
      handler({ tenantId: TENANT_ID, message: makeMessage("primeira", "msg-a") }),
      handler({ tenantId: TENANT_ID, message: makeMessage("segunda", "msg-b") })
    ]);

    // As duas foram atendidas…
    expect(deps.whatsapp.sent).toHaveLength(2);
    expect(deps.llm.calls).toHaveLength(2);

    // …mas NUNCA em paralelo: a 2ª chamada de LLM já viu o turno completo da 1ª
    // no histórico (se rodassem juntas, a 2ª veria histórico vazio e o upsert
    // final perderia um dos turnos).
    const secondCallRoles = deps.llm.calls[1]!.messages.map((m) => m.role);
    expect(secondCallRoles).toEqual(["system", "user", "assistant", "user"]);

    const session = await deps.sessions.getByPhone(TENANT_ID, "5511977776666");
    const history = session!.context.history as { role: string; content: string }[];
    expect(history).toHaveLength(4); // user/assistant × 2, nenhum turno perdido
  });

  it("tenant inexistente ou inativo: job descartado sem processar", async () => {
    const { handler, deps } = setup(["nunca usada"]);

    await handler({ tenantId: "44444444-4444-4444-4444-444444444444", message: makeMessage("oi", "msg-x") });

    expect(deps.llm.calls).toHaveLength(0);
    expect(deps.whatsapp.sent).toHaveLength(0);
  });

  it("falha no pipeline: dedup é compensada e o retry da fila processa a mensagem", async () => {
    // LLM falha na 1ª tentativa e funciona na 2ª (ex: timeout transitório do provedor)
    let attempt = 0;
    const flakyLlm: LlmProvider = {
      async generate(messages, options) {
        attempt += 1;
        if (attempt === 1) throw new Error("timeout transitório");
        return new MockLlmProvider(["Agora foi!"]).generate(messages, options);
      }
    };
    const { handler, deps } = setup(["não usada"], flakyLlm);

    const queue = new InMemoryMessageQueue(3); // 3 tentativas, como no BullMQ real
    queue.start(handler);
    await queue.enqueue({ tenantId: TENANT_ID, message: makeMessage("oi", "msg-retry") });
    await queue.idle();

    expect(attempt).toBe(2); // falhou, retry, sucesso
    expect(deps.whatsapp.sent).toEqual([{ to: "5511977776666", text: "Agora foi!" }]);
    expect(queue.dlq).toHaveLength(0);
  });

  it("falha permanente: job esgota as tentativas e cai na DLQ (sem resposta duplicada)", async () => {
    const brokenLlm: LlmProvider = {
      async generate() {
        throw new Error("LLM permanentemente fora");
      }
    };
    const { handler, deps } = setup(["não usada"], brokenLlm);

    const queue = new InMemoryMessageQueue(3);
    queue.start(handler);
    await queue.enqueue({ tenantId: TENANT_ID, message: makeMessage("oi", "msg-dead") });
    await queue.idle();

    expect(queue.dlq).toHaveLength(1);
    expect(queue.dlq[0]!.failedReason).toContain("LLM permanentemente fora");
    expect(deps.whatsapp.sent).toHaveLength(0);
  });

  it("P3.4: 'reiniciar o worker' (novo handler) não perde o contexto da conversa", async () => {
    const whatsapp = new MockWhatsAppProvider();
    const sessions = new InMemorySessionRepository(); // papel do Postgres durável
    const shared = {
      tenants: new InMemoryTenantRepository([makeTenant()]),
      processed: new InMemoryProcessedMessageRepository(),
      menuSource: new MockMenuSource(),
      sessions,
      orders: new InMemoryOrderRepository(),
      whatsappFor: () => whatsapp
    };

    // Worker "antes do restart"
    const llm1 = new MockLlmProvider(["Anotado: X-Tudo!"]);
    const worker1 = createIncomingJobHandler({ ...shared, llm: llm1, lock: new InMemoryConversationLock() });
    await worker1({ tenantId: TENANT_ID, message: makeMessage("quero um X-Tudo", "msg-1") });

    // Worker "depois do restart": instâncias novas de handler/lock/llm, MESMO storage
    const llm2 = new MockLlmProvider(["Fechando seu X-Tudo!"]);
    const worker2 = createIncomingJobHandler({ ...shared, llm: llm2, lock: new InMemoryConversationLock() });
    await worker2({ tenantId: TENANT_ID, message: makeMessage("pode fechar", "msg-2") });

    // O worker novo viu a conversa inteira — o estado mora no repositório, não no processo.
    const roles = llm2.calls[0]!.messages.map((m) => m.role);
    expect(roles).toEqual(["system", "user", "assistant", "user"]);
    expect(llm2.calls[0]!.messages[1]!.content).toBe("quero um X-Tudo");
  });
});
