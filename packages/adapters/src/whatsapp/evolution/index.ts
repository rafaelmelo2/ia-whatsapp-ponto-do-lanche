// Adapter Evolution API — self-hosted, webhook+REST. Nome da instância = tenants.wa_number
// (decisão registrada em claude.md §4): resolve tenant é sempre "instance === wa_number".
import type { IncomingMessage, WhatsAppProvider } from "@sirvase/core";

interface EvolutionKey {
  remoteJid?: string;
  fromMe?: boolean;
  id?: string;
}

interface EvolutionMessageContent {
  conversation?: string;
  extendedTextMessage?: { text?: string };
}

interface EvolutionWebhookPayload {
  event?: string;
  instance?: string;
  data?: {
    key?: EvolutionKey;
    pushName?: string;
    message?: EvolutionMessageContent;
    messageType?: string;
  };
}

function isEvolutionPayload(payload: unknown): payload is EvolutionWebhookPayload {
  return typeof payload === "object" && payload !== null;
}

/** Extrai o número do remoteJid ("5511...@s.whatsapp.net" ou "...@g.us"), sem o sufixo. */
function stripJidSuffix(jid: string): string {
  return jid.split("@")[0] ?? jid;
}

/** Nome da instância = wa_number do tenant (decisão de roteamento única pros 2 provedores). */
export function extractInstanceName(payload: unknown): string | null {
  if (!isEvolutionPayload(payload)) return null;
  return payload.instance ?? null;
}

export function parseEvolutionWebhook(payload: unknown): IncomingMessage | null {
  if (!isEvolutionPayload(payload)) return null;
  if (payload.event !== "messages.upsert") return null;

  const key = payload.data?.key;
  if (!key?.remoteJid || !key.id) return null;
  if (key.fromMe) return null; // eco do próprio bot, não é mensagem de cliente

  const message = payload.data?.message;
  const body = message?.conversation ?? message?.extendedTextMessage?.text;
  if (!body) return null; // mídia/áudio/outros tipos: fora de escopo (YAGNI)

  return {
    from: stripJidSuffix(key.remoteJid),
    body,
    pushName: payload.data?.pushName,
    isGroup: key.remoteJid.endsWith("@g.us"),
    messageId: key.id
  };
}

export class EvolutionApiProvider implements WhatsAppProvider {
  constructor(
    private readonly apiUrl: string,
    private readonly apiKey: string,
    private readonly instanceName: string
  ) {}

  parseWebhook(payload: unknown): IncomingMessage | null {
    return parseEvolutionWebhook(payload);
  }

  async sendText(to: string, text: string): Promise<void> {
    const res = await fetch(`${this.apiUrl}/message/sendText/${this.instanceName}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: this.apiKey },
      body: JSON.stringify({ number: to, text })
    });
    if (!res.ok) {
      throw new Error(`Evolution sendText falhou (${res.status}): ${await res.text()}`);
    }
  }

  async markAsRead(to: string, messageId: string): Promise<void> {
    const res = await fetch(`${this.apiUrl}/chat/markMessageAsRead/${this.instanceName}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: this.apiKey },
      body: JSON.stringify({
        readMessages: [{ remoteJid: `${to}@s.whatsapp.net`, id: messageId, fromMe: false }]
      })
    });
    if (!res.ok) {
      throw new Error(`Evolution markAsRead falhou (${res.status}): ${await res.text()}`);
    }
  }
}
