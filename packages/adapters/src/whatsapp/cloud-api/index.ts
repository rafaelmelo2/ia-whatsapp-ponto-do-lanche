// Adapter Meta Cloud API — webhook+REST via Graph API. Pronto, mas não ativo até o
// app da Meta aprovar (ver claude.md §4 / PLANO_EXECUCAO.md Épico 4).
import type { IncomingMessage, WhatsAppProvider } from "@sirvase/core";

interface CloudApiMessage {
  from?: string;
  id?: string;
  type?: string;
  text?: { body?: string };
}

interface CloudApiPayload {
  entry?: Array<{
    changes?: Array<{
      value?: {
        metadata?: { phone_number_id?: string; display_phone_number?: string };
        contacts?: Array<{ profile?: { name?: string } }>;
        messages?: CloudApiMessage[];
      };
    }>;
  }>;
}

function isCloudApiPayload(payload: unknown): payload is CloudApiPayload {
  return typeof payload === "object" && payload !== null;
}

/** phone_number_id — chave técnica exigida pela Graph API; usada aqui como chave de rota. */
export function extractPhoneNumberId(payload: unknown): string | null {
  if (!isCloudApiPayload(payload)) return null;
  return payload.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id ?? null;
}

export function parseCloudApiWebhook(payload: unknown): IncomingMessage | null {
  if (!isCloudApiPayload(payload)) return null;
  const value = payload.entry?.[0]?.changes?.[0]?.value;
  const msg = value?.messages?.[0];
  if (!msg || msg.type !== "text" || !msg.from || !msg.id || !msg.text?.body) return null;

  return {
    from: msg.from,
    body: msg.text.body,
    pushName: value?.contacts?.[0]?.profile?.name,
    isGroup: false, // Cloud API não expõe conversas de grupo pro bot
    messageId: msg.id
  };
}

const encoder = new TextEncoder();

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(Math.floor(hex.length / 2));
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/** Valida X-Hub-Signature-256 (HMAC-SHA256 do corpo cru, comparação constant-time). */
export async function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string
): Promise<boolean> {
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const signatureBytes = hexToBytes(signatureHeader.slice("sha256=".length));
  return crypto.subtle.verify("HMAC", key, signatureBytes, encoder.encode(rawBody));
}

export class CloudApiProvider implements WhatsAppProvider {
  constructor(
    private readonly accessToken: string,
    private readonly phoneNumberId: string,
    private readonly graphVersion: string
  ) {}

  parseWebhook(payload: unknown): IncomingMessage | null {
    return parseCloudApiWebhook(payload);
  }

  async sendText(to: string, text: string): Promise<void> {
    const res = await fetch(
      `https://graph.facebook.com/${this.graphVersion}/${this.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: { body: text }
        })
      }
    );
    if (!res.ok) {
      throw new Error(`Graph API sendText falhou (${res.status}): ${await res.text()}`);
    }
  }

  async markAsRead(_to: string, messageId: string): Promise<void> {
    const res = await fetch(
      `https://graph.facebook.com/${this.graphVersion}/${this.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          status: "read",
          message_id: messageId
        })
      }
    );
    if (!res.ok) {
      throw new Error(`Graph API markAsRead falhou (${res.status}): ${await res.text()}`);
    }
  }
}
