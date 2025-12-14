import { loadConfig } from "../config/loadConfig.js";
import { logger } from "../utils/logger.js";
import { MongoDBConversationRepository } from "../database/repositories/ConversationRepository.js";

export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  thought?: string;
  timestamp: number;
}

export interface ConversationState {
  phone: string;
  history: Message[];
  lastInteraction: number;
  // Poderíamos guardar o estado do pedido rascunho aqui também
  currentOrderId?: string;
}

/**
 * ConversationManager - Usa MongoDB para persistência
 * Mantém interface compatível com código existente
 */
export class ConversationManager {
  private mongoRepo: MongoDBConversationRepository;
  private clientId: string;

  constructor(clientId: string) {
    this.clientId = clientId;
    
    // Carrega o timeout da configuração do cliente
    const config = loadConfig(clientId);
    const timeoutMinutes = config.conversation?.timeout_minutes ?? 5;
    
    this.mongoRepo = new MongoDBConversationRepository(clientId, timeoutMinutes);
  }

  async get(phone: string): Promise<ConversationState> {
    return this.mongoRepo.get(phone);
  }

  async save(state: ConversationState): Promise<void> {
    return this.mongoRepo.save(state);
  }

  async addMessage(
    phone: string,
    role: "user" | "assistant" | "system",
    content: string,
    thought?: string
  ): Promise<ConversationState> {
    logger.info(`[${this.clientId}] 📝 Adicionando mensagem (${role}): ${phone.substring(0, 20)}...`);
    const state = await this.get(phone);
    state.history.push({ 
      role, 
      content, 
      thought: thought || undefined, 
      timestamp: Date.now() 
    });
    state.lastInteraction = Date.now();
    logger.info(`[${this.clientId}] 💾 Chamando save() para ${phone}...`);
    await this.save(state);
    logger.info(`[${this.clientId}] ✅ Mensagem adicionada e salva: ${phone}`);
    return state;
  }

  async clearHistory(phone: string): Promise<void> {
    const state = await this.get(phone);
    state.history = [];
    await this.save(state);
  }
}
