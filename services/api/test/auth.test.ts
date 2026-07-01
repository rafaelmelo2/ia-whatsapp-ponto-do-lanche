// DoD de P1.4: login devolve JWT; rota protegida rejeita sem token (401) e filtra
// por tenant. Integração — conecta no Postgres local (loopback 127.0.0.1:15432);
// pula gracioso se o banco estiver inacessível. Monta o router com repos apontando
// p/ o banco de teste (sem subir servidor). Cria 2 tenants + 1 admin descartáveis e
// limpa no afterAll (FK CASCADE remove users/orders).
import { SQL, randomUUIDv7 } from "bun";
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { PgOrderRepository, PgUserRepository } from "@sirvase/db";
import { AuthService } from "../src/auth/service.ts";
import { createRouter } from "../src/router.ts";

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
  console.warn("[auth.test] Postgres inacessível — pulando testes de auth.");
}

const tenantA = randomUUIDv7();
const tenantB = randomUUIDv7();
const ADMIN_EMAIL = `admin+${tenantA.slice(0, 8)}@teste.local`;
const ADMIN_PASSWORD = "senha-super-secreta";

const auth = new AuthService(new PgUserRepository(testSql));
const orders = new PgOrderRepository(testSql);
const handle = createRouter({ auth, orders });

function post(path: string, body: unknown, token?: string): Request {
  return new Request(`http://api.test${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(body)
  });
}
function get(path: string, token?: string): Request {
  return new Request(`http://api.test${path}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {}
  });
}

describe.skipIf(!dbUp)("auth JWT (P1.4)", () => {
  let adminToken: string;

  beforeAll(async () => {
    await testSql.unsafe(
      "INSERT INTO tenants (id, store_name) VALUES ($1, 'Auth Tenant A Teste'), ($2, 'Auth Tenant B Teste')",
      [tenantA, tenantB]
    );
    // Bootstrap do admin do tenant A direto pelo serviço.
    const res = await auth.signup({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      name: "Admin Teste",
      tenantId: tenantA,
      role: "admin"
    });
    adminToken = res.token;
    // Uma ordem em cada tenant p/ provar o filtro.
    await orders.create(tenantA, { customerPhone: "+55A", items: [{ a: 1 }], total: 10 });
    await orders.create(tenantB, { customerPhone: "+55B", items: [{ b: 1 }], total: 20 });
  });

  afterAll(async () => {
    await testSql.unsafe("DELETE FROM tenants WHERE id = $1 OR id = $2", [tenantA, tenantB]);
    await testSql.close();
  });

  it("login com senha certa devolve JWT + user (sem hash)", async () => {
    const res = await handle(post("/auth/login", { email: ADMIN_EMAIL, password: ADMIN_PASSWORD }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { token: string; user: Record<string, unknown> };
    expect(typeof data.token).toBe("string");
    expect(data.token.split(".")).toHaveLength(3);
    expect(data.user.email).toBe(ADMIN_EMAIL);
    expect(data.user.passwordHash).toBeUndefined();
    expect(data.user.tenantId).toBe(tenantA);
  });

  it("login com senha errada devolve 401", async () => {
    const res = await handle(post("/auth/login", { email: ADMIN_EMAIL, password: "errada" }));
    expect(res.status).toBe(401);
  });

  it("rota protegida sem token devolve 401", async () => {
    expect((await handle(get("/me"))).status).toBe(401);
    expect((await handle(get("/orders"))).status).toBe(401);
  });

  it("rota protegida com token inválido devolve 401", async () => {
    const res = await handle(get("/me", "lixo.naoe.jwt"));
    expect(res.status).toBe(401);
  });

  it("/me com token válido devolve o contexto do tenant", async () => {
    const res = await handle(get("/me", adminToken));
    expect(res.status).toBe(200);
    const ctx = (await res.json()) as { tenantId: string; role: string };
    expect(ctx.tenantId).toBe(tenantA);
    expect(ctx.role).toBe("admin");
  });

  it("/orders filtra pelo tenant do token (nunca vê outro tenant)", async () => {
    const res = await handle(get("/orders", adminToken));
    expect(res.status).toBe(200);
    const { orders: list } = (await res.json()) as { orders: Array<{ tenantId: string }> };
    expect(list).toHaveLength(1);
    expect(list.every((o) => o.tenantId === tenantA)).toBe(true);
  });

  it("signup exige admin: token client recebe 403", async () => {
    // Cria um client no tenant B e tenta usar o token dele p/ criar usuário.
    const clientEmail = `client+${tenantB.slice(0, 8)}@teste.local`;
    const { token: clientToken } = await auth.signup({
      email: clientEmail,
      password: "outra-senha-8+",
      name: "Client Teste",
      tenantId: tenantB,
      role: "client"
    });
    const res = await handle(
      post(
        "/auth/signup",
        { email: "x@teste.local", password: "12345678", name: "X", tenantId: tenantB },
        clientToken
      )
    );
    expect(res.status).toBe(403);
  });
});
