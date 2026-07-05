// Mock da porta LlmProvider — respostas roteirizadas (canned), zero rede.
// Cada generate() consome a próxima resposta da fila; a última se repete
// (conversa pode ter mais turnos que o roteiro). Chamadas ficam gravadas
// pra asserção (systemPrompt recebido, histórico, options).
import type { LlmGenerateOptions, LlmMessage, LlmProvider, LlmResult } from "@sirvase/core";

export interface RecordedLlmCall {
  messages: LlmMessage[];
  options: LlmGenerateOptions;
}

export class MockLlmProvider implements LlmProvider {
  readonly calls: RecordedLlmCall[] = [];
  private cursor = 0;

  constructor(private responses: string[] = ["Resposta canned do mock."]) {
    if (responses.length === 0) {
      throw new Error("MockLlmProvider precisa de pelo menos uma resposta canned");
    }
  }

  async generate(messages: LlmMessage[], options: LlmGenerateOptions): Promise<LlmResult> {
    this.calls.push({ messages, options });
    const content = this.responses[Math.min(this.cursor, this.responses.length - 1)]!;
    this.cursor += 1;
    return {
      content,
      toolCalls: [],
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
    };
  }
}
