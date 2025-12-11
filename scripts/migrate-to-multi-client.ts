import fs from "fs";
import path from "path";

const OLD_DATA_DIR = path.resolve(process.cwd(), "src", "data");
const CLIENT_ID = process.env.MIGRATE_CLIENT_ID || "ponto-do-lanche";

async function migrateData() {
  console.log(`🔄 Migrando dados para estrutura multi-cliente (cliente: ${CLIENT_ID})...`);

  const NEW_DATA_DIR = path.resolve(process.cwd(), "src", "data", CLIENT_ID);

  if (!fs.existsSync(OLD_DATA_DIR)) {
    console.log("❌ Pasta de dados antiga não encontrada!");
    return;
  }

  // Cria estrutura nova
  fs.mkdirSync(NEW_DATA_DIR, { recursive: true });
  fs.mkdirSync(path.join(NEW_DATA_DIR, "conversations"), { recursive: true });
  fs.mkdirSync(path.join(NEW_DATA_DIR, "orders"), { recursive: true });
  fs.mkdirSync(path.join(NEW_DATA_DIR, "menu"), { recursive: true });
  fs.mkdirSync(path.join(NEW_DATA_DIR, "tokens"), { recursive: true });

  // Move conversations
  const oldConversationsDir = path.join(OLD_DATA_DIR, "conversations");
  if (fs.existsSync(oldConversationsDir)) {
    const files = fs.readdirSync(oldConversationsDir);
    files.forEach((file) => {
      const oldPath = path.join(oldConversationsDir, file);
      const newPath = path.join(NEW_DATA_DIR, "conversations", file);
      if (fs.statSync(oldPath).isFile()) {
        fs.copyFileSync(oldPath, newPath);
        console.log(`✅ Migrado: conversations/${file}`);
      } else if (fs.statSync(oldPath).isDirectory()) {
        // Para subdiretórios como archive
        const archiveNewPath = path.join(NEW_DATA_DIR, "conversations", file);
        fs.cpSync(oldPath, archiveNewPath, { recursive: true });
        console.log(`✅ Migrado: conversations/${file}/`);
      }
    });
  }

  // Move orders
  const oldOrdersDir = path.join(OLD_DATA_DIR, "orders");
  if (fs.existsSync(oldOrdersDir)) {
    const files = fs.readdirSync(oldOrdersDir);
    files.forEach((file) => {
      const oldPath = path.join(oldOrdersDir, file);
      const newPath = path.join(NEW_DATA_DIR, "orders", file);
      if (fs.statSync(oldPath).isFile()) {
        fs.copyFileSync(oldPath, newPath);
        console.log(`✅ Migrado: orders/${file}`);
      }
    });
  }

  // Move menu cache
  const oldMenuDir = path.join(OLD_DATA_DIR, "menu");
  if (fs.existsSync(oldMenuDir)) {
    const files = fs.readdirSync(oldMenuDir);
    files.forEach((file) => {
      const oldPath = path.join(oldMenuDir, file);
      const newPath = path.join(NEW_DATA_DIR, "menu", file);
      if (fs.statSync(oldPath).isFile()) {
        fs.copyFileSync(oldPath, newPath);
        console.log(`✅ Migrado: menu/${file}`);
      }
    });
  }

  // Move tokens (se existir)
  const oldTokensDir = path.join(OLD_DATA_DIR, "tokens");
  if (fs.existsSync(oldTokensDir)) {
    const files = fs.readdirSync(oldTokensDir);
    files.forEach((file) => {
      const oldPath = path.join(oldTokensDir, file);
      const newPath = path.join(NEW_DATA_DIR, "tokens", file);
      if (fs.statSync(oldPath).isFile()) {
        fs.copyFileSync(oldPath, newPath);
        console.log(`✅ Migrado: tokens/${file}`);
      }
    });
  }

  console.log(`✅ Migração concluída! Dados em: ${NEW_DATA_DIR}`);
  console.log("⚠️  DADOS ANTIGOS AINDA EXISTEM. Remova manualmente após validação.");
}

migrateData();
