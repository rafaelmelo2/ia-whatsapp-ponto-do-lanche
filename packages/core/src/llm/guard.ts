import { logger } from "../observability/logger.js";

export class PromptGuard {
  validate(response: string): { isValid: boolean; reason?: string } {
    // 1. Proibir Headers Markdown
    if (/^#+\s/m.test(response)) {
      logger.warn("Guard: Bloqueou resposta com header Markdown");
      return { isValid: false, reason: "A resposta contém headers Markdown (#). Use *negrito* ou maiúsculas." };
    }

    // 2. Verificar se o JSON está quebrado (se houver tentativa de JSON)
    if (response.includes("<<<JSON")) {
      if (!response.includes(">>>")) {
        return { isValid: false, reason: "O bloco JSON não foi fechado corretamente com >>>." };
      }
    }

    return { isValid: true };
  }
}
