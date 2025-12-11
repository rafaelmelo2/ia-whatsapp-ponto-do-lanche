import fs from "fs";
import path from "path";

const DATA_DIR = path.resolve(process.cwd(), "src", "data");
const BACKUP_DIR = path.resolve(process.cwd(), "backups", `backup-${Date.now()}`);

async function backupData() {
  console.log("🔄 Iniciando backup dos dados...");

  if (!fs.existsSync(DATA_DIR)) {
    console.log("❌ Pasta de dados não encontrada!");
    return;
  }

  // Cria pasta de backup
  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  // Copia tudo
  fs.cpSync(DATA_DIR, path.join(BACKUP_DIR, "data"), { recursive: true });

  console.log(`✅ Backup criado em: ${BACKUP_DIR}`);
}

backupData();
