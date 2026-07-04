import { describe, expect, test } from "bun:test";
import type { IncomingMessage, TenantRepository, TenantRow, WhatsAppProvider } from "@sirvase/core";
import { createRouter } from "../src/router.ts";

function fakeTenant(overrides: Partial<TenantRow> = {}): TenantRow {
  return {
    id: "tenant-1",
    storeName: "Loja Teste",
    storeType: null,
    catalogApiUrl: null,
    pixKey: null,
    systemPromptPersonality: null,
    config: {},
    active: true,
    waNumber: "5511999990001",
    waProvider: "evolution",
    waPhoneNumberId: null,
    wabaId: null,
    status: "trial",
    plan: null,
    cardapioSource: "internal",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  };
}

class FakeTenantRepository implements TenantRepository {
  constructor(private readonly tenant: TenantRow | null) {}
  async findById(): Promise<TenantRow | null> {
    return this.tenant;
  }
  async findByPhoneNumberId(id: string): Promise<TenantRow | null> {
    return this.tenant?.waPhoneNumberId === id ? this.tenant : null;
  }
  async findByWaNumber(waNumber: string): Promise<TenantRow | null> {
    return this.tenant?.waNumber === waNumber ? this.tenant : null;
  }
}

class FakeProvider implements WhatsAppProvider {
  public sent: Array<{ to: string; text: string }> = [];
  constructor(private readonly fixedMessage: IncomingMessage | null) {}
  parseWebhook(): IncomingMessage | null {
    return this.fixedMessage;
  }
  async sendText(to: string, text: string): Promise<void> {
    this.sent.push({ to, text });
  }
  async markAsRead(): Promise<void> {}
}

const INCOMING: IncomingMessage = {
  from: "5511888887777",
  body: "Oi, quero um lanche",
  isGroup: false,
  messageId: "msg-1"
};

describe("webhook router — Evolution", () => {
  test("token correto + instância conhecida: eco enviado", async () => {
    const provider = new FakeProvider(INCOMING);
    const handle = createRouter({
      tenants: new FakeTenantRepository(fakeTenant()),
      makeEvolutionProvider: () => provider,
      makeCloudApiProvider: () => new FakeProvider(null),
      evolutionWebhookToken: "token-secreto"
    });

    const res = await handle(
      new Request("http://webhook.test/webhook/evolution?token=token-secreto", {
        method: "POST",
        body: JSON.stringify({ event: "messages.upsert", instance: "5511999990001" })
      })
    );

    expect(res.status).toBe(200);
    expect(provider.sent).toEqual([{ to: "5511888887777", text: "eco: Oi, quero um lanche" }]);
  });

  test("token errado: 401 e nada enviado", async () => {
    const provider = new FakeProvider(INCOMING);
    const handle = createRouter({
      tenants: new FakeTenantRepository(fakeTenant()),
      makeEvolutionProvider: () => provider,
      makeCloudApiProvider: () => new FakeProvider(null),
      evolutionWebhookToken: "token-secreto"
    });

    const res = await handle(
      new Request("http://webhook.test/webhook/evolution?token=errado", {
        method: "POST",
        body: JSON.stringify({ event: "messages.upsert", instance: "5511999990001" })
      })
    );

    expect(res.status).toBe(401);
    expect(provider.sent).toEqual([]);
  });

  test("instância desconhecida: 200 (evita retry) mas nada enviado", async () => {
    const provider = new FakeProvider(INCOMING);
    const handle = createRouter({
      tenants: new FakeTenantRepository(null),
      makeEvolutionProvider: () => provider,
      makeCloudApiProvider: () => new FakeProvider(null),
      evolutionWebhookToken: "token-secreto"
    });

    const res = await handle(
      new Request("http://webhook.test/webhook/evolution?token=token-secreto", {
        method: "POST",
        body: JSON.stringify({ event: "messages.upsert", instance: "instancia-desconhecida" })
      })
    );

    expect(res.status).toBe(200);
    expect(provider.sent).toEqual([]);
  });
});

describe("webhook router — Meta", () => {
  test("GET verify: token certo devolve o challenge", async () => {
    const handle = createRouter({
      tenants: new FakeTenantRepository(null),
      makeEvolutionProvider: () => new FakeProvider(null),
      makeCloudApiProvider: () => new FakeProvider(null),
      metaVerifyToken: "verify-123"
    });

    const res = await handle(
      new Request(
        "http://webhook.test/webhook/meta?hub.mode=subscribe&hub.verify_token=verify-123&hub.challenge=abc"
      )
    );

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("abc");
  });

  test("GET verify: token errado devolve 403", async () => {
    const handle = createRouter({
      tenants: new FakeTenantRepository(null),
      makeEvolutionProvider: () => new FakeProvider(null),
      makeCloudApiProvider: () => new FakeProvider(null),
      metaVerifyToken: "verify-123"
    });

    const res = await handle(
      new Request(
        "http://webhook.test/webhook/meta?hub.mode=subscribe&hub.verify_token=errado&hub.challenge=abc"
      )
    );

    expect(res.status).toBe(403);
  });

  test("POST sem assinatura válida: 403 e nada enviado", async () => {
    const provider = new FakeProvider(INCOMING);
    const handle = createRouter({
      tenants: new FakeTenantRepository(fakeTenant({ waPhoneNumberId: "123456789012345" })),
      makeEvolutionProvider: () => new FakeProvider(null),
      makeCloudApiProvider: () => provider,
      metaAppSecret: "app-secret-teste"
    });

    const res = await handle(
      new Request("http://webhook.test/webhook/meta", {
        method: "POST",
        headers: { "X-Hub-Signature-256": "sha256=deadbeef" },
        body: JSON.stringify({
          entry: [{ changes: [{ value: { metadata: { phone_number_id: "123456789012345" } } }] }]
        })
      })
    );

    expect(res.status).toBe(403);
    expect(provider.sent).toEqual([]);
  });

  test("POST com assinatura válida + tenant conhecido: eco enviado", async () => {
    const provider = new FakeProvider(INCOMING);
    const appSecret = "app-secret-teste";
    const body = JSON.stringify({
      entry: [{ changes: [{ value: { metadata: { phone_number_id: "123456789012345" } } }] }]
    });
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(appSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const sigBytes = new Uint8Array(
      await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body))
    );
    const hex = Array.from(sigBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const handle = createRouter({
      tenants: new FakeTenantRepository(fakeTenant({ waPhoneNumberId: "123456789012345" })),
      makeEvolutionProvider: () => new FakeProvider(null),
      makeCloudApiProvider: () => provider,
      metaAppSecret: appSecret
    });

    const res = await handle(
      new Request("http://webhook.test/webhook/meta", {
        method: "POST",
        headers: { "X-Hub-Signature-256": `sha256=${hex}` },
        body
      })
    );

    expect(res.status).toBe(200);
    expect(provider.sent).toEqual([{ to: "5511888887777", text: "eco: Oi, quero um lanche" }]);
  });
});
