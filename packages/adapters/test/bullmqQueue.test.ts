// Prova do DoD de P3.1 contra Redis REAL (loopback 127.0.0.1:16379 do compose):
// job entra e é consumido; handler que falha até esgotar as tentativas cai na
// DLQ. Pula gracioso se o Redis não estiver de pé (mesmo padrão dos testes de DB).
import { RedisClient } from "bun";
import { afterAll, describe, expect, it } from "bun:test";
import { Queue } from "bullmq";
import type { IncomingMessageJob } from "@sirvase/core";
import { BullMqConsumer, BullMqProducer } from "../src/index.js";

const REDIS_HOST = process.env.TEST_REDIS_HOST ?? "127.0.0.1";
const REDIS_PORT = Number(process.env.TEST_REDIS_PORT ?? 16379);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD ?? "";

let redisUp = true;
try {
  const probe = new RedisClient(
    `redis://:${encodeURIComponent(REDIS_PASSWORD)}@${REDIS_HOST}:${REDIS_PORT}`,
    { connectionTimeout: 1500 }
  );
  await probe.send("PING", []);
  probe.close();
} catch {
  redisUp = false;
  console.warn(`[bullmqQueue] Redis inacessível em ${REDIS_HOST}:${REDIS_PORT} — pulando testes da fila.`);
}

const conn = { host: REDIS_HOST, port: REDIS_PORT, password: REDIS_PASSWORD };
// Nome único por run: não colide com a fila real nem com um run anterior sujo.
const QUEUE_NAME = `test-incoming-${Date.now()}`;

function makeJob(messageId: string): IncomingMessageJob {
  return {
    tenantId: "55555555-5555-5555-5555-555555555555",
    message: { from: "5511966665555", body: "oi", isGroup: false, messageId }
  };
}

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`timeout: ${what}`)), ms))
  ]);
}

const toClose: { close(): Promise<void> }[] = [];

describe.skipIf(!redisUp)("fila BullMQ (P3.1) — Redis real", () => {
  afterAll(async () => {
    for (const closeable of toClose) {
      await closeable.close().catch(() => {});
    }
    // Limpa as filas de teste do Redis
    for (const name of [QUEUE_NAME, `${QUEUE_NAME}-dlq`, `${QUEUE_NAME}-b`, `${QUEUE_NAME}-b-dlq`]) {
      const q = new Queue(name, { connection: { ...conn, maxRetriesPerRequest: null } });
      await q.obliterate({ force: true }).catch(() => {});
      await q.close();
    }
  });

  it("job enfileirado é consumido (e jobId dedupa reentrega)", async () => {
    const producer = new BullMqProducer(QUEUE_NAME, conn);
    const consumer = new BullMqConsumer(QUEUE_NAME, conn);
    toClose.push(producer, consumer);

    const consumed: IncomingMessageJob[] = [];
    let resolveFirst: () => void;
    const firstConsumed = new Promise<void>((resolve) => (resolveFirst = resolve));

    consumer.start(async (job) => {
      consumed.push(job);
      resolveFirst();
    });

    await producer.enqueue(makeJob("bull-msg-1"));
    await producer.enqueue(makeJob("bull-msg-1")); // mesma mensagem: jobId igual, não duplica

    await withTimeout(firstConsumed, 10_000, "consumo do job");
    // Margem pra um eventual segundo job (que não deve existir) ser processado
    await new Promise((r) => setTimeout(r, 300));

    expect(consumed).toHaveLength(1);
    expect(consumed[0]!.message.messageId).toBe("bull-msg-1");
  });

  it("handler que sempre falha: job esgota as tentativas e aparece na DLQ", async () => {
    const name = `${QUEUE_NAME}-b`;
    const producer = new BullMqProducer(name, conn, { attempts: 2, backoffMs: 10 });
    const consumer = new BullMqConsumer(name, conn, { attempts: 2 });
    toClose.push(producer, consumer);

    consumer.start(async () => {
      throw new Error("falha proposital pro teste de DLQ");
    });

    await producer.enqueue(makeJob("bull-msg-dead"));

    // Espera o job aparecer na DLQ (retry 2x com backoff de ~10ms antes disso)
    const dlq = new Queue(`${name}-dlq`, { connection: { ...conn, maxRetriesPerRequest: null } });
    const deadline = Date.now() + 10_000;
    let dlqJobs: { data: { message?: { messageId?: string }; failedReason?: string } }[] = [];
    while (Date.now() < deadline) {
      dlqJobs = await dlq.getJobs(["waiting", "delayed", "completed"]);
      if (dlqJobs.length > 0) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    await dlq.close();

    expect(dlqJobs).toHaveLength(1);
    expect(dlqJobs[0]!.data.message?.messageId).toBe("bull-msg-dead");
    expect(dlqJobs[0]!.data.failedReason).toContain("falha proposital");
  });
});
