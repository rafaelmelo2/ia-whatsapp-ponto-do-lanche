import fs from "fs";
import path from "path";
import { AppConfig } from "../config/schema.js";
import { logger } from "../utils/logger.js";
import { MenuItem } from "./menuTypes.js";

interface CachedMenu {
  items: MenuItem[];
  formattedText: string;
  lastFetch: number;
}

const CACHE_TTL = 1000 * 60 * 30; // 30 minutos

export class MenuService {
  private cache: CachedMenu | null = null;
  private config: AppConfig;
  private clientId: string;

  constructor(config: AppConfig, clientId: string) {
    this.config = config;
    this.clientId = clientId;
  }

  private getEmojiCategoria(categoriaNome: string): string {
    // Usa emoji da configuração se disponível
    if (this.config.catalog.categories && this.config.catalog.categories[categoriaNome]) {
      return this.config.catalog.categories[categoriaNome].emoji;
    }
    // Fallback genérico se não configurado
    return "🔸";
  }

  private formatarPreco(preco: number): string {
    return preco.toFixed(2).replace(".", ",");
  }

  private formatarNomeItem(nome: string): string {
    return nome
      .toLowerCase()
      .split(" ")
      .map((palavra) => palavra.charAt(0).toUpperCase() + palavra.slice(1))
      .join(" ");
  }

  private formatMenuText(items: MenuItem[]): string {
    const agrupados: Record<string, MenuItem[]> = {};

    items.forEach((item) => {
      const categoriaNome = item.category?.name || "Outros";
      if (!agrupados[categoriaNome]) {
        agrupados[categoriaNome] = [];
      }
      agrupados[categoriaNome].push(item);
    });

    let catalogText = `*${this.config.store.name.toUpperCase()}*\n\n`;
    const todasCategorias = Object.keys(agrupados);

    // Usa ordem configurada ou ordem alfabética como fallback
    const ordemCategoriasConfig = this.config.catalog.category_order || [];
    const categoriasConhecidas = ordemCategoriasConfig.filter((c) => todasCategorias.includes(c));
    const categoriasDesconhecidas = todasCategorias.filter((c) => !ordemCategoriasConfig.includes(c)).sort();

    const ordemCategorias = [...categoriasConhecidas, ...categoriasDesconhecidas];

    ordemCategorias.forEach((categoriaNome) => {
      if (agrupados[categoriaNome] && agrupados[categoriaNome].length > 0) {
        const emoji = this.getEmojiCategoria(categoriaNome);

        // Usa nome formatado da config ou o nome original da categoria
        let nomeFormatado = categoriaNome;
        if (this.config.catalog.categories && this.config.catalog.categories[categoriaNome]) {
          nomeFormatado = this.config.catalog.categories[categoriaNome].name;
        }

        catalogText += `*${emoji} ${nomeFormatado.toUpperCase()}*\n`;

        agrupados[categoriaNome].forEach((item) => {
          const nomeItem = this.formatarNomeItem(item.name);
          const preco = this.formatarPreco(item.basePrice);
          catalogText += `• ${nomeItem} — R$ ${preco}\n`;
        });

        catalogText += "\n";
      }
    });

    return catalogText.trim();
  }

  private async loadFromAPI(): Promise<MenuItem[]> {
    if (!this.config.catalog.api_url) {
      throw new Error("api_url não configurado");
    }

    logger.info(`[${this.clientId}] Buscando catálogo via API: ${this.config.catalog.api_url}`);
    const response = await fetch(this.config.catalog.api_url);

    if (!response.ok) {
      throw new Error(`Erro ao buscar catálogo da API: ${response.statusText}`);
    }

    const data = (await response.json()) as any;
    return this.parseCatalogData(data);
  }

  private async loadFromJSON(): Promise<MenuItem[]> {
    if (!this.config.catalog.json_path) {
      throw new Error("json_path não configurado");
    }

    // Caminho relativo a src/clients/{clientId}/
    const jsonPath = path.resolve(process.cwd(), "src", "clients", this.clientId, this.config.catalog.json_path);

    logger.info(`[${this.clientId}] Carregando catálogo de arquivo JSON: ${jsonPath}`);

    if (!fs.existsSync(jsonPath)) {
      throw new Error(`Arquivo JSON do catálogo não encontrado: ${jsonPath}`);
    }

    const fileContents = fs.readFileSync(jsonPath, "utf8");
    const data = JSON.parse(fileContents);
    return this.parseCatalogData(data);
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split(".").reduce((current, key) => current?.[key], obj);
  }

  private normalizeItem(rawItem: any): MenuItem {
    const mapping = this.config.catalog.field_mapping || {
      name: "name",
      price: "basePrice",
      category: "category.name",
      active: "active",
      showOnWebsite: "showOnWebsite"
    };

    // Extrai valores usando o mapeamento
    const name = this.getNestedValue(rawItem, mapping.name) || rawItem[mapping.name];
    const price = this.getNestedValue(rawItem, mapping.price) ?? rawItem[mapping.price];

    // Categoria pode ser string direta ou objeto com name
    let categoryName: string;
    if (mapping.category.includes(".")) {
      categoryName = this.getNestedValue(rawItem, mapping.category) || "Outros";
    } else {
      const categoryValue = rawItem[mapping.category];
      categoryName = typeof categoryValue === "string" ? categoryValue : categoryValue?.name || "Outros";
    }

    // Campos opcionais com valores padrão
    const active = mapping.active ? this.getNestedValue(rawItem, mapping.active) ?? rawItem[mapping.active] ?? true : true;

    const showOnWebsite = mapping.showOnWebsite
      ? this.getNestedValue(rawItem, mapping.showOnWebsite) ?? rawItem[mapping.showOnWebsite] ?? true
      : true;

    // Validação básica
    if (!name || price === undefined || price === null) {
      throw new Error(`Item inválido: falta 'name' ou 'price'. Item: ${JSON.stringify(rawItem)}`);
    }

    return {
      id: rawItem.id || Math.random(), // ID opcional, gera se não existir
      name: String(name),
      basePrice: Number(price),
      active: Boolean(active),
      showOnWebsite: Boolean(showOnWebsite),
      category: {
        id: rawItem.category?.id || 0,
        name: String(categoryName)
      },
      description: rawItem.description
    };
  }

  private parseCatalogData(data: any): MenuItem[] {
    let rawItems: any[] = [];

    if (Array.isArray(data)) {
      rawItems = data;
    } else if (data.items && Array.isArray(data.items)) {
      rawItems = data.items;
    } else {
      throw new Error("Formato de catálogo inválido. Esperado array ou objeto com propriedade 'items'");
    }

    // Normaliza cada item usando o mapeamento
    const items: MenuItem[] = [];
    for (const rawItem of rawItems) {
      try {
        const normalizedItem = this.normalizeItem(rawItem);
        items.push(normalizedItem);
      } catch (error) {
        logger.warn(`[${this.clientId}] Item ignorado devido a erro: ${error}`);
      }
    }

    // Filtrar ativos
    const activeItems = items.filter((i) => i.active && i.showOnWebsite);

    if (activeItems.length === 0) {
      logger.warn(`[${this.clientId}] Catálogo vazio ou nenhum item ativo encontrado.`);
    }

    return activeItems;
  }

  async getMenu(): Promise<{ items: MenuItem[]; rendered: string }> {
    // Verifica cache
    if (this.cache && Date.now() - this.cache.lastFetch < CACHE_TTL) {
      return { items: this.cache.items, rendered: this.cache.formattedText };
    }

    try {
      let items: MenuItem[];

      // Prioridade: API > JSON
      if (this.config.catalog.api_url) {
        items = await this.loadFromAPI();
      } else if (this.config.catalog.json_path) {
        items = await this.loadFromJSON();
      } else {
        throw new Error("Nenhuma fonte de catálogo configurada (api_url ou json_path)");
      }

      const rendered = this.formatMenuText(items);

      this.cache = {
        items,
        formattedText: rendered,
        lastFetch: Date.now()
      };

      return { items, rendered };
    } catch (error) {
      logger.error(`[${this.clientId}] Falha ao carregar catálogo`, error);
      // Se falhar e tiver cache antigo, retorna ele mesmo expirado
      if (this.cache) {
        logger.warn(`[${this.clientId}] Usando cache expirado devido ao erro`);
        return { items: this.cache.items, rendered: this.cache.formattedText };
      }
      throw error;
    }
  }

  // Helper para validar se um item existe e pegar o preço real
  getItemPrice(itemName: string): number | null {
    if (!this.cache) return null;
    // Busca aproximada ou exata. O ideal é ter IDs.
    // Aqui vamos fazer match por nome para simplificar a migração
    const item = this.cache.items.find((i) => i.name.toLowerCase() === itemName.toLowerCase());
    return item ? item.basePrice : null;
  }
}
