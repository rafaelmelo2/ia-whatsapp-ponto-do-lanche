import { logger } from "../utils/logger.js";

export class PromptGuard {
  /**
   * Valida a MENSAGEM DO USUÁRIO antes de enviar para o LLM
   * Bloqueia tentativas de prompt injection e jailbreak
   * Otimizado com regex combinado para melhor performance
   */
  validateUserMessage(userMessage: string): { isValid: boolean; reason?: string } {
    // Regex combinado otimizado - apenas padrões críticos e mais comuns
    const criticalPattern =
      /(ignore\s+(as\s+)?(instruções|regras|sistema|tudo)|esqueça|desconsidere|agora\s+você\s+é|você\s+agora\s+é|seja\s+(um|uma)|finja\s+que|mostre\s+(o\s+)?(prompt|instruções|regras|sistema)|revele|qual\s+é\s+seu\s+prompt|sou\s+(o\s+)?(desenvolvedor|admin|criador)|system:|<\|system\|>|\[system\]|execute\s+(o\s+)?(código|comando)|reset|reiniciar)/i;

    if (criticalPattern.test(userMessage)) {
      logger.warn(`Guard: Bloqueou mensagem do usuário: ${userMessage.substring(0, 50)}...`);
      return { isValid: false, reason: "Mensagem contém tentativa de manipulação do sistema." };
    }

    return { isValid: true };
  }

  /**
   * Valida a RESPOSTA DO LLM antes de enviar para o usuário
   * Verifica formatação, JSON, tamanho - apenas o essencial
   */
  validateLLMResponse(response: string): { isValid: boolean; reason?: string } {
    // 1. Headers Markdown (crítico para formatação WhatsApp)
    if (/^#+\s/m.test(response)) {
      logger.warn("Guard: Resposta com header Markdown");
      return { isValid: false, reason: "A resposta contém headers Markdown (#). Use *negrito* ou maiúsculas." };
    }

    // 2. Validação JSON (apenas se houver tentativa de JSON)
    if (response.includes("<<<JSON")) {
      if (!response.includes(">>>")) {
        return { isValid: false, reason: "O bloco JSON não foi fechado corretamente com >>>." };
      }
      // Verificar múltiplos blocos (otimizado)
      if ((response.match(/<<<JSON/g) || []).length > 1) {
        return { isValid: false, reason: "A resposta contém múltiplos blocos JSON. Deve haver apenas um." };
      }
    }

    // 3. Tamanho máximo (WhatsApp limite ~4096)
    if (response.length > 4000) {
      return { isValid: false, reason: `A resposta é muito longa (${response.length} caracteres). Limite: 4000.` };
    }

    return { isValid: true };
  }

  /**
   * Método de compatibilidade - valida apenas a resposta do LLM
   * @deprecated Use validateLLMResponse() e validateUserMessage() separadamente
   */
  validate(response: string): { isValid: boolean; reason?: string } {
    return this.validateLLMResponse(response);
  }
}
