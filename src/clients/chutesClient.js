/**
 * Cliente para integração com Chutes.ai
 */

const axios = require("axios");

class ChutesClient {
  constructor() {
    this.apiKey = process.env.CHUTES_AI_API_KEY || "";
    this.model = process.env.CHUTES_AI_MODEL || "deepseek-ai/DeepSeek-V3.1";
    this.baseUrl = "https://llm.chutes.ai/v1/chat/completions";
    this.configured = false;

    if (this.apiKey) {
      this.configured = true;
      console.log(`✅ Chutes.ai configurado (${this.model})`);
    }
  }

  isConfigured() {
    return this.configured;
  }

  async processarMensagem(mensagemUsuario, historico, contexto, instrucoesSistema) {
    if (!this.configured) {
      throw new Error("Chutes.ai não configurado");
    }

    // Preparar mensagens
    const messages = [];

    // Adicionar instruções do sistema
    if (instrucoesSistema) {
      const contextoTexto = `
Contexto atual da conversa:
- Pedido atual: ${JSON.stringify(contexto.pedido_atual || {}, null, 2)}
- Preferências do cliente: ${JSON.stringify(contexto.preferencias_cliente || {}, null, 2)}
`;

      messages.push({
        role: "system",
        content: `${instrucoesSistema}\n\n${contextoTexto}`
      });
    }

    // Adicionar histórico
    historico.forEach((msg) => {
      messages.push({
        role: msg.role,
        content: msg.content
      });
    });

    // Adicionar mensagem atual
    messages.push({
      role: "user",
      content: mensagemUsuario
    });

    // Chamar API
    try {
      const response = await axios.post(
        this.baseUrl,
        {
          model: this.model,
          messages: messages,
          max_tokens: 500,
          temperature: 0.7
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json"
          },
          timeout: 30000
        }
      );

      if (response.data && response.data.choices && response.data.choices[0]) {
        return response.data.choices[0].message.content;
      }

      throw new Error("Resposta inválida da API");
    } catch (error) {
      if (error.response) {
        throw new Error(`Erro ${error.response.status}: ${JSON.stringify(error.response.data)}`);
      } else if (error.request) {
        throw new Error("Erro de conexão com Chutes.ai");
      } else {
        throw error;
      }
    }
  }
}

module.exports = ChutesClient;
