// Prova do DoD de P1.3: um repositório escopado por tenant NUNCA lê nem escreve
// linha de outro tenant. Teste de integração — conecta no Postgres local (loopback
// exposto em 127.0.0.1:15432). Se o banco não estiver acessível, os testes pulam
// (mantém `bun test` verde em ambiente sem DB). Cria 2 tenants descartáveis e limpa
// tudo no fim (FK ON DELETE CASCADE remove orders/sessions).
import { SQL, randomUUIDv7 } from "bun";
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { PgOrderRepository, PgSessionRepository, PgTenantRepository } from "../src/index.ts";

const testSql = new SQL({
  hostname: process.env.TEST_POSTGRES_HOST ?? "127.0.0.1",
  port: Number(process.env.TEST_POSTGRES_PORT ?? 15432),
  database: process.env.POSTGRES_DB ?? "sirvase",
  username: process.env.POSTGRES_USER ?? "sirvase",
  password: process.env.POSTGRES_PASSWORD ?? "",
  max: 2
});

// Probe de conexão antes de definir os testes (top-level await roda antes da coleta).
let dbUp = true;
try {
  await testSql.unsafe("SELECT 1");
} catch {
  dbUp = false;
  console.warn(
    "[tenantIsolation] Postgres inacessível em " +
      `${process.env.TEST_POSTGRES_HOST ?? "127.0.0.1"}:${process.env.TEST_POSTGRES_PORT ?? 15432}` +
      " — pulando testes de isolamento."
  );
}

const tenantA = randomUUIDv7();
const tenantB = randomUUIDv7();

const orders = new PgOrderRepository(testSql);
const sessions = new PgSessionRepository(testSql);
const tenants = new PgTenantRepository(testSql);

describe.skipIf(!dbUp)("isolamento por tenant (P1.3)", () => {
  beforeAll(async () => {
    await testSql.unsafe(
      "INSERT INTO tenants (id, store_name) VALUES ($1, 'Tenant A Teste'), ($2, 'Tenant B Teste')",
      [tenantA, tenantB]
    );
  });

  afterAll(async () => {
    await testSql.unsafe("DELETE FROM tenants WHERE id = $1 OR id = $2", [tenantA, tenantB]);
    await testSql.close();
  });

  it("listByTenant retorna só as ordens do próprio tenant", async () => {
    await orders.create(tenantA, { customerPhone: "+5511111111111", items: [{ x: 1 }], total: 10 });
    await orders.create(tenantA, { customerPhone: "+5511111111111", items: [{ x: 2 }], total: 20 });
    await orders.create(tenantB, { customerPhone: "+5522222222222", items: [{ y: 1 }], total: 99 });

    const aList = await orders.listByTenant(tenantA);
    const bList = await orders.listByTenant(tenantB);

    expect(aList).toHaveLength(2);
    expect(bList).toHaveLength(1);
    expect(aList.every((o) => o.tenantId === tenantA)).toBe(true);
    expect(bList.every((o) => o.tenantId === tenantB)).toBe(true);
  });

  it("findById cross-tenant retorna null (leitura bloqueada)", async () => {
    const bOrder = await orders.create(tenantB, {
      customerPhone: "+5522222222222",
      items: [{ y: 2 }],
      total: 50
    });

    // Tenant A tentando ler a ordem do tenant B pelo id real → não enxerga.
    expect(await orders.findById(tenantA, bOrder.id)).toBeNull();
    // O dono enxerga normalmente.
    expect(await orders.findById(tenantB, bOrder.id)).not.toBeNull();
  });

  it("updateStatus cross-tenant não afeta linha (escrita bloqueada)", async () => {
    const bOrder = await orders.create(tenantB, {
      customerPhone: "+5522222222222",
      items: [{ y: 3 }],
      total: 30
    });

    const crossUpdate = await orders.updateStatus(tenantA, bOrder.id, "cancelled");
    expect(crossUpdate).toBeNull();

    // A ordem do tenant B permanece intacta.
    const untouched = await orders.findById(tenantB, bOrder.id);
    expect(untouched?.status).toBe("pending");
  });

  it("sessions com o MESMO phone em tenants diferentes ficam isoladas", async () => {
    const phone = "+5533333333333";
    await sessions.upsert(tenantA, phone, { lastStep: "greeting" });
    await sessions.upsert(tenantB, phone, { lastStep: "checkout" });

    const aSession = await sessions.getByPhone(tenantA, phone);
    const bSession = await sessions.getByPhone(tenantB, phone);

    expect(aSession?.context.lastStep).toBe("greeting");
    expect(bSession?.context.lastStep).toBe("checkout");
    expect(aSession?.id).not.toBe(bSession?.id);
  });

  it("tenantRepo.findById devolve o tenant certo", async () => {
    const a = await tenants.findById(tenantA);
    expect(a?.storeName).toBe("Tenant A Teste");
  });
});
