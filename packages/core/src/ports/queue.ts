// Porta da fila de mensagens entrantes. O webhook SÓ produz (valida, resolve
// tenant, enfileira, 200 <5s); o worker SÓ consome (dedup, lock, pipeline).
// Implementações em @sirvase/adapters: BullMQ (Redis) e mock in-memory.
import type { IncomingMessage } from "./whatsapp.js";

/** Job da fila: mensagem já autenticada (assinatura/token) e roteada pro tenant. */
export interface IncomingMessageJob {
  tenantId: string;
  message: IncomingMessage;
}

export interface MessageQueueProducer {
  enqueue(job: IncomingMessageJob): Promise<void>;
}

export type IncomingJobHandler = (job: IncomingMessageJob) => Promise<void>;

export interface MessageQueueConsumer {
  /** Registra o handler e começa a consumir. Handler que lança → retry com
   *  backoff; esgotadas as tentativas → job vai pra dead-letter. */
  start(handler: IncomingJobHandler): void;
  close(): Promise<void>;
}
