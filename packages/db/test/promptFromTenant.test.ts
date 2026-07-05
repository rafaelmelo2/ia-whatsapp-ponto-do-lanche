// Prova do DoD de P2.3: o prompt monta a partir de um tenant CARREGADO DO BANCO
// (seed Ponto do Lanche), não mais de YAML. Integração — mesmo padrão do
// tenantIsolation.test.ts: pula gracioso se o Postgres local não estiver de pé.
import { SQL } from "bun";
import { afterAll, describe, expect, it } from "bun:test";
import { PromptBuilder, renderMenu, tenantConfigFromRow } from "@sirvase/core";
import type { MenuItem } from "@sirvase/core";
import { PgTenantRepository } from "../src/index.ts";

const PONTO_DO_LANCHE_ID = "a278e80f-399d-47d9-b4db-9b3f6798d147";

const testSql = new SQL({
  hostname: process.env.TEST_POSTGRES_HOST ?? "127.0.0.1",
  port: Number(process.env.TEST_POSTGRES_PORT ?? 15432),
  database: process.env.POSTGRES_DB ?? "sirvase",
  username: process.env.POSTGRES_USER ?? "sirvase",
  password: process.env.POSTGRES_PASSWORD ?? "",
  max: 2
});

let dbUp = true;
try {
  await testSql.unsafe("SELECT 1");
} catch {
  dbUp = false;
  console.warn("[promptFromTenant] Postgres inacessível — pulando teste de prompt do banco.");
}

const MENU_FIXTURE: MenuItem[] = [
  {
    id: 1,
    name: "X-Tudo",
    basePrice: 30,
    active: true,
    showOnWebsite: true,
    category: { id: 1, name: "Hamburger" }
  }
];

describe.skipIf(!dbUp)("prompt a partir do tenant do banco (P2.3)", () => {
  afterAll(async () => {
    await testSql.close();
  });

  it("carrega o Ponto do Lanche do Postgres e monta o system prompt completo", async () => {
    const tenants = new PgTenantRepository(testSql);
    const tenant = await tenants.findById(PONTO_DO_LANCHE_ID);
    expect(tenant).not.toBeNull(); // seed precisa ter rodado (bun run db:seed)

    const config = tenantConfigFromRow(tenant!);
    expect(config.store.name).toBe("Ponto do Lanche");
    expect(config.store.id).toBe(PONTO_DO_LANCHE_ID); // coluna vence o slug do jsonb

    const prompt = new PromptBuilder().build(config, renderMenu(config.store.name, MENU_FIXTURE));

    expect(prompt).toContain("Ponto do Lanche");
    expect(prompt).toContain("19:00 às 22:30");
    expect(prompt).toContain("• X-tudo — R$ 30,00");
    expect(prompt).not.toContain("{{"); // nenhum placeholder sobrou
  });
});
