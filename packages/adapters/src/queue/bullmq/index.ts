// Adapter BullMQ da porta de fila (Redis). Fila `incoming-messages` + DLQ
// `<nome>-dlq`: job que esgota as tentativas (retry exponencial) é copiado pra
// DLQ com o motivo — inspecionável e reprocessável na mão. Conexão vem de fora
// (settings via serviço), nunca de process.env aqui.
import { Queue, Worker, type ConnectionOptions } from "bullmq";
import type {
  IncomingJobHandler,
  IncomingMessageJob,
  MessageQueueConsumer,
  MessageQueueProducer
} from "@sirvase/core";
import { logger } from "@sirvase/core";

export interface BullMqConnection {
  host: string;
  port: number;
  password: string;
}

export interface BullMqQueueOptions {
  /** Tentativas totais antes de ir pra DLQ (default 3). */
  attempts?: number;
  /** Base do backoff exponencial em ms (default 1000). */
  backoffMs?: number;
  concurrency?: number;
}

const JOB_NAME = "incoming-message";

function toConnection(conn: BullMqConnection): ConnectionOptions {
  // maxRetriesPerRequest: null é exigência do BullMQ pra Workers (long-polling).
  return { host: conn.host, port: conn.port, password: conn.password, maxRetriesPerRequest: null };
}

export class BullMqProducer implements MessageQueueProducer {
  private queue: Queue;

  constructor(queueName: string, conn: BullMqConnection, opts: BullMqQueueOptions = {}) {
    this.queue = new Queue(queueName, {
      connection: toConnection(conn),
      defaultJobOptions: {
        attempts: opts.attempts ?? 3,
        backoff: { type: "exponential", delay: opts.backoffMs ?? 1000 },
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 5000 }
      }
    });
  }

  async enqueue(job: IncomingMessageJob): Promise<void> {
    // jobId determinístico: reentrega do provedor com o mesmo message_id nem
    // entra na fila de novo (1ª barreira; a dedup de verdade — durável — é
    // processed_messages no worker). Separador "__": BullMQ proíbe ":" em jobId.
    await this.queue.add(JOB_NAME, job, {
      jobId: `${job.tenantId}__${job.message.messageId}`
    });
  }

  async close(): Promise<void> {
    await this.queue.close();
  }
}

export class BullMqConsumer implements MessageQueueConsumer {
  private worker: Worker<IncomingMessageJob> | null = null;
  private dlq: Queue;

  constructor(
    private queueName: string,
    private conn: BullMqConnection,
    private opts: BullMqQueueOptions = {}
  ) {
    this.dlq = new Queue(`${queueName}-dlq`, { connection: toConnection(conn) });
  }

  start(handler: IncomingJobHandler): void {
    if (this.worker) {
      throw new Error("BullMqConsumer já iniciado");
    }
    this.worker = new Worker<IncomingMessageJob>(
      this.queueName,
      async (job) => handler(job.data),
      {
        connection: toConnection(this.conn),
        concurrency: this.opts.concurrency ?? 5
      }
    );

    this.worker.on("failed", (job, error) => {
      if (!job) return;
      const attempts = job.opts.attempts ?? 1;
      const logCtx = {
        tenantId: job.data.tenantId,
        messageId: job.data.message.messageId,
        attempt: job.attemptsMade,
        error: error.message
      };
      if (job.attemptsMade >= attempts) {
        logger.error("queue: job esgotou as tentativas, movendo pra DLQ", logCtx);
        // Cópia explícita na DLQ (não só o estado "failed" do BullMQ): fila
        // separada dá alarme/reprocesso simples sem vasculhar a fila principal.
        void this.dlq
          .add(JOB_NAME, { ...job.data, failedReason: error.message })
          .catch((dlqError: unknown) => {
            logger.error("queue: FALHA AO GRAVAR NA DLQ (mensagem só no failed do BullMQ)", {
              ...logCtx,
              dlqError
            });
          });
      } else {
        logger.warn("queue: job falhou, retry agendado", logCtx);
      }
    });
  }

  async close(): Promise<void> {
    await this.worker?.close();
    await this.dlq.close();
    this.worker = null;
  }
}
