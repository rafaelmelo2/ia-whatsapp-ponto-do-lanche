// Porta de LLM — geração de texto + tool-calling. Nenhum SDK aqui; implementações
// reais (OpenRouter) e mock vivem em @sirvase/adapters. Modelo e parâmetros vêm
// SEMPRE de config/tenant (ver claude.md §5), nunca hardcoded no adapter.

export type LlmRole = "system" | "user" | "assistant" | "tool";

export interface LlmMessage {
  role: LlmRole;
  content: string;
  /** Presente só em role "tool": amarra o resultado à tool-call que o pediu. */
  toolCallId?: string;
}

/** Definição de tool exposta ao modelo. `parameters` é JSON Schema (validação
 *  de verdade é Zod no core, na hora de consumir a tool-call — Regra de Ouro). */
export interface LlmToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface LlmToolCall {
  id: string;
  name: string;
  /** Argumentos já desserializados do JSON. Validar com Zod antes de usar. */
  arguments: Record<string, unknown>;
}

export interface LlmUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface LlmGenerateOptions {
  model: string;
  temperature?: number;
  maxTokens?: number;
  /** Quando presente, o modelo pode responder com tool-calls em vez de (ou além de) texto. */
  tools?: LlmToolDefinition[];
}

export interface LlmResult {
  content: string;
  /** Bloco de raciocínio (<think>…</think>) extraído, quando o modelo emite. Nunca vai pro cliente. */
  thought?: string;
  /** Vazio quando o modelo respondeu só texto. */
  toolCalls: LlmToolCall[];
  usage?: LlmUsage;
}

export interface LlmProvider {
  generate(messages: LlmMessage[], options: LlmGenerateOptions): Promise<LlmResult>;
}
