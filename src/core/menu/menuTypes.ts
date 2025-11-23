export interface MenuCategory {
  id: number;
  name: string;
  // Adicione outros campos se necessário
}

export interface MenuItem {
  id: number;
  name: string;
  description?: string;
  basePrice: number;
  active: boolean;
  showOnWebsite: boolean;
  category: MenuCategory;
  // Adicione opções/modificadores se necessário
}

export interface MenuData {
  items: MenuItem[];
  timestamp: number;
}
