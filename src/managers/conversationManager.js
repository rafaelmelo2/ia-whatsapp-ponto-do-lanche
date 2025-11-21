/**
 * Gerenciador de conversas e contextos
 */

const fs = require("fs");
const path = require("path");

class ConversationManager {
  constructor(storagePath = "../data/conversations") {
    // Usar caminho relativo ao diretório raiz do projeto
    this.storagePath = path.join(__dirname, storagePath);
    this.conversations = new Map();

    // Criar diretório se não existir
    if (!fs.existsSync(this.storagePath)) {
      fs.mkdirSync(this.storagePath, { recursive: true });
    }

    this.loadConversations();
  }

  loadConversations() {
    try {
      const files = fs.readdirSync(this.storagePath);
      for (const file of files) {
        if (file.endsWith(".json")) {
          const filePath = path.join(this.storagePath, file);
          const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
          this.conversations.set(data.conversation_id, data);
        }
      }
    } catch (error) {
      console.error("Erro ao carregar conversas:", error);
    }
  }

  saveConversation(conversation) {
    const filePath = path.join(this.storagePath, `${conversation.conversation_id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(conversation, null, 2), "utf-8");
  }

  createConversation(userId, nomeCliente = null) {
    const conversationId = `${userId}_${Date.now()}`;
    const now = new Date().toISOString();

    const conversation = {
      conversation_id: conversationId,
      user_id: userId,
      messages: [],
      context: {
        pedido_atual: {
          itens: [],
          total: 0.0,
          status: "em_andamento",
          observacoes: ""
        },
        preferencias_cliente: {
          nome: nomeCliente || "",
          telefone: userId,
          endereco: "",
          forma_pagamento_preferida: "",
          restricoes_alimentares: [],
          historico_pedidos: []
        }
      },
      created_at: now,
      updated_at: now
    };

    this.conversations.set(conversationId, conversation);
    this.saveConversation(conversation);

    return conversationId;
  }

  getConversation(conversationId) {
    return this.conversations.get(conversationId);
  }

  getUserConversations(userId) {
    const conversas = [];
    for (const [id, conv] of this.conversations.entries()) {
      if (conv.user_id === userId) {
        conversas.push(conv);
      }
    }
    return conversas;
  }

  /**
   * Verifica se uma conversa está expirada
   * @param {Object} conversation - Objeto da conversa
   * @param {number} maxMinutesInactive - Minutos de inatividade para considerar expirada (padrão: 10 minutos)
   * @returns {boolean} - true se expirada, false caso contrário
   */
  isConversationExpired(conversation, maxMinutesInactive = 10) {
    if (!conversation || !conversation.updated_at) {
      return true;
    }

    const lastUpdate = new Date(conversation.updated_at);
    const now = new Date();
    const minutesSinceUpdate = (now - lastUpdate) / (1000 * 60); // Converter para minutos

    return minutesSinceUpdate > maxMinutesInactive;
  }

  /**
   * Obtém a conversa ativa mais recente do usuário, ou null se todas estiverem expiradas
   * @param {string} userId - ID do usuário
   * @param {number} maxMinutesInactive - Minutos de inatividade para considerar expirada (padrão: 10 minutos)
   * @returns {Object|null} - Conversa ativa mais recente ou null
   */
  getActiveConversation(userId, maxMinutesInactive = 10) {
    const conversas = this.getUserConversations(userId);

    if (conversas.length === 0) {
      return null;
    }

    // Ordenar por data de atualização (mais recente primeiro)
    const conversasOrdenadas = conversas.sort((a, b) => {
      return new Date(b.updated_at) - new Date(a.updated_at);
    });

    // Retornar a mais recente que não esteja expirada
    for (const conversa of conversasOrdenadas) {
      if (!this.isConversationExpired(conversa, maxMinutesInactive)) {
        return conversa;
      }
    }

    // Se todas estiverem expiradas, retornar null
    return null;
  }

  addMessage(conversationId, role, content, metadata = null) {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      throw new Error(`Conversa ${conversationId} não encontrada`);
    }

    const message = {
      role,
      content,
      timestamp: new Date().toISOString(),
      metadata: metadata || {}
    };

    conversation.messages.push(message);
    conversation.updated_at = new Date().toISOString();

    this.saveConversation(conversation);
  }

  getRecentMessages(conversationId, limit = 10) {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      return [];
    }

    const messages = conversation.messages.slice(-limit);
    return messages.map((msg) => ({
      role: msg.role,
      content: msg.content
    }));
  }

  getContext(conversationId) {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      return {};
    }
    return conversation.context;
  }

  updateContext(conversationId, contextUpdates) {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      throw new Error(`Conversa ${conversationId} não encontrada`);
    }

    conversation.context = { ...conversation.context, ...contextUpdates };
    conversation.updated_at = new Date().toISOString();

    this.saveConversation(conversation);
  }
}

module.exports = ConversationManager;
