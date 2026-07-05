// P3.2: o webhook valida, resolve tenant e SÓ ENFILEIRA (o eco morreu — quem
// processa/responde é o worker). Payloads realistas dos dois provedores; o
// parse é o real dos adapters, a fila é o mock in-memory.
import { describe, expect, test } from "bun:test";
import type { IncomingMessageJob, MessageQueueProducer, TenantRepository, TenantRow } from "@sirvase/core";
import { InMemoryMessageQueue } from "@sirvase/adapters";
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

/** Simula Redis fora do ar: enqueue explode. */
class FailingQueue implements MessageQueueProducer {
  async enqueue(_job: IncomingMessageJob): Promise<void> {
    throw new Error("Redis indisponível");
  }
}

// Payload realista da Evolution (messages.upsert, texto simples).
const EVOLUTION_PAYLOAD = {
  event: "messages.upsert",
  instance: "5511999990001",
  data: {
    key: { remoteJid: "5511888887777@s.whatsapp.net", fromMe: false, id: "evo-msg-1" },
    pushName: "Cliente Teste",
    message: { conversation: "Oi, quero um lanche" }
  }
};

// Payload realista da Meta (mensagem de texto).
const META_PAYLOAD = {
  entry: [
    {
      changes: [
        {
          value: {
            metadata: { phone_number_id: "123456789012345" },
            contacts: [{ profile: { name: "Cliente Teste" } }],
            messages: [
              { from: "5511888887777", id: "meta-msg-1", type: "text", text: { body: "Oi, quero um lanche" } }
            ]
          }
        }
      ]
    }
  ]
};

async function signMeta(body: string, appSecret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
  const hex = Array.from(sigBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `sha256=${hex}`;
}

describe("webhook router — Evolution (P3.2: só enfileira)", () => {
  test("token correto + instância conhecida: job na fila, 200", async () => {
    const queue = new InMemoryMessageQueue();
    const handle = createRouter({
      tenants: new FakeTenantRepository(fakeTenant()),
      queue,
      evolutionWebhookToken: "token-secreto"
    });

    const res = await handle(
      new Request("http://webhook.test/webhook/evolution?token=token-secreto", {
        method: "POST",
        body: JSON.stringify(EVOLUTION_PAYLOAD)
      })
    );

    expect(res.status).toBe(200);
    expect(queue.enqueued).toEqual([
      {
        tenantId: "tenant-1",
        message: {
          from: "5511888887777",
          body: "Oi, quero um lanche",
          pushName: "Cliente Teste",
          isGroup: false,
          messageId: "evo-msg-1"
        }
      }
    ]);
  });

  test("token errado: 401 e fila vazia", async () => {
    const queue = new InMemoryMessageQueue();
    const handle = createRouter({
      tenants: new FakeTenantRepository(fakeTenant()),
      queue,
      evolutionWebhookToken: "token-secreto"
    });

    const res = await handle(
      new Request("http://webhook.test/webhook/evolution?token=errado", {
        method: "POST",
        body: JSON.stringify(EVOLUTION_PAYLOAD)
      })
    );

    expect(res.status).toBe(401);
    expect(queue.enqueued).toEqual([]);
  });

  test("instância desconhecida: 200 (evita retry) e fila vazia", async () => {
    const queue = new InMemoryMessageQueue();
    const handle = createRouter({
      tenants: new FakeTenantRepository(null),
      queue,
      evolutionWebhookToken: "token-secreto"
    });

    const res = await handle(
      new Request("http://webhook.test/webhook/evolution?token=token-secreto", {
        method: "POST",
        body: JSON.stringify({ ...EVOLUTION_PAYLOAD, instance: "instancia-desconhecida" })
      })
    );

    expect(res.status).toBe(200);
    expect(queue.enqueued).toEqual([]);
  });

  test("evento que não é mensagem de texto: 200 e fila vazia", async () => {
    const queue = new InMemoryMessageQueue();
    const handle = createRouter({
      tenants: new FakeTenantRepository(fakeTenant()),
      queue,
      evolutionWebhookToken: "token-secreto"
    });

    const res = await handle(
      new Request("http://webhook.test/webhook/evolution?token=token-secreto", {
        method: "POST",
        body: JSON.stringify({ event: "connection.update", instance: "5511999990001" })
      })
    );

    expect(res.status).toBe(200);
    expect(queue.enqueued).toEqual([]);
  });

  test("falha ao enfileirar (Redis fora): 500 pra forçar reentrega do provedor", async () => {
    const handle = createRouter({
      tenants: new FakeTenantRepository(fakeTenant()),
      queue: new FailingQueue(),
      evolutionWebhookToken: "token-secreto"
    });

    const res = await handle(
      new Request("http://webhook.test/webhook/evolution?token=token-secreto", {
        method: "POST",
        body: JSON.stringify(EVOLUTION_PAYLOAD)
      })
    );

    expect(res.status).toBe(500);
  });
});

describe("webhook router — Meta (P3.2: só enfileira)", () => {
  test("GET verify: token certo devolve o challenge", async () => {
    const handle = createRouter({
      tenants: new FakeTenantRepository(null),
      queue: new InMemoryMessageQueue(),
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
      queue: new InMemoryMessageQueue(),
      metaVerifyToken: "verify-123"
    });

    const res = await handle(
      new Request(
        "http://webhook.test/webhook/meta?hub.mode=subscribe&hub.verify_token=errado&hub.challenge=abc"
      )
    );

    expect(res.status).toBe(403);
  });

  test("POST sem assinatura válida: 403 e fila vazia", async () => {
    const queue = new InMemoryMessageQueue();
    const handle = createRouter({
      tenants: new FakeTenantRepository(fakeTenant({ waPhoneNumberId: "123456789012345" })),
      queue,
      metaAppSecret: "app-secret-teste"
    });

    const res = await handle(
      new Request("http://webhook.test/webhook/meta", {
        method: "POST",
        headers: { "X-Hub-Signature-256": "sha256=deadbeef" },
        body: JSON.stringify(META_PAYLOAD)
      })
    );

    expect(res.status).toBe(403);
    expect(queue.enqueued).toEqual([]);
  });

  test("POST com assinatura válida + tenant conhecido: job na fila, 200", async () => {
    const queue = new InMemoryMessageQueue();
    const appSecret = "app-secret-teste";
    const body = JSON.stringify(META_PAYLOAD);

    const handle = createRouter({
      tenants: new FakeTenantRepository(fakeTenant({ waPhoneNumberId: "123456789012345" })),
      queue,
      metaAppSecret: appSecret
    });

    const res = await handle(
      new Request("http://webhook.test/webhook/meta", {
        method: "POST",
        headers: { "X-Hub-Signature-256": await signMeta(body, appSecret) },
        body
      })
    );

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("EVENT_RECEIVED");
    expect(queue.enqueued).toEqual([
      {
        tenantId: "tenant-1",
        message: {
          from: "5511888887777",
          body: "Oi, quero um lanche",
          pushName: "Cliente Teste",
          isGroup: false,
          messageId: "meta-msg-1"
        }
      }
    ]);
  });

  test("status update (sem messages): 200 e fila vazia", async () => {
    const queue = new InMemoryMessageQueue();
    const appSecret = "app-secret-teste";
    const body = JSON.stringify({
      entry: [{ changes: [{ value: { metadata: { phone_number_id: "123456789012345" } } }] }]
    });

    const handle = createRouter({
      tenants: new FakeTenantRepository(fakeTenant({ waPhoneNumberId: "123456789012345" })),
      queue,
      metaAppSecret: appSecret
    });

    const res = await handle(
      new Request("http://webhook.test/webhook/meta", {
        method: "POST",
        headers: { "X-Hub-Signature-256": await signMeta(body, appSecret) },
        body
      })
    );

    expect(res.status).toBe(200);
    expect(queue.enqueued).toEqual([]);
  });

  test("falha ao enfileirar (Redis fora): 500 pra Meta reentregar", async () => {
    const appSecret = "app-secret-teste";
    const body = JSON.stringify(META_PAYLOAD);

    const handle = createRouter({
      tenants: new FakeTenantRepository(fakeTenant({ waPhoneNumberId: "123456789012345" })),
      queue: new FailingQueue(),
      metaAppSecret: appSecret
    });

    const res = await handle(
      new Request("http://webhook.test/webhook/meta", {
        method: "POST",
        headers: { "X-Hub-Signature-256": await signMeta(body, appSecret) },
        body
      })
    );

    expect(res.status).toBe(500);
  });
});
