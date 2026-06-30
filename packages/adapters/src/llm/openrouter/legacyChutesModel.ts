import OpenAI from "openai";
import { AppConfig } from "@sirvase/core";
import { logger } from "@sirvase/core";

export interface LLMResponse {
  content: string;
  thought?: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class LLMModel {
  private openai: OpenAI;
  private config: AppConfig;

  constructor(config: AppConfig) {
    this.config = config;

    // Configuração para Chutes.ai
    // Se a chave CHUTES_AI_API_KEY existir, usa ela. Senão tenta OPENAI_API_KEY (para compatibilidade)
    const apiKey = process.env.CHUTES_AI_API_KEY || process.env.OPENAI_API_KEY;
    const baseURL = "https://llm.chutes.ai/v1";

    logger.info(`Inicializando LLM via Chutes.ai (${baseURL}) com modelo ${this.config.llm.model}`);

    this.openai = new OpenAI({
      apiKey: apiKey,
      baseURL: baseURL
    });
  }

  async generate(
    systemPrompt: string,
    history: { role: "user" | "assistant" | "system"; content: string }[]
  ): Promise<LLMResponse> {
    try {
      const messages = [
        { role: "system", content: systemPrompt } as const,
        ...history.map((h) => ({ role: h.role, content: h.content } as const))
      ];

      const completion = await this.openai.chat.completions.create({
        model: this.config.llm.model, // Ex: "deepseek-ai/DeepSeek-V3"
        messages: messages,
        temperature: this.config.llm.temperature,
        max_tokens: this.config.llm.max_tokens
      });

      let content = completion.choices[0]?.message?.content || "";
      let thought: string | undefined;

      // Extrai o bloco <think>...</think> se existir
      const thinkMatch = content.match(/<think>([\s\S]*?)<\/think>/);
      if (thinkMatch) {
        thought = thinkMatch[1]?.trim();
        content = content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
      }

      return {
        content,
        thought,
        usage: completion.usage
          ? {
              prompt_tokens: completion.usage.prompt_tokens,
              completion_tokens: completion.usage.completion_tokens,
              total_tokens: completion.usage.total_tokens
            }
          : undefined
      };
    } catch (error) {
      logger.error("Erro na chamada LLM (Chutes.ai):", error);
      throw error;
    }
  }
}
