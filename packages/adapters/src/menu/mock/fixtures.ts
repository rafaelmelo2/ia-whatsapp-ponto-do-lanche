// Cardápio fixo pro MockMenuSource (snapshot real do Ponto do Lanche, era
// core/menu/menu_data.ts — dado de mock não é domínio, então mora no adapter).
import type { MenuItem } from "@sirvase/core";

export const MOCK_MENU_ITEMS: MenuItem[] = [
  // Hambúrgueres
  {
    id: 1,
    name: "X-Tudo",
    basePrice: 30.0,
    active: true,
    showOnWebsite: true,
    category: { id: 1, name: "Hamburger" },
    description: "pão, hambúrguer, mussarela, ovo, bacon, milho, presunto, lombo, alface e tomate"
  },
  {
    id: 2,
    name: "X-Pitikão",
    basePrice: 28.0,
    active: true,
    showOnWebsite: true,
    category: { id: 1, name: "Hamburger" },
    description: "pão, hambúrguer, mussarela, ovo, bacon, milho, presunto, alface, tomate"
  },
  {
    id: 3,
    name: "X-Rango",
    basePrice: 27.0,
    active: true,
    showOnWebsite: true,
    category: { id: 1, name: "Hamburger" },
    description: "pão, hambúrguer, mussarela, ovo, bacon, presunto alface, tomate"
  },
  {
    id: 4,
    name: "X-Bacon Especial",
    basePrice: 26.0,
    active: true,
    showOnWebsite: true,
    category: { id: 1, name: "Hamburger" },
    description: "pão, hambúrguer, mussarela, bacon, ovo, alface e tomate"
  },
  {
    id: 5,
    name: "X-Bacon",
    basePrice: 25.0,
    active: true,
    showOnWebsite: true,
    category: { id: 1, name: "Hamburger" },
    description: "pão, hambúrguer, mussarela, bacon, alface e tomate"
  },
  {
    id: 6,
    name: "Da House",
    basePrice: 25.0,
    active: true,
    showOnWebsite: true,
    category: { id: 1, name: "Hamburger" },
    description: "pão, hambúrguer, mussarela, presunto, ovo, alface e tomate"
  },
  {
    id: 7,
    name: "X Salada Especial",
    basePrice: 24.0,
    active: true,
    showOnWebsite: true,
    category: { id: 1, name: "Hamburger" },
    description: "pão, hambúrguer, mussarela, ovo, alface e tomate"
  },
  {
    id: 8,
    name: "X Salada",
    basePrice: 23.0,
    active: true,
    showOnWebsite: true,
    category: { id: 1, name: "Hamburger" },
    description: "pão, hambúrguer, mussarela, alface e tomate"
  },
  {
    id: 9,
    name: "Americano",
    basePrice: 23.0,
    active: true,
    showOnWebsite: true,
    category: { id: 1, name: "Hamburger" },
    description: "pão, presunto, mussarela, ovo, alface e tomate"
  },
  {
    id: 10,
    name: "Bauru Muchulouco",
    basePrice: 22.0,
    active: true,
    showOnWebsite: true,
    category: { id: 1, name: "Hamburger" },
    description: "pão, presunto, mussarela, alface e tomate"
  },
  {
    id: 11,
    name: "X-Burguer",
    basePrice: 21.0,
    active: true,
    showOnWebsite: true,
    category: { id: 1, name: "Hamburger" },
    description: "pão, hambúrguer, presunto, mussarela"
  },
  {
    id: 12,
    name: "Misto Quente",
    basePrice: 19.0,
    active: true,
    showOnWebsite: true,
    category: { id: 1, name: "Hamburger" },
    description: "pão, presunto e mussarela"
  },

  // Lombo
  {
    id: 13,
    name: "Ultimo Tango",
    basePrice: 23.0,
    active: true,
    showOnWebsite: true,
    category: { id: 2, name: "Lombo" },
    description: "pão, lombo, mussarela, alface e tomate"
  },
  {
    id: 14,
    name: "Porquinho Pratico",
    basePrice: 21.5,
    active: true,
    showOnWebsite: true,
    category: { id: 2, name: "Lombo" },
    description: "pão, lombo e mussarela"
  },
  {
    id: 15,
    name: "Crazy Pig",
    basePrice: 23.5,
    active: true,
    showOnWebsite: true,
    category: { id: 2, name: "Lombo" },
    description: "pão, lombo, mussarela, ovo, alface e tomate"
  },
  {
    id: 16,
    name: "Valsa do Adeus",
    basePrice: 23.5,
    active: true,
    showOnWebsite: true,
    category: { id: 2, name: "Lombo" },
    description: "pão, lombo, mussarela, ovo e presunto"
  },

  // Frango
  {
    id: 17,
    name: "X-Salada com Frango",
    basePrice: 23.0,
    active: true,
    showOnWebsite: true,
    category: { id: 3, name: "Frango" },
    description: "pão, frango, mussarela, alface e tomate"
  },
  {
    id: 18,
    name: "X-Frango Especial",
    basePrice: 25.0,
    active: true,
    showOnWebsite: true,
    category: { id: 3, name: "Frango" },
    description: "pão, frango, bacon, mussarela, ovo, alface e tomate"
  },

  // Vegetariano
  {
    id: 19,
    name: "Vegetariano",
    basePrice: 24.0,
    active: true,
    showOnWebsite: true,
    category: { id: 4, name: "Vegetariano" },
    description: "pão, mussarela, ovo, batata-palha, milho, alface e tomate"
  },

  // Bebidas (Cervejas)
  { id: 55, name: "Kaiser", basePrice: 5.0, active: true, showOnWebsite: true, category: { id: 5, name: "Cervejas" } },
  { id: 56, name: "Antarctica 350ml", basePrice: 5.0, active: true, showOnWebsite: true, category: { id: 5, name: "Cervejas" } },
  { id: 57, name: "Skol 269ml", basePrice: 5.0, active: true, showOnWebsite: true, category: { id: 5, name: "Cervejas" } },
  {
    id: 58,
    name: "Heineken Long Neck 250ml",
    basePrice: 7.0,
    active: true,
    showOnWebsite: true,
    category: { id: 5, name: "Cervejas" }
  },
  {
    id: 59,
    name: "Heineken Long Neck 330ml",
    basePrice: 9.0,
    active: true,
    showOnWebsite: true,
    category: { id: 5, name: "Cervejas" }
  },

  // Bebidas (Refrigerantes)
  { id: 61, name: "Coca Cola 2L", basePrice: 12.0, active: true, showOnWebsite: true, category: { id: 6, name: "Refrigerantes" } },
  {
    id: 62,
    name: "Coca Cola 1,5L",
    basePrice: 10.0,
    active: true,
    showOnWebsite: true,
    category: { id: 6, name: "Refrigerantes" }
  },
  {
    id: 63,
    name: "Coca Cola 600ml",
    basePrice: 8.0,
    active: true,
    showOnWebsite: true,
    category: { id: 6, name: "Refrigerantes" }
  },
  { id: 65, name: "Coca Cola Lata", basePrice: 5.0, active: true, showOnWebsite: true, category: { id: 6, name: "Refrigerantes" } },
  {
    id: 69,
    name: "Guaraná Mineiro 1,5L",
    basePrice: 10.0,
    active: true,
    showOnWebsite: true,
    category: { id: 6, name: "Refrigerantes" }
  },
  {
    id: 72,
    name: "Agua Mineral sem gás",
    basePrice: 2.5,
    active: true,
    showOnWebsite: true,
    category: { id: 6, name: "Refrigerantes" }
  },

  // Sucos
  {
    id: 77,
    name: "Suco de Morango",
    basePrice: 10.0,
    active: true,
    showOnWebsite: true,
    category: { id: 7, name: "Sucos e cremes" }
  },
  {
    id: 79,
    name: "Suco de Laranja",
    basePrice: 13.0,
    active: true,
    showOnWebsite: true,
    category: { id: 7, name: "Sucos e cremes" }
  },
  {
    id: 82,
    name: "Creme de Morango",
    basePrice: 14.0,
    active: true,
    showOnWebsite: true,
    category: { id: 7, name: "Sucos e cremes" }
  }
];
