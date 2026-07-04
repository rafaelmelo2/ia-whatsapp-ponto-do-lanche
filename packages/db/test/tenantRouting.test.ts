// Prova do P4.0/P4.2: tenants.wa_number roteia mensagens da Evolution do mesmo jeito
// que wa_phone_number_id roteia a Meta. Integração — conecta no Postgres local
// (loopback 127.0.0.1:15432); pula gracioso se o banco estiver inacessível.
import { SQL, randomUUIDv7 } from "bun";
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { PgTenantRepository } from "../src/index.ts";

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
  console.warn("[tenantRouting] Postgres inacessível — pulando testes de roteamento.");
}

const tenantId = randomUUIDv7();
const WA_NUMBER = "5511900000001";
const tenants = new PgTenantRepository(testSql);

describe.skipIf(!dbUp)("roteamento por wa_number (P4.0)", () => {
  beforeAll(async () => {
    await testSql.unsafe(
      "INSERT INTO tenants (id, store_name, wa_number, wa_provider) VALUES ($1, 'Tenant Evolution Teste', $2, 'evolution')",
      [tenantId, WA_NUMBER]
    );
  });

  afterAll(async () => {
    await testSql.unsafe("DELETE FROM tenants WHERE id = $1", [tenantId]);
    await testSql.close();
  });

  it("resolve tenant pelo wa_number", async () => {
    const found = await tenants.findByWaNumber(WA_NUMBER);
    expect(found?.id).toBe(tenantId);
    expect(found?.waProvider).toBe("evolution");
  });

  it("wa_number desconhecido retorna null", async () => {
    const found = await tenants.findByWaNumber("0000000000000");
    expect(found).toBeNull();
  });
});
