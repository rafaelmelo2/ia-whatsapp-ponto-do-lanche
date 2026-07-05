// MenuSource real pra cardápio externo (cardapio_source = external): busca no
// catalog_api_url do tenant. Herda fetch+cache do antigo core/menu/menuService.ts
// (que saiu do core por fazer I/O). Cache keyed por tenant.id — Regra de Ouro 3.
import type { MenuItem, MenuSource, TenantRow } from "@sirvase/core";
import { logger } from "@sirvase/core";

interface CacheEntry {
  items: MenuItem[];
  fetchedAt: number;
}

const DEFAULT_TTL_MS = 1000 * 60 * 30; // 30 minutos

export class ExternalApiMenuSource implements MenuSource {
  private cache = new Map<string, CacheEntry>();

  constructor(private ttlMs: number = DEFAULT_TTL_MS) {}

  async getMenu(tenant: TenantRow): Promise<MenuItem[]> {
    const cached = this.cache.get(tenant.id);
    if (cached && Date.now() - cached.fetchedAt < this.ttlMs) {
      return cached.items;
    }

    const url = tenant.catalogApiUrl;
    if (!url) {
      throw new Error(`Tenant ${tenant.id} sem catalog_api_url — cardápio externo não configurado`);
    }

    try {
      logger.info("menu: buscando cardápio externo", { tenantId: tenant.id, url });
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Erro ao buscar menu: ${response.statusText}`);
      }

      const data: unknown = await response.json();
      let items: MenuItem[] = [];
      if (Array.isArray(data)) {
        items = data as MenuItem[];
      } else if (data && typeof data === "object" && Array.isArray((data as { items?: unknown }).items)) {
        items = (data as { items: MenuItem[] }).items;
      }

      items = items.filter((i) => i.active && i.showOnWebsite);
      if (items.length === 0) {
        logger.warn("menu: cardápio vazio ou nenhum item ativo", { tenantId: tenant.id });
      }

      this.cache.set(tenant.id, { items, fetchedAt: Date.now() });
      return items;
    } catch (error) {
      logger.error("menu: falha ao buscar cardápio externo", { tenantId: tenant.id, error });
      // Melhor cardápio vencido que atendimento parado.
      if (cached) return cached.items;
      throw error;
    }
  }
}
