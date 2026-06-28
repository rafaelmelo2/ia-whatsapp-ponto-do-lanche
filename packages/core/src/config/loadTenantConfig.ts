import fs from "fs";
import yaml from "js-yaml";
import path from "path";
import { AppConfig, ConfigSchema } from "./tenantConfigSchema.js";

export function loadConfig(clientId: string): AppConfig {
  // Caminho base para clients: src/clients
  // Ajuste o caminho relativo conforme a necessidade de execução (dist vs src)
  const configPath = path.resolve(process.cwd(), "src", "clients", clientId, "config.yaml");

  if (!fs.existsSync(configPath)) {
    throw new Error(`Configuração não encontrada para o cliente: ${clientId} em ${configPath}`);
  }

  const fileContents = fs.readFileSync(configPath, "utf8");
  const rawConfig = yaml.load(fileContents);

  const result = ConfigSchema.safeParse(rawConfig);

  if (!result.success) {
    console.error("Erro de validação na configuração:", result.error.format());
    throw new Error(`Configuração inválida para o cliente: ${clientId}`);
  }

  return result.data;
}
