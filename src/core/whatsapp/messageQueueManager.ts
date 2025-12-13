import { logger } from "../utils/logger.js";
import { IncomingMessage } from "./provider.js";

/**
 * Gerencia fila de mensagens, lock por conversa e deduplicação
 * para evitar processamento duplicado quando múltiplas mensagens chegam juntas
 */
export class MessageQueueManager {
  private processingLocks: Map<string, boolean> = new Map(); // Lock por número de telefone
  private processedMessages: Set<string> = new Set(); // Mensagens já processadas (messageId)
  private messageQueues: Map<string, IncomingMessage[]> = new Map(); // Fila de mensagens por número
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map(); // Timers de debounce
  private timerStartTimes: Map<string, number> = new Map(); // Quando o timer atual começou
  private readonly INITIAL_DEBOUNCE_DELAY_MS = 2000; // Delay inicial: 2 segundos (para internet ruim)
  private readonly EXTENDED_DEBOUNCE_DELAY_MS = 1500; // Delay adicional se já houver mensagens na fila
  private readonly MAX_DEBOUNCE_DELAY_MS = 5000; // Máximo total de 5 segundos
  private readonly PROCESSED_MESSAGES_MAX = 1000; // Limite de mensagens rastreadas
  private messageHandler?: (messages: IncomingMessage[]) => Promise<void>;

  constructor() {
    // Limpa mensagens processadas antigas periodicamente (a cada 10 minutos)
    setInterval(() => {
      if (this.processedMessages.size > this.PROCESSED_MESSAGES_MAX) {
        // Remove metade das mensagens mais antigas (FIFO não é possível com Set, então limpa tudo)
        this.processedMessages.clear();
        logger.debug("[MessageQueueManager] Limpeza periódica: mensagens processadas resetadas");
      }
    }, 10 * 60 * 1000);
  }

  /**
   * Define o handler que será chamado quando mensagens forem processadas
   */
  setHandler(handler: (messages: IncomingMessage[]) => Promise<void>): void {
    this.messageHandler = handler;
  }

  /**
   * Adiciona uma mensagem à fila e agenda processamento com debounce inteligente
   */
  async enqueueMessage(msg: IncomingMessage): Promise<void> {
    const phone = msg.from;

    // Deduplicação: verifica se a mensagem já foi processada
    if (msg.messageId && this.processedMessages.has(msg.messageId)) {
      logger.debug(`[MessageQueueManager] Mensagem ${msg.messageId} já processada, ignorando`);
      return;
    }

    // Adiciona à fila do número
    if (!this.messageQueues.has(phone)) {
      this.messageQueues.set(phone, []);
    }
    const queue = this.messageQueues.get(phone)!;
    queue.push(msg);

    // Marca como processada imediatamente para evitar duplicação
    if (msg.messageId) {
      this.processedMessages.add(msg.messageId);
    }

    // Lógica inteligente de debounce:
    // - Se não há timer, cria um com delay inicial (2s)
    // - Se já há timer, reseta para mais 1.5s (até máximo de 5s desde o início)
    const existingTimer = this.debounceTimers.get(phone);
    const timerStartTime = this.timerStartTimes.get(phone);
    const now = Date.now();

    if (existingTimer && timerStartTime) {
      // Já existe um timer rodando
      const elapsed = now - timerStartTime;
      const queueSize = queue.length;

      // Se já passou muito tempo (mais que o máximo), processa imediatamente
      if (elapsed >= this.MAX_DEBOUNCE_DELAY_MS) {
        logger.debug(`[MessageQueueManager] Timer expirado (${elapsed}ms), processando imediatamente`);
        clearTimeout(existingTimer);
        this.debounceTimers.delete(phone);
        this.timerStartTimes.delete(phone);
        await this.processQueue(phone);
        return;
      }

      // Se há múltiplas mensagens na fila, reseta o timer para mais 1.5s
      // (mas não ultrapassa o máximo total de 5s desde o início)
      if (queueSize > 1) {
        const maxRemainingTime = this.MAX_DEBOUNCE_DELAY_MS - elapsed;
        const newDelay = Math.min(this.EXTENDED_DEBOUNCE_DELAY_MS, maxRemainingTime);

        if (newDelay > 100) {
          // Só reseta se ainda há tempo significativo (mais de 100ms)
          logger.debug(
            `[MessageQueueManager] Resetando timer para ${phone}: +${newDelay}ms (${queueSize} mensagens na fila, ${elapsed}ms já passados)`
          );
          clearTimeout(existingTimer);
          const newTimer = setTimeout(() => {
            this.processQueue(phone);
          }, newDelay);
          this.debounceTimers.set(phone, newTimer);
          // Mantém o timerStartTime original para calcular o máximo corretamente
        }
      }
      // Se não precisa estender, mantém o timer original
    } else {
      // Primeira mensagem ou timer não existe - cria novo timer
      logger.debug(`[MessageQueueManager] Criando novo timer para ${phone} (delay: ${this.INITIAL_DEBOUNCE_DELAY_MS}ms)`);
      const timer = setTimeout(() => {
        this.processQueue(phone);
      }, this.INITIAL_DEBOUNCE_DELAY_MS);
      this.debounceTimers.set(phone, timer);
      this.timerStartTimes.set(phone, now);
    }
  }

  /**
   * Processa a fila de mensagens de um número
   */
  private async processQueue(phone: string): Promise<void> {
    // Remove o timer e timestamp
    const timer = this.debounceTimers.get(phone);
    if (timer) {
      clearTimeout(timer);
    }
    this.debounceTimers.delete(phone);
    this.timerStartTimes.delete(phone);

    // Verifica se já está processando mensagens deste número
    if (this.processingLocks.get(phone)) {
      logger.debug(`[MessageQueueManager] Já processando mensagens de ${phone}, aguardando...`);
      // Reagenda para depois
      const retryTimer = setTimeout(() => {
        this.processQueue(phone);
      }, this.INITIAL_DEBOUNCE_DELAY_MS);
      this.debounceTimers.set(phone, retryTimer);
      this.timerStartTimes.set(phone, Date.now());
      return;
    }

    // Pega mensagens da fila
    const messages = this.messageQueues.get(phone) || [];
    if (messages.length === 0) {
      return; // Nada para processar
    }

    // Limpa a fila
    this.messageQueues.delete(phone);

    // Define lock
    this.processingLocks.set(phone, true);

    try {
      logger.info(`[MessageQueueManager] Processando ${messages.length} mensagem(ns) de ${phone.split("@")[0]}`);

      // Chama o handler com todas as mensagens agrupadas
      if (this.messageHandler) {
        await this.messageHandler(messages);
      }
    } catch (error) {
      logger.error(`[MessageQueueManager] Erro ao processar mensagens de ${phone}:`, error);
    } finally {
      // Remove lock
      this.processingLocks.delete(phone);
    }
  }

  /**
   * Verifica se há mensagens pendentes para um número
   */
  hasPendingMessages(phone: string): boolean {
    const queue = this.messageQueues.get(phone);
    return queue ? queue.length > 0 : false;
  }

  /**
   * Força processamento imediato (útil para testes ou casos especiais)
   */
  async flushQueue(phone: string): Promise<void> {
    const timer = this.debounceTimers.get(phone);
    if (timer) {
      clearTimeout(timer);
      this.debounceTimers.delete(phone);
    }
    await this.processQueue(phone);
  }

  /**
   * Limpa todas as filas e locks (útil para reset)
   */
  clear(): void {
    // Cancela todos os timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
    this.timerStartTimes.clear();
    this.messageQueues.clear();
    this.processingLocks.clear();
    // Não limpa processedMessages para manter deduplicação
  }
}
