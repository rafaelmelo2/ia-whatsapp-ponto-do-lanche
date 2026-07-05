// Mock da porta WhatsAppProvider — sem rede. `parseWebhook` aceita um payload
// canônico simples (o próprio shape de IncomingMessage) e o envio fica gravado
// em memória pra asserção nos testes.
import type { IncomingMessage, WhatsAppProvider } from "@sirvase/core";

export interface SentText {
  to: string;
  text: string;
}

export interface ReadReceipt {
  to: string;
  messageId: string;
}

export class MockWhatsAppProvider implements WhatsAppProvider {
  readonly sent: SentText[] = [];
  readonly reads: ReadReceipt[] = [];

  parseWebhook(payload: unknown): IncomingMessage | null {
    if (!payload || typeof payload !== "object") return null;
    const p = payload as Partial<IncomingMessage>;
    if (typeof p.from !== "string" || typeof p.body !== "string" || typeof p.messageId !== "string") {
      return null;
    }
    return {
      from: p.from,
      body: p.body,
      messageId: p.messageId,
      pushName: typeof p.pushName === "string" ? p.pushName : undefined,
      isGroup: p.isGroup === true
    };
  }

  async sendText(to: string, text: string): Promise<void> {
    this.sent.push({ to, text });
  }

  async markAsRead(to: string, messageId: string): Promise<void> {
    this.reads.push({ to, messageId });
  }
}
