import "dotenv/config";
import mongoose from "mongoose";
import fs from "fs";
import { ConversationModel } from "../src/core/database/models/Conversation.js";
import { OrderModel } from "../src/core/database/models/Order.js";
import { PhotoModel } from "../src/core/database/models/Photo.js";

async function listData() {
  console.log("🔍 Listando dados do MongoDB...");
  
  const DB_NAME = "whatsapp-bot";
  let uri = process.env.MONGODB_URI || `mongodb://localhost:27017/${DB_NAME}`;
  
  // Detecta se está rodando fora do Docker
  const isDocker = process.env.DOCKER_CONTAINER === "true" || fs.existsSync("/.dockerenv");
  
  if (uri.includes("mongodb://mongodb:27017") && !isDocker) {
    uri = uri.replace("mongodb://mongodb:", "mongodb://localhost:");
  }
  
  if (!uri.includes(`/${DB_NAME}`)) {
    uri = uri.replace(/\/[^\/\?]+(\?|$)/, `/${DB_NAME}$1`);
    if (!uri.match(/:\d+\//)) {
      uri = uri.replace(/:(\d+)(\?|$)/, `:$1/${DB_NAME}$2`);
    }
  }

  console.log(`📡 Conectando em: ${uri.replace(/\/\/.*@/, "//***@")}`);

  try {
    await mongoose.connect(uri);
    console.log("✅ Conectado!\n");
  } catch (error) {
    console.error("❌ Falha na conexão:", error);
    process.exit(1);
  }

  // Listar conversas
  console.log("💬 CONVERSAS:");
  const conversations = await ConversationModel.find({}).sort({ lastInteraction: -1 }).limit(10);
  console.log(`   Total: ${await ConversationModel.countDocuments()}`);
  conversations.forEach((conv, i) => {
    console.log(`   ${i + 1}. ${conv.phone} (${conv.history.length} msgs, cliente: ${conv.clientId}, arquivada: ${conv.isArchived})`);
    console.log(`      Última interação: ${conv.lastInteraction}`);
  });

  // Listar pedidos
  console.log("\n📦 PEDIDOS:");
  const orders = await OrderModel.find({}).sort({ createdAt: -1 }).limit(10);
  console.log(`   Total: ${await OrderModel.countDocuments()}`);
  orders.forEach((order, i) => {
    console.log(`   ${i + 1}. ID: ${order.id} (cliente: ${order.clientId}, status: ${order.status}, total: R$ ${order.total})`);
  });

  // Listar fotos
  console.log("\n📸 FOTOS:");
  const photos = await PhotoModel.find({}).sort({ uploadedAt: -1 }).limit(10);
  console.log(`   Total: ${await PhotoModel.countDocuments()}`);
  photos.forEach((photo, i) => {
    console.log(`   ${i + 1}. ${photo.filename} (pedido: ${photo.orderId}, item: ${photo.itemName})`);
  });

  console.log("\n🏁 Concluído.");
  await mongoose.disconnect();
}

listData();

