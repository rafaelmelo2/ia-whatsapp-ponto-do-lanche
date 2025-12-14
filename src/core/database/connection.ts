import mongoose from "mongoose";
import { logger } from "../utils/logger.js";
import fs from "fs";

let isConnected = false;

/**
 * Conecta ao MongoDB
 * Garante que sempre use o banco "whatsapp-bot"
 */
export async function connectDatabase(uri?: string): Promise<void> {
  if (isConnected) {
    logger.info("Já conectado ao MongoDB");
    return;
  }

  const DB_NAME = "whatsapp-bot";
  let mongoUri = uri || process.env.MONGODB_URI || `mongodb://localhost:27017/${DB_NAME}`;
  
  // Detecta se está rodando fora do Docker (hostname "mongodb" não resolve)
  // Se a URI contém "mongodb:27017" e NÃO estamos num container Docker, usa localhost
  const isDocker = process.env.DOCKER_CONTAINER === "true" || fs.existsSync("/.dockerenv");
  
  if (mongoUri.includes("mongodb://mongodb:27017") && !isDocker) {
    mongoUri = mongoUri.replace("mongodb://mongodb:", "mongodb://localhost:");
    logger.info(`🔄 Ajustando URI do MongoDB para ambiente local: ${mongoUri.replace(/\/\/.*@/, "//***@")}`);
  }

  // Garante que a URI sempre especifica o banco de dados correto
  if (!mongoUri.includes(`/${DB_NAME}`)) {
    // Remove qualquer nome de banco existente e adiciona o correto
    mongoUri = mongoUri.replace(/\/[^\/\?]+(\?|$)/, `/${DB_NAME}$1`);
    // Se não tinha / após a porta, adiciona
    if (!mongoUri.match(/:\d+\//)) {
      mongoUri = mongoUri.replace(/:(\d+)(\?|$)/, `:$1/${DB_NAME}$2`);
    }
  }
  
  try {
    await mongoose.connect(mongoUri);
    isConnected = true;
    logger.info(`✅ Conectado ao MongoDB: ${mongoUri.replace(/\/\/.*@/, "//***@")}`);
  } catch (error) {
    logger.error("❌ Erro ao conectar ao MongoDB:", error);
    throw error;
  }

  // Listener para reconexão
  mongoose.connection.on("error", (err) => {
    logger.error("Erro na conexão MongoDB:", err);
    isConnected = false;
  });

  mongoose.connection.on("disconnected", () => {
    logger.warn("Desconectado do MongoDB");
    isConnected = false;
  });

  mongoose.connection.on("reconnected", () => {
    logger.info("Reconectado ao MongoDB");
    isConnected = true;
  });
}

/**
 * Desconecta do MongoDB
 */
export async function disconnectDatabase(): Promise<void> {
  if (!isConnected) return;
  
  try {
    await mongoose.disconnect();
    isConnected = false;
    logger.info("Desconectado do MongoDB");
  } catch (error) {
    logger.error("Erro ao desconectar do MongoDB:", error);
    throw error;
  }
}

/**
 * Verifica se está conectado
 */
export function isDatabaseConnected(): boolean {
  return isConnected && mongoose.connection.readyState === 1;
}

