import { logger } from "../../utils/logger.js";
import { ConversationModel, IConversation } from "../models/Conversation.js";
import { ConversationState, Message } from "../../orders/orderState.js";

export class MongoDBConversationRepository {
  private clientId: string;
  private timeoutMs: number;

  constructor(clientId: string, timeoutMinutes: number = 5) {
    this.clientId = clientId;
    this.timeoutMs = timeoutMinutes * 60 * 1000;
  }

  async get(phone: string): Promise<ConversationState> {
    try {
      // Busca conversa ativa (não arquivada)
      let doc = await ConversationModel.findOne({
        clientId: this.clientId,
        phone,
        isArchived: false
      });

      // Se encontrou e está expirada, arquiva
      if (doc && Date.now() - doc.lastInteraction.getTime() > this.timeoutMs) {
        logger.info(`[${this.clientId}] Conversa expirada para ${phone}. Arquivando...`);
        
        doc.isArchived = true;
        doc.archivedAt = new Date();
        await doc.save();

        // Cria nova conversa vazia
        doc = null;
      }

      if (!doc) {
        return {
          phone,
          history: [],
          lastInteraction: Date.now()
        };
      }

      return this.convertToConversationState(doc);
    } catch (error) {
      logger.error(`[${this.clientId}] Erro ao ler conversa de ${phone} do MongoDB`, error);
      return {
        phone,
        history: [],
        lastInteraction: Date.now()
      };
    }
  }

  async save(state: ConversationState): Promise<void> {
    try {
      logger.info(`[${this.clientId}] 💾 Salvando conversa no MongoDB: ${state.phone} (${state.history.length} mensagens)`);
      
      // Limitar histórico para não estourar tokens
      const limitedHistory = state.history.length > 30 
        ? state.history.slice(-30) 
        : state.history;

      const conversationData = {
        clientId: this.clientId,
        phone: state.phone,
        history: limitedHistory.map(msg => ({
          role: msg.role,
          content: msg.content,
          thought: msg.thought,
          timestamp: msg.timestamp
        })),
        lastInteraction: new Date(state.lastInteraction),
        currentOrderId: state.currentOrderId,
        isArchived: false
      };

      const result = await ConversationModel.findOneAndUpdate(
        { clientId: this.clientId, phone: state.phone, isArchived: false },
        conversationData,
        { upsert: true, new: true }
      );

      if (result) {
        logger.info(`[${this.clientId}] ✅ Conversa salva com sucesso no MongoDB: ${state.phone} (ID: ${result._id})`);
      } else {
        logger.warn(`[${this.clientId}] ⚠️ Conversa não foi salva (resultado null): ${state.phone}`);
      }
    } catch (error) {
      logger.error(`[${this.clientId}] ❌ Erro ao salvar conversa de ${state.phone} no MongoDB:`, error);
      throw error;
    }
  }

  async getAllActive(): Promise<ConversationState[]> {
    try {
      const docs = await ConversationModel.find({
        clientId: this.clientId,
        isArchived: false
      }).sort({ lastInteraction: -1 });

      return docs.map(doc => this.convertToConversationState(doc));
    } catch (error) {
      logger.error(`[${this.clientId}] Erro ao buscar conversas ativas do MongoDB`, error);
      return [];
    }
  }

  async getAllArchived(): Promise<ConversationState[]> {
    try {
      const docs = await ConversationModel.find({
        clientId: this.clientId,
        isArchived: true
      }).sort({ archivedAt: -1 });

      return docs.map(doc => this.convertToConversationState(doc));
    } catch (error) {
      logger.error(`[${this.clientId}] Erro ao buscar conversas arquivadas do MongoDB`, error);
      return [];
    }
  }

  private convertToConversationState(doc: IConversation): ConversationState {
    return {
      phone: doc.phone,
      history: doc.history.map(msg => ({
        role: msg.role,
        content: msg.content,
        thought: msg.thought,
        timestamp: msg.timestamp
      })),
      lastInteraction: doc.lastInteraction.getTime(),
      currentOrderId: doc.currentOrderId
    };
  }
}

