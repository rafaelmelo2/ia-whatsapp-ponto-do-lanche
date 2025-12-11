import fs from "fs";
import path from "path";
import { loadConfig } from "../config/loadConfig.js";
import { logger } from "../utils/logger.js";

export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  thought?: string;
  timestamp: number;
}

export interface ConversationState {
  phone: string;
  history: Message[];
  lastInteraction: number;
  // Poderíamos guardar o estado do pedido rascunho aqui também
  currentOrderId?: string;
}

export class ConversationManager {
  private dataDir: string;
  private clientId: string;
  private timeoutMs: number;

  constructor(clientId: string) {
    this.clientId = clientId;
    this.dataDir = path.resolve(process.cwd(), "src", "data", clientId, "conversations");
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }

    // Carrega o timeout da configuração do cliente
    const config = loadConfig(clientId);
    const timeoutMinutes = config.conversation?.timeout_minutes ?? 5;
    this.timeoutMs = timeoutMinutes * 60 * 1000; // Converte minutos para milissegundos
  }

  private getFilePath(phone: string): string {
    return path.join(this.dataDir, `${phone}.json`);
  }

  async get(phone: string): Promise<ConversationState> {
    const filePath = this.getFilePath(phone);

    if (fs.existsSync(filePath)) {
      try {
        const data = await fs.promises.readFile(filePath, "utf8");
        const state: ConversationState = JSON.parse(data);

        // Verifica timeout (usando o valor configurado para este cliente)
        if (Date.now() - state.lastInteraction > this.timeoutMs) {
          logger.info(`[${this.clientId}] Conversa expirada para numero ${phone}. Arquivando...`);

          // 1. Cria pasta archive se não existir
          const archiveDir = path.join(this.dataDir, "archive");
          if (!fs.existsSync(archiveDir)) {
            await fs.promises.mkdir(archiveDir, { recursive: true });
          }

          // 2. Move o arquivo atual para o archive com timestamp
          const archiveFilename = `${phone}_${state.lastInteraction}.json`;
          const archivePath = path.join(archiveDir, archiveFilename);

          try {
            await fs.promises.rename(filePath, archivePath);
            logger.info(`[${this.clientId}] Conversa arquivada em: ${archivePath}`);
          } catch (err) {
            logger.error(`[${this.clientId}] Erro ao arquivar conversa de ${phone}`, err);
          }

          // 3. Retorna estado zerado (novo arquivo será criado no próximo save)
          return {
            phone,
            history: [],
            lastInteraction: Date.now()
          };
        }

        return state;
      } catch (e) {
        logger.error(`[${this.clientId}] Erro ao ler conversa de ${phone}`, e);
      }
    }

    return {
      phone,
      history: [],
      lastInteraction: Date.now()
    };
  }

  async save(state: ConversationState): Promise<void> {
    const filePath = this.getFilePath(state.phone);
    state.lastInteraction = Date.now();

    // Limitar histórico para não estourar tokens (opcional, mas recomendado)
    if (state.history.length > 30) {
      state.history = state.history.slice(-30);
    }

    try {
      await fs.promises.writeFile(filePath, JSON.stringify(state, null, 2));
    } catch (e) {
      logger.error(`[${this.clientId}] Erro ao salvar conversa de ${state.phone}`, e);
    }
  }

  async addMessage(
    phone: string,
    role: "user" | "assistant" | "system",
    content: string,
    thought?: string
  ): Promise<ConversationState> {
    const state = await this.get(phone);
    state.history.push({ role, content, thought, timestamp: Date.now() });
    await this.save(state);
    return state;
  }

  async clearHistory(phone: string): Promise<void> {
    const state = await this.get(phone);
    state.history = [];
    await this.save(state);
  }
}
