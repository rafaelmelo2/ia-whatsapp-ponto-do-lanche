// Mock in-memory da porta de fila — mesmas semânticas do BullMQ que importam
// pros testes: dedup por jobId (tenantId:messageId), retry até `attempts` e
// DLQ ao esgotar. Zero rede. `idle()` espera todo o processamento pendente.
import type {
  IncomingJobHandler,
  IncomingMessageJob,
  MessageQueueConsumer,
  MessageQueueProducer
} from "@sirvase/core";

export interface DeadLetteredJob extends IncomingMessageJob {
  failedReason: string;
}

export class InMemoryMessageQueue implements MessageQueueProducer, MessageQueueConsumer {
  /** Todo job aceito (pra asserção de produção). */
  readonly enqueued: IncomingMessageJob[] = [];
  /** Jobs processados com sucesso. */
  readonly processed: IncomingMessageJob[] = [];
  /** Jobs que esgotaram as tentativas. */
  readonly dlq: DeadLetteredJob[] = [];

  private handler: IncomingJobHandler | null = null;
  private seenJobIds = new Set<string>();
  private pending: Promise<void>[] = [];

  constructor(private attempts = 3) {}

  async enqueue(job: IncomingMessageJob): Promise<void> {
    const jobId = `${job.tenantId}:${job.message.messageId}`;
    if (this.seenJobIds.has(jobId)) return; // mesma semântica do jobId do BullMQ
    this.seenJobIds.add(jobId);
    this.enqueued.push(job);
    if (this.handler) {
      this.pending.push(this.run(job, this.handler));
    }
  }

  start(handler: IncomingJobHandler): void {
    this.handler = handler;
    // Consome o que chegou antes do start (BullMQ também não perde o backlog).
    for (const job of this.enqueued) {
      this.pending.push(this.run(job, handler));
    }
  }

  async close(): Promise<void> {
    await this.idle();
    this.handler = null;
  }

  /** Espera todos os jobs em voo (incluindo retries) terminarem. */
  async idle(): Promise<void> {
    while (this.pending.length > 0) {
      const batch = this.pending;
      this.pending = [];
      await Promise.all(batch);
    }
  }

  private async run(job: IncomingMessageJob, handler: IncomingJobHandler): Promise<void> {
    for (let attempt = 1; attempt <= this.attempts; attempt++) {
      try {
        await handler(job);
        this.processed.push(job);
        return;
      } catch (error) {
        if (attempt === this.attempts) {
          this.dlq.push({ ...job, failedReason: error instanceof Error ? error.message : String(error) });
        }
      }
    }
  }
}
