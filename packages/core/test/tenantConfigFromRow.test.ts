// P2.3 — a config de negócio nasce do TenantRow (banco): jsonb validado por Zod,
// colunas canônicas da tabela vencendo o jsonb. Teste puro, sem banco.
import { describe, expect, it } from "bun:test";
import type { TenantRow } from "../src/ports/repositories.js";
import { TenantConfigError, tenantConfigFromRow } from "../src/config/tenantConfigFromRow.js";
import { PromptBuilder } from "../src/llm/promptBuilder.js";

const VALID_CONFIG = {
  store: { id: "slug-antigo", name: "Nome Antigo No Jsonb", phone: "+5511999999999" },
  hours: { open: "19:00", close: "22:30", days_open: ["Sexta-feira", "Sábado"] },
  payments: { methods: ["Pix", "Dinheiro"] },
  delivery: { enabled: true, eta_min: 20, eta_max: 50, minimum_fee: 5 },
  menu: { api_url: "http://jsonb.local/menu", currency: "BRL" },
  upsell: { default_suggestions: ["refrigerante"], best_sellers_tag: "mais_vendido" },
  tone: { greeting: "Oi!", emojis: "moderado", style: "estilo do jsonb" },
  llm: { model: "mock/modelo", temperature: 0.5, max_tokens: 1000 }
};

function makeRow(overrides: Partial<TenantRow> = {}): TenantRow {
  const now = new Date();
  return {
    id: "22222222-2222-2222-2222-222222222222",
    storeName: "Loja da Coluna",
    storeType: "hamburgueria",
    catalogApiUrl: "http://coluna.local/menu",
    pixKey: null,
    systemPromptPersonality: null,
    config: VALID_CONFIG,
    active: true,
    waNumber: "5511999999999",
    waProvider: "evolution",
    waPhoneNumberId: null,
    wabaId: null,
    status: "trial",
    plan: null,
    cardapioSource: "external",
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

describe("tenantConfigFromRow (P2.3)", () => {
  it("valida o jsonb e aplica as colunas canônicas por cima", () => {
    const config = tenantConfigFromRow(makeRow());

    expect(config.store.id).toBe("22222222-2222-2222-2222-222222222222");
    expect(config.store.name).toBe("Loja da Coluna"); // coluna vence o jsonb
    expect(config.menu.api_url).toBe("http://coluna.local/menu"); // idem
    expect(config.hours.open).toBe("19:00"); // resto vem do jsonb
    expect(config.tone.style).toBe("estilo do jsonb");
  });

  it("system_prompt_personality (coluna) sobrepõe tone.style do jsonb", () => {
    const config = tenantConfigFromRow(makeRow({ systemPromptPersonality: "seco e formal" }));
    expect(config.tone.style).toBe("seco e formal");
  });

  it("config jsonb inválida explode com TenantConfigError (fail-fast)", () => {
    const row = makeRow({ config: { store: { name: "só isso" } } });
    expect(() => tenantConfigFromRow(row)).toThrow(TenantConfigError);
  });

  it("o prompt montado do tenant não deixa placeholder pra trás", () => {
    const config = tenantConfigFromRow(makeRow());
    const prompt = new PromptBuilder().build(config, "*CARDÁPIO MOCK*");

    expect(prompt).toContain("Loja da Coluna");
    expect(prompt).toContain("19:00 às 22:30");
    expect(prompt).toContain("Pix, Dinheiro");
    expect(prompt).toContain("*CARDÁPIO MOCK*");
    expect(prompt).not.toContain("{{");
  });
});
