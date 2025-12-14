import "dotenv/config";
import fs from "fs";
import path from "path";
import { connectDatabase, disconnectDatabase } from "../src/core/database/connection.js";
import { MongoDBOrderRepository } from "../src/core/database/repositories/OrderRepository.js";
import { MongoDBConversationRepository } from "../src/core/database/repositories/ConversationRepository.js";
import { MongoDBAppointmentRepository } from "../src/core/database/repositories/AppointmentRepository.js";
import { MongoDBPhotoRepository, PhotoData } from "../src/core/database/repositories/PhotoRepository.js";
import { Order } from "../src/core/workflows/modular/commerce/types.js";
import { Appointment } from "../src/core/workflows/modular/appointment/types.js";
import { ConversationState } from "../src/core/orders/orderState.js";
import { logger } from "../src/core/utils/logger.js";
import { PhotoMetadata } from "../src/core/services/photoService.js";

/**
 * Script para migrar dados JSON existentes para MongoDB
 * 
 * ⚠️ IMPORTANTE: Este script APENAS COPIA os dados para o MongoDB.
 * Os arquivos JSON originais NÃO SÃO APAGADOS e permanecem intactos.
 * 
 * Uso:
 *   npm run migrate:mongodb <client-id>
 *   ou
 *   node --no-warnings --loader ts-node/esm/transpile-only scripts/migrate-to-mongodb.ts <client-id>
 */

/**
 * Migra pedidos de arquivos JSON para MongoDB
 * ⚠️ Os arquivos JSON originais NÃO SÃO APAGADOS, apenas copiados
 */
async function migrateOrders(clientId: string) {
  const ordersDir = path.resolve(process.cwd(), "src", "data", clientId, "orders");
  if (!fs.existsSync(ordersDir)) {
    logger.info(`[${clientId}] Pasta de pedidos não existe: ${ordersDir}`);
    return 0;
  }

  const files = fs.readdirSync(ordersDir).filter(f => f.endsWith(".json"));
  const repo = new MongoDBOrderRepository(clientId);
  let migrated = 0;

  for (const file of files) {
    try {
      const filePath = path.join(ordersDir, file);
      // ⚠️ APENAS LEITURA - arquivo não é modificado nem apagado
      const content = await fs.promises.readFile(filePath, "utf8");
      const order: Order = JSON.parse(content);
      
      // Salva no MongoDB (copia, não move)
      await repo.save(order);
      migrated++;
      logger.info(`[${clientId}] Pedido migrado: ${order.id} (arquivo preservado: ${file})`);
    } catch (error) {
      logger.error(`[${clientId}] Erro ao migrar pedido ${file}:`, error);
    }
  }

  return migrated;
}

/**
 * Migra conversas de arquivos JSON para MongoDB
 * ⚠️ Os arquivos JSON originais NÃO SÃO APAGADOS, apenas copiados
 */
async function migrateConversations(clientId: string) {
  const conversationsDir = path.resolve(process.cwd(), "src", "data", clientId, "conversations");
  if (!fs.existsSync(conversationsDir)) {
    logger.info(`[${clientId}] Pasta de conversas não existe: ${conversationsDir}`);
    return 0;
  }

  // Migrar conversas ativas
  const files = fs.readdirSync(conversationsDir)
    .filter(f => f.endsWith(".json") && !f.includes("_"));
  
  const repo = new MongoDBConversationRepository(clientId, 5);
  let migrated = 0;

  for (const file of files) {
    try {
      const filePath = path.join(conversationsDir, file);
      // ⚠️ APENAS LEITURA - arquivo não é modificado nem apagado
      const content = await fs.promises.readFile(filePath, "utf8");
      const state: ConversationState = JSON.parse(content);
      
      // Salva no MongoDB (copia, não move)
      await repo.save(state);
      migrated++;
      logger.info(`[${clientId}] Conversa migrada: ${state.phone} (arquivo preservado: ${file})`);
    } catch (error) {
      logger.error(`[${clientId}] Erro ao migrar conversa ${file}:`, error);
    }
  }

  // Migrar conversas arquivadas
  const archiveDir = path.join(conversationsDir, "archive");
  if (fs.existsSync(archiveDir)) {
    const archiveFiles = fs.readdirSync(archiveDir).filter(f => f.endsWith(".json"));
    
    for (const file of archiveFiles) {
      try {
        const filePath = path.join(archiveDir, file);
        // ⚠️ APENAS LEITURA - arquivo não é modificado nem apagado
        const content = await fs.promises.readFile(filePath, "utf8");
        const state: ConversationState = JSON.parse(content);
        
        // Salva como arquivada manualmente (precisa de método adicional ou usar modelo direto)
        const { ConversationModel } = await import("../src/core/database/models/Conversation.js");
        const phone = file.split("_")[0]; // Extrai o phone do nome do arquivo
        
        await ConversationModel.findOneAndUpdate(
          { clientId, phone, isArchived: false },
          {
            clientId,
            phone,
            history: state.history,
            lastInteraction: new Date(state.lastInteraction),
            currentOrderId: state.currentOrderId,
            isArchived: true,
            archivedAt: new Date(state.lastInteraction)
          },
          { upsert: true, new: true }
        );
        
        migrated++;
        logger.info(`[${clientId}] Conversa arquivada migrada: ${phone} (arquivo preservado: ${file})`);
      } catch (error) {
        logger.error(`[${clientId}] Erro ao migrar conversa arquivada ${file}:`, error);
      }
    }
  }

  return migrated;
}

/**
 * Migra agendamentos de arquivos JSON para MongoDB
 * ⚠️ Os arquivos JSON originais NÃO SÃO APAGADOS, apenas copiados
 */
async function migrateAppointments(clientId: string) {
  const appointmentsDir = path.resolve(process.cwd(), "src", "data", clientId, "appointments");
  if (!fs.existsSync(appointmentsDir)) {
    logger.info(`[${clientId}] Pasta de agendamentos não existe: ${appointmentsDir}`);
    return 0;
  }

  const files = fs.readdirSync(appointmentsDir).filter(f => f.endsWith(".json"));
  const repo = new MongoDBAppointmentRepository(clientId);
  let migrated = 0;

  for (const file of files) {
    try {
      const filePath = path.join(appointmentsDir, file);
      // ⚠️ APENAS LEITURA - arquivo não é modificado nem apagado
      const content = await fs.promises.readFile(filePath, "utf8");
      const appointment: Appointment = JSON.parse(content);
      
      // Salva no MongoDB (copia, não move)
      await repo.save(appointment);
      migrated++;
      logger.info(`[${clientId}] Agendamento migrado: ${appointment.id} (arquivo preservado: ${file})`);
    } catch (error) {
      logger.error(`[${clientId}] Erro ao migrar agendamento ${file}:`, error);
    }
  }

  return migrated;
}

/**
 * Migra metadados de fotos de arquivos JSON para MongoDB
 * ⚠️ Os arquivos JSON originais NÃO SÃO APAGADOS, apenas copiados
 */
async function migratePhotos(clientId: string) {
  const photosDir = path.resolve(process.cwd(), "src", "data", clientId, "photos");
  if (!fs.existsSync(photosDir)) {
    logger.info(`[${clientId}] Pasta de fotos não existe: ${photosDir}`);
    return 0;
  }

  // A estrutura é: photos/{orderId}/{itemName}/metadata.json
  const repo = new MongoDBPhotoRepository(clientId);
  let migrated = 0;

  try {
    const orderDirs = fs.readdirSync(photosDir);
    
    for (const orderId of orderDirs) {
      const orderPath = path.join(photosDir, orderId);
      if (!fs.statSync(orderPath).isDirectory()) continue;

      const itemDirs = fs.readdirSync(orderPath);
      for (const itemName of itemDirs) {
        const itemPath = path.join(orderPath, itemName);
        if (!fs.statSync(itemPath).isDirectory()) continue;

        const metadataPath = path.join(itemPath, "metadata.json");
        if (fs.existsSync(metadataPath)) {
          try {
            const content = await fs.promises.readFile(metadataPath, "utf8");
            const photos: PhotoMetadata[] = JSON.parse(content);
            
            for (const photo of photos) {
              const filePath = path.join(itemPath, photo.filename);
              
              await repo.save({
                clientId,
                orderId,
                itemName, // Note: o nome do diretório pode ser sanitizado, mas o metadata tem o nome real se disponível, ou usamos o do dir
                filename: photo.filename,
                caption: photo.caption,
                uploadedAt: new Date(photo.uploadedAt),
                filePath
              });
              migrated++;
            }
          } catch (err) {
            logger.error(`[${clientId}] Erro ao migrar fotos de ${orderId}/${itemName}:`, err);
          }
        }
      }
    }
  } catch (error) {
    logger.error(`[${clientId}] Erro ao ler diretório de fotos:`, error);
  }

  return migrated;
}

/**
 * Função auxiliar para detectar a URI do MongoDB baseado no ambiente
 * Se estiver rodando fora do Docker, usa localhost
 */
function getMongoUri(): string {
  // Se MONGODB_URI estiver definido, usa ele
  if (process.env.MONGODB_URI) {
    // Se contém "mongodb:" (hostname do Docker), tenta substituir por localhost se necessário
    const uri = process.env.MONGODB_URI;
    // Detecta se está rodando fora do Docker (hostname "mongodb" não resolve)
    if (uri.includes("mongodb:27017") && !process.env.DOCKER_CONTAINER) {
      // Substitui mongodb por localhost para executar fora do Docker
      const localhostUri = uri.replace("mongodb://mongodb:", "mongodb://localhost:");
      logger.info(`🔄 Ajustando URI do MongoDB para ambiente local: ${localhostUri.replace(/\/\/.*@/, "//***@")}`);
      return localhostUri;
    }
    return uri;
  }
  
  // Default: localhost (funciona tanto dentro quanto fora do Docker)
  return "mongodb://localhost:27017/whatsapp-bot";
}

async function main() {
  const clientId = process.argv[2];
  
  if (!clientId) {
    console.error("❌ ERRO: Forneça o CLIENT_ID como argumento");
    console.error("Uso: npm run migrate:mongodb <client-id>");
    process.exit(1);
  }

  try {
    logger.info(`🚀 Iniciando migração para MongoDB (cliente: ${clientId})`);
    logger.info(`⚠️  IMPORTANTE: Os arquivos JSON originais NÃO SERÃO APAGADOS, apenas copiados para o MongoDB`);
    
    // Conecta ao MongoDB com URI ajustada para o ambiente
    const mongoUri = getMongoUri();
    await connectDatabase(mongoUri);
    
    // Migra dados (apenas cópia, não move)
    logger.info("📦 Migrando pedidos...");
    const ordersMigrated = await migrateOrders(clientId);
    
    logger.info("💬 Migrando conversas...");
    const conversationsMigrated = await migrateConversations(clientId);
    
    logger.info("📅 Migrando agendamentos...");
    const appointmentsMigrated = await migrateAppointments(clientId);
    
    logger.info("📸 Migrando fotos (metadados)...");
    const photosMigrated = await migratePhotos(clientId);
    
    logger.info(`✅ Migração concluída!`);
    logger.info(`   - Pedidos: ${ordersMigrated}`);
    logger.info(`   - Conversas: ${conversationsMigrated}`);
    logger.info(`   - Agendamentos: ${appointmentsMigrated}`);
    logger.info(`   - Fotos: ${photosMigrated}`);
    logger.info(`⚠️  Lembrete: Os arquivos JSON originais foram preservados e não foram apagados`);
    
    await disconnectDatabase();
  } catch (error) {
    logger.error("❌ Erro durante migração:", error);
    process.exit(1);
  }
}

main();

