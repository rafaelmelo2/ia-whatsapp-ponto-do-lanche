import "dotenv/config";
import mongoose from "mongoose";
import fs from "fs";
import { logger } from "../src/core/utils/logger.js";
import { ConversationModel } from "../src/core/database/models/Conversation.js";
import { OrderModel } from "../src/core/database/models/Order.js";

async function diagnose() {
  console.log("🔍 Iniciando diagnóstico do MongoDB...");
  
  // 1. Verificar URI e Conexão
  const DB_NAME = "whatsapp-bot";
  let uri = process.env.MONGODB_URI || `mongodb://localhost:27017/${DB_NAME}`;
  
  // Detecta se está rodando fora do Docker (hostname "mongodb" não resolve)
  // Mesma lógica do connection.ts
  const isDocker = process.env.DOCKER_CONTAINER === "true" || fs.existsSync("/.dockerenv");
  
  if (uri.includes("mongodb://mongodb:27017") && !isDocker) {
    uri = uri.replace("mongodb://mongodb:", "mongodb://localhost:");
    console.log(`🔄 Ajustando URI do MongoDB para ambiente local: ${uri.replace(/\/\/.*@/, "//***@")}`);
  }
  
  // Ajuste igual ao do connection.ts
  if (!uri.includes(`/${DB_NAME}`)) {
    uri = uri.replace(/\/[^\/\?]+(\?|$)/, `/${DB_NAME}$1`);
    if (!uri.match(/:\d+\//)) {
      uri = uri.replace(/:(\d+)(\?|$)/, `:$1/${DB_NAME}$2`);
    }
  }

  console.log(`📡 Tentando conectar em: ${uri.replace(/\/\/.*@/, "//***@")}`);

  try {
    await mongoose.connect(uri);
    console.log("✅ Conexão bem sucedida!");
  } catch (error) {
    console.error("❌ Falha na conexão:", error);
    process.exit(1);
  }

  // 2. Listar Bancos de Dados (se tiver permissão)
  try {
    const admin = mongoose.connection.db.admin();
    const dbs = await admin.listDatabases();
    console.log("\n📂 Bancos de dados encontrados:");
    dbs.databases.forEach((db: any) => {
      console.log(`   - ${db.name} (Size: ${db.sizeOnDisk})`);
    });
  } catch (error) {
    console.log("⚠️ Não foi possível listar bancos de dados (pode ser falta de permissão).");
  }

  // 3. Verificar Coleções no banco atual
  console.log(`\n📊 Estatísticas do banco '${mongoose.connection.name}':`);
  
  const conversationsCount = await ConversationModel.countDocuments();
  console.log(`   - Conversas: ${conversationsCount}`);
  
  const ordersCount = await OrderModel.countDocuments();
  console.log(`   - Pedidos: ${ordersCount}`);

  // 4. Teste de Escrita e Leitura
  console.log("\n🧪 Testando escrita e leitura...");
  const testPhone = "5511999999999@s.whatsapp.net";
  try {
    // Escrita
    await ConversationModel.findOneAndUpdate(
      { clientId: "diagnostico", phone: testPhone, isArchived: false },
      { 
        clientId: "diagnostico", 
        phone: testPhone, 
        lastInteraction: new Date(),
        history: [{ role: "system", content: "Teste de diagnóstico", timestamp: Date.now() }]
      },
      { upsert: true, new: true }
    );
    console.log("✅ Escrita OK");

    // Leitura
    const doc = await ConversationModel.findOne({ clientId: "diagnostico", phone: testPhone });
    if (doc) {
      console.log("✅ Leitura OK");
      // Limpeza
      await ConversationModel.deleteOne({ _id: doc._id });
      console.log("✅ Limpeza OK");
    } else {
      console.error("❌ Falha na leitura: documento não encontrado após escrita.");
    }

  } catch (error) {
    console.error("❌ Erro no teste de escrita/leitura:", error);
  }

  console.log("\n🏁 Diagnóstico concluído.");
  await mongoose.disconnect();
}

diagnose();

