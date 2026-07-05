// Prova do DoD de P2.2: o pipeline roda ponta a ponta SÓ com mocks, sem rede e
// sem banco — mensagem entra, prompt monta do tenant, LLM canned responde, guard
// valida, pedido é extraído/persistido com preço do cardápio e a resposta sai
// pelo provider de WhatsApp mockado.
import { describe, expect, it } from "bun:test";
import type { IncomingMessage, TenantRow } from "@sirvase/core";
import { processIncomingMessage } from "@sirvase/core";
import {
  InMemoryOrderRepository,
  InMemorySessionRepository,
  MockLlmProvider,
  MockMenuSource,
  MockWhatsAppProvider
} from "../src/index.js";

// Mesmo shape do seed do Ponto do Lanche (tenants.config jsonb).
const TENANT_CONFIG = {
  store: { id: "ponto-do-lanche", name: "Ponto do Lanche", phone: "+5511999999999" },
  hours: { open: "19:00", close: "22:30", days_open: ["Sexta-feira", "Sábado"] },
  payments: { methods: ["Pix", "Dinheiro"] },
  delivery: { enabled: true, eta_min: 20, eta_max: 50, surcharge_per_sandwich: 0.5, minimum_fee: 5 },
  menu: { api_url: "http://mock.local/menu", currency: "BRL" },
  upsell: { default_suggestions: ["refrigerante"], best_sellers_tag: "mais_vendido" },
  tone: { greeting: "Oi! 😄", emojis: "moderado", style: "simpático" },
  llm: { model: "mock/modelo-teste", temperature: 0.5, max_tokens: 1000 }
};

function makeTenant(): TenantRow {
  const now = new Date();
  return {
    id: "11111111-1111-1111-1111-111111111111",
    storeName: "Ponto do Lanche",
    storeType: "hamburgueria",
    catalogApiUrl: "http://mock.local/menu",
    pixKey: null,
    systemPromptPersonality: null,
    config: TENANT_CONFIG,
    active: true,
    waNumber: "5511999999999",
    waProvider: "evolution",
    waPhoneNumberId: null,
    wabaId: null,
    status: "trial",
    plan: null,
    cardapioSource: "external",
    createdAt: now,
    updatedAt: now
  };
}

function makeMessage(body: string, overrides: Partial<IncomingMessage> = {}): IncomingMessage {
  return {
    from: "5511988887777",
    body,
    pushName: "Cliente Teste",
    isGroup: false,
    messageId: `msg-${Math.random().toString(36).slice(2)}`,
    ...overrides
  };
}

function makeDeps(llmResponses: string[]) {
  return {
    llm: new MockLlmProvider(llmResponses),
    menuSource: new MockMenuSource(),
    whatsapp: new MockWhatsAppProvider(),
    sessions: new InMemorySessionRepository(),
    orders: new InMemoryOrderRepository()
  };
}

describe("pipeline ponta a ponta com mocks (P2.2)", () => {
  it("mensagem simples: responde via WhatsApp, sem pedido, e persiste a conversa", async () => {
    const deps = makeDeps(["Olá! Temos X-Tudo por R$ 30,00 😄"]);
    const tenant = makeTenant();
    const msg = makeMessage("Oi, qual o cardápio?");

    const result = await processIncomingMessage(deps, tenant, msg);

    expect(result).not.toBeNull();
    expect(result!.order).toBeNull();
    expect(result!.reply).toBe("Olá! Temos X-Tudo por R$ 30,00 😄");
    expect(deps.whatsapp.sent).toEqual([{ to: msg.from, text: result!.reply }]);
    expect(deps.whatsapp.reads).toEqual([{ to: msg.from, messageId: msg.messageId }]);

    const session = await deps.sessions.getByPhone(tenant.id, msg.from);
    expect(session).not.toBeNull();
    const history = session!.context.history as { role: string; content: string }[];
    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({ role: "user", content: msg.body });
    expect(history[1]).toMatchObject({ role: "assistant", content: result!.reply });
  });

  it("system prompt monta do tenant + cardápio, e o histórico entra nos turnos seguintes", async () => {
    const deps = makeDeps(["Primeira resposta.", "Segunda resposta."]);
    const tenant = makeTenant();

    await processIncomingMessage(deps, tenant, makeMessage("Oi!"));
    await processIncomingMessage(deps, tenant, makeMessage("Tem lanche vegetariano?"));

    const firstCall = deps.llm.calls[0]!;
    const system = firstCall.messages[0]!;
    expect(system.role).toBe("system");
    expect(system.content).toContain("Ponto do Lanche");
    expect(system.content).toContain("19:00");
    expect(system.content).toContain("• X-tudo — R$ 30,00");
    expect(system.content).not.toContain("{{"); // nenhum placeholder sobrou
    expect(firstCall.options.model).toBe("mock/modelo-teste");

    // 2º turno: system + user1 + assistant1 + user2
    const secondCall = deps.llm.calls[1]!;
    const roles = secondCall.messages.map((m) => m.role);
    expect(roles).toEqual(["system", "user", "assistant", "user"]);
    expect(secondCall.messages[2]!.content).toBe("Primeira resposta.");
  });

  it("pedido confirmado: cria order com total recalculado do cardápio e responde sem o bloco JSON", async () => {
    const canned =
      "Pedido confirmado! Já já chega aí 😄\n\n<<<JSON\n" +
      JSON.stringify({
        items: [
          { name: "X-Tudo", quantity: 2, observation: "sem cebola" },
          { name: "Coca Cola Lata", quantity: 1 }
        ],
        deliveryNeeded: true,
        address: "Rua das Laranjeiras, 123",
        paymentMethod: "Pix"
      }) +
      "\n>>>";
    const deps = makeDeps([canned]);
    const tenant = makeTenant();
    const msg = makeMessage("pode fechar!");

    const result = await processIncomingMessage(deps, tenant, msg);

    expect(result!.order).not.toBeNull();
    const order = result!.order!;
    // X-Tudo 30,00 ×2 + Coca Cola Lata 5,00 — preço vem do CARDÁPIO, não do LLM
    expect(order.total).toBe(65);
    expect(order.tenantId).toBe(tenant.id);
    expect(order.customerPhone).toBe(msg.from);
    expect(order.deliveryNeeded).toBe(true);
    expect(order.address).toBe("Rua das Laranjeiras, 123");
    expect(order.paymentMethod).toBe("Pix");
    expect(order.source).toBe("bot");
    expect(order.idempotencyKey).toBe(msg.messageId);

    // Cliente nunca vê o bloco JSON
    expect(result!.reply).toBe("Pedido confirmado! Já já chega aí 😄");
    expect(deps.whatsapp.sent[0]!.text).not.toContain("<<<JSON");

    const persisted = await deps.orders.listByTenant(tenant.id);
    expect(persisted).toHaveLength(1);
  });

  it("item fora do cardápio não entra no total (e não derruba o pedido)", async () => {
    const canned =
      "Fechado!\n<<<JSON\n" +
      JSON.stringify({
        items: [
          { name: "X-Tudo", quantity: 1 },
          { name: "Pizza Gigante", quantity: 3 }
        ],
        deliveryNeeded: false
      }) +
      "\n>>>";
    const deps = makeDeps([canned]);

    const result = await processIncomingMessage(deps, makeTenant(), makeMessage("confirma"));

    expect(result!.order!.total).toBe(30); // só o X-Tudo
  });

  it("resposta com header Markdown é corrigida pelo guard antes de enviar", async () => {
    const deps = makeDeps(["# CARDÁPIO\nTemos X-Tudo."]);

    const result = await processIncomingMessage(deps, makeTenant(), makeMessage("cardápio?"));

    expect(result!.reply).toBe("* CARDÁPIO\nTemos X-Tudo.");
  });

  it("mensagem de grupo é ignorada: nada enviado, nada persistido", async () => {
    const deps = makeDeps(["não deveria ser usada"]);
    const tenant = makeTenant();
    const msg = makeMessage("mensagem no grupo", { isGroup: true });

    const result = await processIncomingMessage(deps, tenant, msg);

    expect(result).toBeNull();
    expect(deps.whatsapp.sent).toHaveLength(0);
    expect(deps.llm.calls).toHaveLength(0);
    expect(await deps.sessions.getByPhone(tenant.id, msg.from)).toBeNull();
  });

  it("reprocessar a mesma mensagem de pedido não duplica (idempotency_key única)", async () => {
    const canned =
      "Fechado!\n<<<JSON\n" + JSON.stringify({ items: [{ name: "X-Tudo", quantity: 1 }] }) + "\n>>>";
    const deps = makeDeps([canned, canned]);
    const tenant = makeTenant();
    const msg = makeMessage("pode fechar");

    await processIncomingMessage(deps, tenant, msg);
    // Mesmo messageId de novo (ex.: reentrega do webhook antes da dedup do Épico 3)
    expect(processIncomingMessage(deps, tenant, msg)).rejects.toThrow(/duplicado/i);
    expect(await deps.orders.listByTenant(tenant.id)).toHaveLength(1);
  });
});
