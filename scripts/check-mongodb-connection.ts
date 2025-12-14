import "dotenv/config";
import mongoose from "mongoose";
import fs from "fs";

async function checkConnection() {
  console.log("🔍 Verificando qual MongoDB está sendo usado...\n");
  
  const DB_NAME = "whatsapp-bot";
  let uri = process.env.MONGODB_URI || `mongodb://localhost:27017/${DB_NAME}`;
  
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

  console.log(`📡 URI que será usada: ${uri.replace(/\/\/.*@/, "//***@")}`);
  console.log(`📍 Está rodando no Docker? ${isDocker ? "SIM" : "NÃO"}\n`);

  try {
    await mongoose.connect(uri);
    console.log("✅ Conectado com sucesso!\n");
    
    // Lista TODOS os bancos
    const admin = mongoose.connection.db.admin();
    const dbs = await admin.listDatabases();
    
    console.log("📂 BANCOS DE DADOS ENCONTRADOS:");
    dbs.databases.forEach((db: any) => {
      const isWhatsAppBot = db.name === DB_NAME;
      const marker = isWhatsAppBot ? " ⭐ (ESTE É O BANCO DO BOT)" : "";
      console.log(`   - ${db.name} (${(db.sizeOnDisk / 1024 / 1024).toFixed(2)} MB)${marker}`);
    });
    
    // Verifica se whatsapp-bot existe
    const whatsappBotExists = dbs.databases.some((db: any) => db.name === DB_NAME);
    
    if (!whatsappBotExists) {
      console.log(`\n❌ PROBLEMA: O banco '${DB_NAME}' NÃO EXISTE neste MongoDB!`);
      console.log(`\n💡 POSSÍVEIS CAUSAS:`);
      console.log(`   1. Você está conectando em um MongoDB diferente do que o bot usa`);
      console.log(`   2. O Docker não está expondo a porta 27017 corretamente`);
      console.log(`   3. Há um MongoDB local rodando na porta 27017 (Windows) que está bloqueando`);
      console.log(`\n🔧 SOLUÇÃO:`);
      console.log(`   - Verifique se o container do MongoDB está rodando: docker ps`);
      console.log(`   - Verifique se a porta está mapeada: docker ps | grep 27017`);
      console.log(`   - Pare qualquer MongoDB local do Windows que possa estar rodando`);
    } else {
      console.log(`\n✅ O banco '${DB_NAME}' EXISTE!`);
      
      // Conta documentos
      const db = mongoose.connection.db;
      const conversations = await db.collection("conversations").countDocuments();
      const orders = await db.collection("orders").countDocuments();
      const photos = await db.collection("photos").countDocuments();
      
      console.log(`\n📊 DOCUMENTOS NO BANCO '${DB_NAME}':`);
      console.log(`   - conversations: ${conversations}`);
      console.log(`   - orders: ${orders}`);
      console.log(`   - photos: ${photos}`);
    }
    
    await mongoose.disconnect();
  } catch (error: any) {
    console.error("❌ Erro:", error.message);
    if (error.message.includes("ECONNREFUSED")) {
      console.log("\n💡 O MongoDB não está acessível nesta porta.");
      console.log("   Verifique se o container está rodando: docker ps");
    }
  }
}

checkConnection();

