import { AIMessage, BaseMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { AppConfig } from "../config/schema.js";
import { logger } from "../utils/logger.js";

export interface LLMResponse {
  content: string;
  thought?: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class LangchainModel {
  private model: ChatOpenAI;
  private config: AppConfig;

  constructor(config: AppConfig) {
    this.config = config;

    const apiKey = process.env.CHUTES_AI_API_KEY;
    if (!apiKey) {
      throw new Error("CHUTES_AI_API_KEY não definida na variável de ambiente!");
    }

    // Define OPENAI_API_KEY como fallback para compatibilidade com bindTools
    // Isso garante que quando bindTools criar novas instâncias, elas tenham acesso à API key
    if (!process.env.OPENAI_API_KEY) {
      process.env.OPENAI_API_KEY = apiKey;
    }

    const baseURL = "https://llm.chutes.ai/v1";

    // Permite sobrescrever o modelo via variável de ambiente para testes
    // Útil para testar modelos mais rápidos sem editar o YAML
    const modelName = process.env.LLM_MODEL_OVERRIDE || this.config.llm.model;

    if (process.env.LLM_MODEL_OVERRIDE) {
      logger.info(`⚠️  Modelo sobrescrito via LLM_MODEL_OVERRIDE: ${modelName} (original: ${this.config.llm.model})`);
    } else {
      logger.info(`Inicializando Langchain LLM via Chutes.ai (${baseURL}) com modelo ${modelName}`);
    }

    // Usa apiKey diretamente (não openAIApiKey) e configura baseURL via configuration
    this.model = new ChatOpenAI({
      modelName: modelName,
      temperature: this.config.llm.temperature,
      maxTokens: this.config.llm.max_tokens,
      apiKey: apiKey,
      configuration: {
        baseURL: baseURL
      }
    });

    // Garante que o cliente está configurado corretamente
    // Isso é importante porque bindTools pode criar nova instância
    if ((this.model as any).client) {
      const client = (this.model as any).client;
      if (!client.baseURL || client.baseURL !== baseURL) {
        client.baseURL = baseURL;
      }
      if (!client.apiKey || client.apiKey !== apiKey) {
        client.apiKey = apiKey;
      }
    }
  }

  /**
   * Gera resposta usando Langchain
   */
  async generate(
    systemPrompt: string,
    history: { role: "user" | "assistant" | "system"; content: string }[]
  ): Promise<LLMResponse> {
    try {
      // Converte histórico para mensagens do Langchain
      const messages: BaseMessage[] = [
        new SystemMessage(systemPrompt),
        ...history.map((h) => {
          if (h.role === "user") {
            return new HumanMessage(h.content);
          } else if (h.role === "assistant") {
            return new AIMessage(h.content);
          } else {
            return new SystemMessage(h.content);
          }
        })
      ];

      // Mede tempo de resposta para comparação de modelos
      const startTime = Date.now();
      const response = await this.model.invoke(messages);
      const responseTime = Date.now() - startTime;

      logger.info(
        `[LLM] Resposta gerada em ${responseTime}ms (modelo: ${process.env.LLM_MODEL_OVERRIDE || this.config.llm.model})`
      );

      let content = response.content as string;
      let thought: string | undefined;

      // Extrai o bloco <think>...</think> se existir
      const thinkMatch = content.match(/<think>([\s\S]*?)<\/think>/);
      if (thinkMatch) {
        thought = thinkMatch[1].trim();
        content = content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
      }

      // Extrai usage se disponível
      const usage = response.response_metadata?.usage as any;

      return {
        content,
        thought,
        usage: usage
          ? {
              prompt_tokens: usage.prompt_tokens || 0,
              completion_tokens: usage.completion_tokens || 0,
              total_tokens: usage.total_tokens || 0
            }
          : undefined
      };
    } catch (error) {
      logger.error("Erro na chamada LLM (Langchain):", error);
      throw error;
    }
  }

  /**
   * Retorna a instância do modelo para uso direto com Langchain (chains, structured output, etc)
   */
  getModel(): ChatOpenAI {
    return this.model;
  }
}
