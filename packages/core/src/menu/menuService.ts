import { AppConfig } from "../config/tenantConfigSchema.js";
import { logger } from "../observability/logger.js";
import { MenuItem } from "./menuTypes.js";

interface CachedMenu {
  items: MenuItem[];
  formattedText: string;
  lastFetch: number;
}

const CACHE_TTL = 1000 * 60 * 30; // 30 minutos

// Configuração de categorias (hardcoded por enquanto, mas poderia vir de config externa)
const CATEGORY_CONFIG: Record<string, { emoji: string; name: string }> = {
  Hamburger: { emoji: "🍔", name: "Hambúrgueres" },
  Lombo: { emoji: "🥩", name: "Lombos" },
  Frango: { emoji: "🍗", name: "Sanduíches de Frango" },
  Vegetariano: { emoji: "🥗", name: "Vegetarianos" },
  Refrigerantes: { emoji: "🥤", name: "Refrigerantes" },
  Cervejas: { emoji: "🍺", name: "Cervejas" },
  "Sucos e cremes": { emoji: "🧃", name: "Sucos e Cremes" }
};

const ORDEM_CATEGORIAS_PREFERIDA = ["Hamburger", "Lombo", "Frango", "Vegetariano", "Refrigerantes", "Cervejas", "Sucos e cremes"];

export class MenuService {
  private cache: CachedMenu | null = null;
  private config: AppConfig;

  constructor(config: AppConfig) {
    this.config = config;
  }

  private getEmojiCategoria(categoriaNome: string): string {
    if (CATEGORY_CONFIG[categoriaNome]) {
      return CATEGORY_CONFIG[categoriaNome].emoji;
    }
    const nomeLower = categoriaNome.toLowerCase();
    if (nomeLower.includes("refrigerante") || nomeLower.includes("bebida")) return "🥤";
    if (nomeLower.includes("cerveja") || nomeLower.includes("bebida alcoólica")) return "🍺";
    if (nomeLower.includes("suco") || nomeLower.includes("creme")) return "🧃";
    if (nomeLower.includes("hamburger") || nomeLower.includes("hambúrguer")) return "🍔";
    if (nomeLower.includes("lombo")) return "🥩";
    if (nomeLower.includes("frango")) return "🍗";
    if (nomeLower.includes("vegetariano")) return "🥗";
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

    let cardapio = `*${this.config.store.name.toUpperCase()}*\n\n`;
    const todasCategorias = Object.keys(agrupados);

    const categoriasConhecidas = ORDEM_CATEGORIAS_PREFERIDA.filter((c) => todasCategorias.includes(c));
    const categoriasDesconhecidas = todasCategorias.filter((c) => !ORDEM_CATEGORIAS_PREFERIDA.includes(c)).sort();

    const ordemCategorias = [...categoriasConhecidas, ...categoriasDesconhecidas];

    ordemCategorias.forEach((categoriaNome) => {
      if (agrupados[categoriaNome] && agrupados[categoriaNome].length > 0) {
        const emoji = this.getEmojiCategoria(categoriaNome);
        const nomeFormatado = CATEGORY_CONFIG[categoriaNome]?.name || categoriaNome;

        cardapio += `*${emoji} ${nomeFormatado.toUpperCase()}*\n`;

        agrupados[categoriaNome].forEach((item) => {
          const nomeItem = this.formatarNomeItem(item.name);
          const preco = this.formatarPreco(item.basePrice);
          cardapio += `• ${nomeItem} — R$ ${preco}\n`;
        });

        cardapio += "\n";
      }
    });

    return cardapio.trim();
  }

  async getMenu(): Promise<{ items: MenuItem[]; rendered: string }> {
    // Verifica cache
    if (this.cache && Date.now() - this.cache.lastFetch < CACHE_TTL) {
      return { items: this.cache.items, rendered: this.cache.formattedText };
    }

    try {
      logger.info(`Buscando menu em: ${this.config.menu.api_url}`);
      const response = await fetch(this.config.menu.api_url);

      if (!response.ok) {
        throw new Error(`Erro ao buscar menu: ${response.statusText}`);
      }

      const data = (await response.json()) as any; // Assumindo resposta direta ou array

      let items: MenuItem[] = [];
      if (Array.isArray(data)) {
        items = data;
      } else if (data.items && Array.isArray(data.items)) {
        items = data.items;
      }

      // Filtrar ativos
      items = items.filter((i) => i.active && i.showOnWebsite);

      if (items.length === 0) {
        logger.warn("Menu vazio ou nenhum item ativo encontrado.");
      }

      const rendered = this.formatMenuText(items);

      this.cache = {
        items,
        formattedText: rendered,
        lastFetch: Date.now()
      };

      return { items, rendered };
    } catch (error) {
      logger.error("Falha ao buscar menu", error);
      // Se falhar e tiver cache antigo, retorna ele mesmo expirado?
      if (this.cache) {
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
