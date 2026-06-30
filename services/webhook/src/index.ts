// Entrypoint do serviço Webhook (WhatsApp Cloud API).
// Casca antecipada do Épico 4: faz a verificação do webhook (GET) e responde
// mensagens de texto com um ECO via Graph API (POST). Sem fila/LLM/persistência
// ainda — isso entra no Épico 4/5. Validação de X-Hub-Signature-256 fica como
// TODO do Épico 4 (precisa do WHATSAPP_APP_SECRET).
import { settings } from "@sirvase/config";
import { logger } from "@sirvase/core";

const PORT = 3001;

// Forma mínima do payload que a Meta envia — só o que lemos aqui.
type CloudApiPayload = {
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: Array<{ from?: string; type?: string; text?: { body?: string } }>;
      };
    }>;
  }>;
};

async function sendText(to: string, body: string): Promise<void> {
  const { accessToken, phoneNumberId, graphVersion } = settings.whatsapp;
  if (!accessToken || !phoneNumberId) {
    logger.warn("webhook: WHATSAPP_ACCESS_TOKEN/PHONE_NUMBER_ID ausentes — eco não enviado");
    return;
  }
  const url = `https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body }
    })
  });
  if (!res.ok) {
    logger.error("webhook: envio à Graph API falhou", {
      status: res.status,
      body: await res.text()
    });
  } else {
    logger.info("webhook: eco enviado", { to });
  }
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname !== "/webhook") {
      return new Response("Not Found", { status: 404 });
    }

    // 1) Verificação do webhook (Meta faz um GET ao configurar a Callback URL).
    if (req.method === "GET") {
      const mode = url.searchParams.get("hub.mode");
      const token = url.searchParams.get("hub.verify_token");
      const challenge = url.searchParams.get("hub.challenge");
      if (mode === "subscribe" && token && token === settings.whatsapp.verifyToken) {
        logger.info("webhook: verificação OK");
        return new Response(challenge ?? "", { status: 200 });
      }
      logger.warn("webhook: verificação recusada (token não confere)");
      return new Response("Forbidden", { status: 403 });
    }

    // 2) Recebimento de eventos (mensagens). Responde rápido com 200.
    if (req.method === "POST") {
      const raw = await req.text();
      // TODO(Épico 4): validar X-Hub-Signature-256 com WHATSAPP_APP_SECRET.
      let payload: CloudApiPayload;
      try {
        payload = JSON.parse(raw) as CloudApiPayload;
      } catch {
        return new Response("Bad Request", { status: 400 });
      }

      const msg = payload.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
      if (msg?.type === "text" && msg.from) {
        const text = msg.text?.body ?? "";
        logger.info("webhook: mensagem recebida", { from: msg.from, text });
        // Eco — prova a ida e volta com a Cloud API.
        await sendText(msg.from, `eco: ${text}`);
      }

      return new Response("EVENT_RECEIVED", { status: 200 });
    }

    return new Response("Method Not Allowed", { status: 405 });
  }
});

logger.info(`webhook ouvindo em http://localhost:${server.port}/webhook`);
