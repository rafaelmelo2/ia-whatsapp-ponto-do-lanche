// Porta de fonte de cardápio. Implementações em @sirvase/adapters:
// external-api (fetch do catalog_api_url do tenant), internal-crud (menu_items
// no Postgres, quando cardapio_source = internal) e mock (fixo, sem rede).
// Formatação pra WhatsApp NÃO é papel da fonte — é `renderMenu` (core/menu), puro.
import type { MenuItem } from "../menu/menuTypes.js";
import type { TenantRow } from "./repositories.js";

export interface MenuSource {
  /** Itens ativos do cardápio do tenant. Cache (se houver) é keyed por tenant.id — Regra de Ouro 3. */
  getMenu(tenant: TenantRow): Promise<MenuItem[]>;
}
