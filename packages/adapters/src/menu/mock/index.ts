// Mock da porta MenuSource — cardápio fixo, zero rede (Regra de Ouro 2).
import type { MenuItem, MenuSource, TenantRow } from "@sirvase/core";
import { MOCK_MENU_ITEMS } from "./fixtures.js";

export class MockMenuSource implements MenuSource {
  constructor(private items: MenuItem[] = MOCK_MENU_ITEMS) {}

  async getMenu(_tenant: TenantRow): Promise<MenuItem[]> {
    return this.items;
  }
}

export { MOCK_MENU_ITEMS } from "./fixtures.js";
