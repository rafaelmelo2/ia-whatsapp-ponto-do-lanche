import fs from "fs";
import yaml from "js-yaml";
import path from "path";
import { AppConfig, ConfigSchema } from "./schema.js";

export function loadConfig(clientId: string): AppConfig {
  // Caminho base para clients: src/clients
  // Ajuste o caminho relativo conforme a necessidade de execução (dist vs src)
  const configPath = path.resolve(process.cwd(), "src", "clients", clientId, "config.yaml");

  if (!fs.existsSync(configPath)) {
    throw new Error(`Configuração não encontrada para o cliente: ${clientId} em ${configPath}`);
  }

  const fileContents = fs.readFileSync(configPath, "utf8");
  let rawConfig: any = yaml.load(fileContents);

  // Migração automática: compatibilidade retroativa
  // Se tiver "menu", migra para "catalog"
  if (rawConfig.menu && !rawConfig.catalog) {
    rawConfig.catalog = {
      ...rawConfig.menu,
      name: rawConfig.menu.catalog_name || rawConfig.menu.name || "Catálogo",
      item_name: rawConfig.menu.item_name || "item"
    };
    // Se tinha api_url no menu antigo, mantém como api_url
    if (rawConfig.menu.api_url) {
      rawConfig.catalog.api_url = rawConfig.menu.api_url;
    }
    // Remove catalog_name se existir (já foi movido para name)
    if (rawConfig.catalog.catalog_name) {
      delete rawConfig.catalog.catalog_name;
    }
    // Remove menu após migração para evitar conflito com schema
    delete rawConfig.menu;
  }

  // Se tiver "surcharge_per_sandwich", migra para "packaging_fee"
  if (rawConfig.delivery?.surcharge_per_sandwich && !rawConfig.delivery?.packaging_fee) {
    rawConfig.delivery.packaging_fee = rawConfig.delivery.surcharge_per_sandwich;
    rawConfig.delivery.packaging_fee_label = "Taxa de embalagem";
  }

  const result = ConfigSchema.safeParse(rawConfig);

  if (!result.success) {
    console.error("Erro de validação na configuração:", result.error.format());
    throw new Error(`Configuração inválida para o cliente: ${clientId}`);
  }

  return result.data;
}
