// Adapter OpenRouter da porta LlmProvider (decisão travada: LLM via OpenRouter).
// Usa o SDK da OpenAI apontado pro baseURL do OpenRouter (API compatível).
// apiKey/baseUrl vêm de fora (settings via serviço) — nunca process.env aqui.
// Modelo/temperatura/maxTokens chegam por chamada (config do TENANT, claude.md §5).
import OpenAI from "openai";
import type {
  LlmGenerateOptions,
  LlmMessage,
  LlmProvider,
  LlmResult,
  LlmToolCall
} from "@sirvase/core";
import { logger } from "@sirvase/core";

export class OpenRouterLlmProvider implements LlmProvider {
  private client: OpenAI;

  constructor(apiKey: string, baseUrl = "https://openrouter.ai/api/v1") {
    this.client = new OpenAI({ apiKey, baseURL: baseUrl });
  }

  async generate(messages: LlmMessage[], options: LlmGenerateOptions): Promise<LlmResult> {
    const completion = await this.client.chat.completions.create({
      model: options.model,
      temperature: options.temperature,
      max_tokens: options.maxTokens,
      messages: messages.map((m) =>
        m.role === "tool"
          ? { role: "tool" as const, content: m.content, tool_call_id: m.toolCallId ?? "" }
          : { role: m.role, content: m.content }
      ),
      tools: options.tools?.map((t) => ({
        type: "function" as const,
        function: { name: t.name, description: t.description, parameters: t.parameters }
      }))
    });

    const choice = completion.choices[0]?.message;
    let content = choice?.content ?? "";
    let thought: string | undefined;

    // Modelos de raciocínio (DeepSeek-R1 etc.) embutem <think>…</think> no texto.
    const thinkMatch = content.match(/<think>([\s\S]*?)<\/think>/);
    if (thinkMatch) {
      thought = thinkMatch[1]?.trim();
      content = content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    }

    const toolCalls: LlmToolCall[] = [];
    for (const call of choice?.tool_calls ?? []) {
      if (call.type !== "function") continue;
      try {
        toolCalls.push({
          id: call.id,
          name: call.function.name,
          arguments: JSON.parse(call.function.arguments) as Record<string, unknown>
        });
      } catch {
        logger.warn("openrouter: tool-call com arguments não-JSON, ignorada", {
          tool: call.function.name
        });
      }
    }

    return {
      content,
      thought,
      toolCalls,
      usage: completion.usage
        ? {
            promptTokens: completion.usage.prompt_tokens,
            completionTokens: completion.usage.completion_tokens,
            totalTokens: completion.usage.total_tokens
          }
        : undefined
    };
  }
}
