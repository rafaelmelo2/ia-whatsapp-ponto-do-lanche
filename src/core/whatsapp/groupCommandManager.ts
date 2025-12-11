export interface GroupCommand {
  type: "start" | "stop" | "pause" | "resume" | "status";
  targetPhone?: string;
  groupId: string;
  senderPhone: string;
}

export class GroupCommandManager {
  private pausedNumbers: Set<string> = new Set(); // Números pausados (modo manual)
  private commandGroupId: string | null = null; // Grupo permitido para comandos
  private adminPhones: Set<string> = new Set(); // Números autorizados a dar comandos

  constructor(commandGroupId: string | null, adminPhones: string[]) {
    this.commandGroupId = commandGroupId;
    adminPhones.forEach((p) => this.adminPhones.add(this.normalizePhone(p)));
  }

  parseCommand(message: string, groupId: string, senderPhone: string): GroupCommand | null {
    // Verifica se é o grupo de comandos configurado
    if (!this.commandGroupId || this.commandGroupId !== groupId) {
      return null;
    }

    // Verifica se o remetente é autorizado
    const normalizedSender = this.normalizePhone(senderPhone);
    if (!this.adminPhones.has(normalizedSender)) {
      return null;
    }

    const trimmed = message.trim().toLowerCase();

    // Comando: /start ou /start número
    if (trimmed.startsWith("/start")) {
      const parts = message.trim().split(/\s+/);
      const targetPhone = parts[1] ? this.normalizePhone(parts[1]) : null;
      return {
        type: "start",
        targetPhone: targetPhone || undefined,
        groupId,
        senderPhone: normalizedSender
      };
    }

    // Comando: /stop número ou /número (ex: /556499335575)
    if (trimmed.startsWith("/stop")) {
      const parts = message.trim().split(/\s+/);
      const targetPhone = parts[1] ? this.normalizePhone(parts[1]) : null;
      if (targetPhone) {
        return {
          type: "stop",
          targetPhone,
          groupId,
          senderPhone: normalizedSender
        };
      }
    }

    // Comando: /número (ex: /556499335575)
    if (/^\/\d+/.test(trimmed)) {
      const phoneMatch = message.trim().match(/^\/(\d+)/);
      const targetPhone = phoneMatch ? this.normalizePhone(phoneMatch[1]) : null;
      if (targetPhone) {
        return {
          type: "stop",
          targetPhone,
          groupId,
          senderPhone: normalizedSender
        };
      }
    }

    // Comando: /pause número
    if (trimmed.startsWith("/pause")) {
      const parts = message.trim().split(/\s+/);
      const targetPhone = parts[1] ? this.normalizePhone(parts[1]) : null;
      if (targetPhone) {
        return {
          type: "pause",
          targetPhone,
          groupId,
          senderPhone: normalizedSender
        };
      }
    }

    // Comando: /resume número
    if (trimmed.startsWith("/resume")) {
      const parts = message.trim().split(/\s+/);
      const targetPhone = parts[1] ? this.normalizePhone(parts[1]) : null;
      if (targetPhone) {
        return {
          type: "resume",
          targetPhone,
          groupId,
          senderPhone: normalizedSender
        };
      }
    }

    // Comando: /status
    if (trimmed === "/status") {
      return {
        type: "status",
        groupId,
        senderPhone: normalizedSender
      };
    }

    return null;
  }

  pauseNumber(phone: string): void {
    const normalized = this.normalizePhone(phone);
    this.pausedNumbers.add(normalized);
  }

  resumeNumber(phone: string): void {
    const normalized = this.normalizePhone(phone);
    this.pausedNumbers.delete(normalized);
  }

  isPaused(phone: string): boolean {
    const normalized = this.normalizePhone(phone);
    return this.pausedNumbers.has(normalized);
  }

  getAllPausedNumbers(): string[] {
    return Array.from(this.pausedNumbers);
  }

  private normalizePhone(phone: string): string {
    // Remove caracteres não numéricos e @s.whatsapp.net se existir
    let cleaned = phone.replace(/[^\d]/g, "");

    // Se já tiver @s.whatsapp.net, remove primeiro
    if (phone.includes("@")) {
      cleaned = phone.split("@")[0].replace(/\D/g, "");
    }

    // Se começar com 55 (Brasil), mantém
    // Se tiver 11 dígitos e não começar com 55, assume que é número local e adiciona 55
    if (cleaned.length === 11 && !cleaned.startsWith("55")) {
      cleaned = "55" + cleaned;
    }

    // Adiciona @s.whatsapp.net
    return cleaned + "@s.whatsapp.net";
  }

  getCommandGroupId(): string | null {
    return this.commandGroupId;
  }
}
