import { Boom } from "@hapi/boom";
import makeWASocket, {
  Browsers,
  DisconnectReason,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState
} from "@whiskeysockets/baileys";
import { downloadMediaMessage } from "@whiskeysockets/baileys/lib/Utils/messages.js";
import fs from "fs";
import path from "path";
import pino from "pino";
import qrcode from "qrcode-terminal";
import { logger } from "../utils/logger.js";
import { MessageQueueManager } from "./messageQueueManager.js";
import { IncomingMessage, WhatsAppProvider } from "./provider.js";

export class BaileysProvider implements WhatsAppProvider {
  private sock: any;
  private messageHandler?: (msg: IncomingMessage) => Promise<void>;
  private groupCommandHandler?: (msg: IncomingMessage) => Promise<void>;
  private commandGroupId: string | null = null;
  private authPath: string;
  private clientId: string;
  private messageQueue: MessageQueueManager;

  constructor(clientId: string) {
    this.clientId = clientId;
    this.authPath = path.resolve(process.cwd(), "src", "data", clientId, "tokens");
    if (!fs.existsSync(this.authPath)) {
      fs.mkdirSync(this.authPath, { recursive: true });
    }
    this.messageQueue = new MessageQueueManager();
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
        logger.info(`[${this.clientId}] Escaneie o QR Code acima para conectar.`);
      }

      if (connection === "close") {
        // Tipagem melhor para o erro
        const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
        const reason = (lastDisconnect?.error as Boom)?.output?.statusCode;

        logger.warn(`[${this.clientId}] Conexão fechada. Razão: ${reason}. Reconectando: ${shouldReconnect}`);

        if (shouldReconnect) {
          // Pequeno delay para evitar loop infinito frenético
          const delay = reason === 440 ? 10000 : 5000; // Se for 440, espera 10s
          logger.warn(`[${this.clientId}] Aguardando ${delay}ms para reconectar...`);
          setTimeout(() => this.initialize(), delay);
        }
      } else if (connection === "open") {
        logger.info(`[${this.clientId}] Conexão com WhatsApp estabelecida!`);
      }
    });

    this.sock.ev.on("messages.upsert", async (m: any) => {
      if (m.type !== "notify") return; // Ignora mensagens de status, etc.

      for (const msg of m.messages) {
        if (!msg.message) continue;

        // Ignora mensagens próprias (opcional, depende do caso de uso)
        if (msg.key.fromMe) continue;

        const isGroup = msg.key.remoteJid?.endsWith("@g.us") || false;
        const hasImage = !!msg.message.imageMessage;
        const body = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || "";

        // Se não tiver texto nem imagem, ignora
        if (!body && !hasImage) continue;

        const incoming: IncomingMessage = {
          from: msg.key.remoteJid!,
          body: body || (hasImage ? "[imagem]" : ""), // Se for só imagem, usa placeholder
          pushName: msg.pushName,
          isGroup,
          messageId: msg.key.id,
          participant: msg.key.participant, // Número do remetente real (em grupos)
          hasImage,
          imageMessageId: hasImage ? msg.key.id : undefined,
          rawMessage: hasImage ? msg : undefined // Armazena mensagem raw para download
        };

        // Se for grupo e for o grupo de comandos, processa comandos
        if (isGroup && this.commandGroupId && msg.key.remoteJid === this.commandGroupId && this.groupCommandHandler) {
          try {
            await this.groupCommandHandler(incoming);
          } catch (e) {
            logger.error(`[${this.clientId}] Erro no handler de comando de grupo:`, e);
          }
          continue; // Não processa como mensagem normal
        }

        // Se não for grupo, adiciona à fila para processamento agrupado
        if (!isGroup) {
          try {
            await this.messageQueue.enqueueMessage(incoming);
          } catch (e) {
            logger.error(`[${this.clientId}] Erro ao enfileirar mensagem:`, e);
          }
        }
      }
    });
  }

  onMessage(handler: (msg: IncomingMessage) => Promise<void>): void {
    this.messageHandler = handler;
    // Configura o queue manager para chamar o handler com mensagens agrupadas
    this.messageQueue.setHandler(async (messages: IncomingMessage[]) => {
      if (!this.messageHandler) return;

      // Se tiver apenas uma mensagem, processa normalmente
      if (messages.length === 1) {
        try {
          await this.messageHandler(messages[0]);
        } catch (e) {
          logger.error(`[${this.clientId}] Erro no handler de mensagem:`, e);
        }
        return;
      }

      // Se tiver múltiplas mensagens, cria uma "Super Mensagem" agrupada
      // Isso permite que o LLM veja todo o contexto de uma vez e responda uma única vez
      logger.info(`[${this.clientId}] Agrupando ${messages.length} mensagens em uma única interação`);

      // Combina o corpo das mensagens com quebra de linha
      // Se a mensagem tiver imagem, formata explicitamente com o ID para que o LLM identifique todas
      const combinedBody = messages
        .map((m) => {
          if (m.hasImage && m.imageMessageId) {
            return `[IMAGEM_ENVIADA:${m.imageMessageId}] ${m.body || "[imagem]"}`;
          }
          return m.body;
        })
        .filter(Boolean)
        .join("\n");

      // Cria a mensagem combinada usando a última como base (para timestamp/metadata)
      const lastMsg = messages[messages.length - 1];
      const mergedMsg: IncomingMessage = {
        ...lastMsg,
        body: combinedBody,
        // Mantém a indicação de imagem se ALGUMA tiver imagem
        hasImage: messages.some((m) => m.hasImage),
        // mergedMessages permite acesso às originais
        mergedMessages: messages
      };

      try {
        await this.messageHandler(mergedMsg);
      } catch (e) {
        logger.error(`[${this.clientId}] Erro no handler de mensagem agrupada:`, e);
      }
    });
  }

  onGroupCommand(commandGroupId: string | null, handler: (msg: IncomingMessage) => Promise<void>): void {
    this.commandGroupId = commandGroupId;
    this.groupCommandHandler = handler;
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

  async downloadImage(messageId: string, from: string, rawMessage?: any): Promise<Buffer | null> {
    if (!this.sock) throw new Error("WhatsApp não inicializado");

    try {
      logger.info(
        `[${this.clientId}] Iniciando download de imagem. MessageId: ${messageId}, From: ${from}, HasRawMessage: ${!!rawMessage}`
      );

      let message = rawMessage;

      // Se não tiver a mensagem raw, tenta buscar usando getMessage
      if (!message) {
        logger.warn(`[${this.clientId}] Mensagem raw não fornecida, tentando buscar mensagem...`);
        try {
          // Tenta usar getMessage se disponível (algumas versões do Baileys)
          if (typeof this.sock.getMessage === "function") {
            message = await this.sock.getMessage({ remoteJid: from, id: messageId });
            logger.info(`[${this.clientId}] Mensagem recuperada via getMessage`);
          } else {
            // Se não tiver getMessage, não podemos baixar sem a mensagem raw
            logger.error(
              `[${this.clientId}] Mensagem raw não disponível e getMessage não existe. É necessário passar rawMessage do IncomingMessage.`
            );
            return null;
          }
        } catch (e) {
          logger.error(`[${this.clientId}] Erro ao buscar mensagem: ${messageId}`, e);
          return null;
        }
      } else {
        logger.info(`[${this.clientId}] Usando mensagem raw fornecida`);
      }

      // Verifica se a mensagem tem imagem
      // Pode estar em message.message.imageMessage ou em message.message (se já for a mensagem processada)
      const imageMsg =
        message?.message?.imageMessage ||
        (message?.message && typeof message.message === "object" && "imageMessage" in message.message
          ? message.message.imageMessage
          : null);

      if (!imageMsg) {
        logger.warn(
          `[${this.clientId}] Mensagem não contém imagem: ${messageId}. Message keys: ${Object.keys(message?.message || {}).join(
            ", "
          )}`
        );
        return null;
      }

      // Garante que a mensagem está no formato WAMessage correto
      const waMessage = {
        key: message.key || { remoteJid: from, id: messageId },
        message: message.message
      };

      logger.info(`[${this.clientId}] Baixando mídia da mensagem...`);

      // Usa a função utilitária downloadMediaMessage do Baileys
      // Ela retorna um Buffer quando type é "buffer"
      // O contexto precisa do logger e da função de reupload
      const downloadContext = {
        logger: pino({ level: "silent" }),
        reuploadRequest: this.sock.updateMediaMessage ? this.sock.updateMediaMessage.bind(this.sock) : async (msg: any) => msg // Fallback: retorna a mensagem original
      };

      const imageBuffer = await downloadMediaMessage(waMessage, "buffer", {}, downloadContext);

      if (!imageBuffer) {
        logger.error(`[${this.clientId}] Buffer de download retornou null para imagem: ${messageId}`);
        return null;
      }

      if (!Buffer.isBuffer(imageBuffer)) {
        logger.error(`[${this.clientId}] Download não retornou um Buffer válido para: ${messageId}`);
        return null;
      }

      logger.info(`[${this.clientId}] Imagem baixada com sucesso: ${messageId} (${imageBuffer.length} bytes)`);

      if (imageBuffer.length === 0) {
        logger.error(`[${this.clientId}] Buffer de imagem está vazio para: ${messageId}`);
        return null;
      }

      return imageBuffer;
    } catch (error) {
      logger.error(`[${this.clientId}] Erro ao baixar imagem: ${messageId}`, error);
      return null;
    }
  }

  async sendImage(to: string, imagePath: string, caption?: string): Promise<void> {
    if (!this.sock) throw new Error("WhatsApp não inicializado");

    try {
      const imageBuffer = await fs.promises.readFile(imagePath);
      await this.sock.sendMessage(to, {
        image: imageBuffer,
        caption: caption
      });
      logger.info(`[${this.clientId}] Imagem enviada para ${to}`);
    } catch (error) {
      logger.error(`[${this.clientId}] Erro ao enviar imagem para ${to}`, error);
      throw error;
    }
  }

  /**
   * Busca o nome do contato pelo número
   */
  async getContactName(phone: string): Promise<string | null> {
    if (!this.sock) return null;

    try {
      // Tenta buscar no store de contatos do Baileys
      // O Baileys armazena contatos em sock.store.contacts
      const store = (this.sock as any).store;
      if (store?.contacts) {
        const contactData = store.contacts[phone];
        if (contactData) {
          // notify é o nome salvo pelo usuário, name é o nome do perfil
          const name = contactData.notify || contactData.name;
          if (name) {
            return name;
          }
        }
      }

      // Se não encontrou no store, tenta buscar usando onWhatsApp
      // Isso verifica se o número está no WhatsApp, mas não retorna o nome diretamente
      // O nome só vem quando há uma conversa anterior ou está salvo nos contatos
      return null;
    } catch (error) {
      logger.debug(`[${this.clientId}] Erro ao buscar nome do contato ${phone}:`, error);
      return null;
    }
  }
}
