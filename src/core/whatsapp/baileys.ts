import { Boom } from "@hapi/boom";
import makeWASocket, {
  Browsers,
  DisconnectReason,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState
} from "@whiskeysockets/baileys";
import fs from "fs";
import path from "path";
import pino from "pino";
import qrcode from "qrcode-terminal";
import { logger } from "../utils/logger.js";
import { IncomingMessage, WhatsAppProvider } from "./provider.js";

export class BaileysProvider implements WhatsAppProvider {
  private sock: any;
  private messageHandler?: (msg: IncomingMessage) => Promise<void>;
  private authPath: string;

  constructor() {
    this.authPath = path.resolve(process.cwd(), "src", "data", "tokens");
    if (!fs.existsSync(this.authPath)) {
      fs.mkdirSync(this.authPath, { recursive: true });
    }
  }

  async initialize(): Promise<void> {
    // Limpa listeners antigos se houver recarregamento
    if (this.sock) {
      try {
        this.sock.ev.removeAllListeners("connection.update");
        this.sock.ev.removeAllListeners("creds.update");
        this.sock.ev.removeAllListeners("messages.upsert");
        // Não chamar sock.end() aqui em loops de reconexão de sessão existente
        // this.sock.end(undefined);
      } catch (e) {
        // Ignora erro de limpeza
      }
    }

    // Limpa todos os intervalos de typing
    for (const [phone, interval] of this.typingIntervals.entries()) {
      clearInterval(interval);
    }
    this.typingIntervals.clear();

    const { state, saveCreds } = await useMultiFileAuthState(this.authPath);

    this.sock = makeWASocket({
      logger: pino({ level: "silent" }) as any,
      printQRInTerminal: false,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" }) as any)
      },
      // Usando MacOS/Desktop para variar a assinatura e tentar evitar conflitos de sessão
      browser: Browsers.macOS("Desktop"),
      syncFullHistory: false,
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      keepAliveIntervalMs: 10000,
      retryRequestDelayMs: 5000,
      markOnlineOnConnect: false // Evita forçar status online imediatamente
    });

    this.sock.ev.on("creds.update", saveCreds);

    this.sock.ev.on("connection.update", (update: any) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log("\n");
        qrcode.generate(qr, { small: true });
        logger.info("Escaneie o QR Code acima para conectar.");
      }

      if (connection === "close") {
        // Tipagem melhor para o erro
        const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
        const reason = (lastDisconnect?.error as Boom)?.output?.statusCode;

        logger.warn(`Conexão fechada. Razão: ${reason}. Reconectando: ${shouldReconnect}`);

        if (shouldReconnect) {
          // Pequeno delay para evitar loop infinito frenético
          const delay = reason === 440 ? 10000 : 5000; // Se for 440, espera 10s
          logger.warn(`Aguardando ${delay}ms para reconectar...`);
          setTimeout(() => this.initialize(), delay);
        }
      } else if (connection === "open") {
        logger.info("Conexão com WhatsApp estabelecida!");
      }
    });

    this.sock.ev.on("messages.upsert", async (m: any) => {
      if (m.type !== "notify") return; // Ignora mensagens de status, etc.

      for (const msg of m.messages) {
        if (!msg.message) continue;

        // Ignora mensagens próprias (opcional, depende do caso de uso)
        if (msg.key.fromMe) continue;

        const isGroup = msg.key.remoteJid?.endsWith("@g.us") || false;
        if (isGroup) continue; // Ignora grupos por enquanto

        const body = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || "";

        if (!body) continue;

        const incoming: IncomingMessage = {
          from: msg.key.remoteJid!,
          body: body,
          pushName: msg.pushName,
          isGroup,
          messageId: msg.key.id
        };

        if (this.messageHandler) {
          try {
            await this.messageHandler(incoming);
          } catch (e) {
            logger.error("Erro no handler de mensagem:", e);
          }
        }
      }
    });
  }

  onMessage(handler: (msg: IncomingMessage) => Promise<void>): void {
    this.messageHandler = handler;
  }

  async sendText(to: string, text: string): Promise<void> {
    if (!this.sock) throw new Error("WhatsApp não inicializado");

    // Delay aleatório entre 1 e 5 segundos para parecer humano
    const delay = Math.floor(Math.random() * 4000) + 1000; // 1000ms a 5000ms
    await new Promise((resolve) => setTimeout(resolve, delay));

    await this.sock.sendMessage(to, { text });
  }

  async markAsRead(phone: string, messageId: string): Promise<void> {
    if (!this.sock) throw new Error("WhatsApp não inicializado");

    try {
      await this.sock.readMessages([{ remoteJid: phone, id: messageId }]);
    } catch (e) {
      logger.warn(`Erro ao marcar mensagem como lida: ${e}`);
    }
  }

  private typingIntervals: Map<string, NodeJS.Timeout> = new Map();

  async startTyping(phone: string): Promise<void> {
    if (!this.sock) throw new Error("WhatsApp não inicializado");

    // Para qualquer intervalo anterior para este número
    this.stopTyping(phone);

    // Envia imediatamente
    try {
      await this.sock.sendPresenceUpdate("composing", phone);
    } catch (e) {
      logger.warn(`Erro ao iniciar digitação: ${e}`);
    }

    // Mantém enviando a cada 8 segundos (WhatsApp requer isso para manter o indicador)
    const interval = setInterval(async () => {
      try {
        await this.sock.sendPresenceUpdate("composing", phone);
      } catch (e) {
        // Ignora erros silenciosamente
      }
    }, 8000);

    this.typingIntervals.set(phone, interval);
  }

  async stopTyping(phone: string): Promise<void> {
    if (!this.sock) throw new Error("WhatsApp não inicializado");

    // Limpa o intervalo
    const interval = this.typingIntervals.get(phone);
    if (interval) {
      clearInterval(interval);
      this.typingIntervals.delete(phone);
    }

    // Para o indicador
    try {
      await this.sock.sendPresenceUpdate("paused", phone);
    } catch (e) {
      logger.warn(`Erro ao parar digitação: ${e}`);
    }
  }
}
