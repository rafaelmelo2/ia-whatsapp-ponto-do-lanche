// Porta de WhatsApp — webhook + REST (Evolution, Cloud API). Nenhum SDK aqui;
// implementações reais em @sirvase/adapters. Não é mais o formato antigo em
// processo (initialize/onMessage/typing) herdado da migração do Baileys — esse
// modelo morreu com o Baileys (ver claude.md §4).
export interface IncomingMessage {
  from: string; // número do cliente, E.164 sem "+"
  body: string;
  pushName?: string;
  isGroup: boolean;
  messageId: string;
}

export interface WhatsAppProvider {
  /** Traduz o payload cru do webhook do provedor. `null` se não é mensagem de texto processável. */
  parseWebhook(payload: unknown): IncomingMessage | null;
  sendText(to: string, text: string): Promise<void>;
  markAsRead(to: string, messageId: string): Promise<void>;
}
