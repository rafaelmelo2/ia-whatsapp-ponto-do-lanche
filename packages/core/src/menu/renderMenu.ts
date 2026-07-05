// Formatação de cardápio pra WhatsApp — funções PURAS (sem I/O, sem cache).
// Buscar itens é papel da porta MenuSource (implementações em @sirvase/adapters);
// aqui só transforma MenuItem[] em texto. Extraído do antigo MenuService (que
// misturava fetch+cache+render e por isso saiu do core).
import type { MenuItem } from "./menuTypes.js";

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

const ORDEM_CATEGORIAS_PREFERIDA = [
  "Hamburger",
  "Lombo",
  "Frango",
  "Vegetariano",
  "Refrigerantes",
  "Cervejas",
  "Sucos e cremes"
];

function getEmojiCategoria(categoriaNome: string): string {
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

function formatarPreco(preco: number): string {
  return preco.toFixed(2).replace(".", ",");
}

function formatarNomeItem(nome: string): string {
  return nome
    .toLowerCase()
    .split(" ")
    .map((palavra) => palavra.charAt(0).toUpperCase() + palavra.slice(1))
    .join(" ");
}

/** Renderiza o cardápio em texto WhatsApp (negrito com *, categorias ordenadas, preços BR). */
export function renderMenu(storeName: string, items: MenuItem[]): string {
  const agrupados: Record<string, MenuItem[]> = {};

  items.forEach((item) => {
    const categoriaNome = item.category?.name || "Outros";
    if (!agrupados[categoriaNome]) {
      agrupados[categoriaNome] = [];
    }
    agrupados[categoriaNome].push(item);
  });

  let cardapio = `*${storeName.toUpperCase()}*\n\n`;
  const todasCategorias = Object.keys(agrupados);

  const categoriasConhecidas = ORDEM_CATEGORIAS_PREFERIDA.filter((c) => todasCategorias.includes(c));
  const categoriasDesconhecidas = todasCategorias.filter((c) => !ORDEM_CATEGORIAS_PREFERIDA.includes(c)).sort();

  const ordemCategorias = [...categoriasConhecidas, ...categoriasDesconhecidas];

  ordemCategorias.forEach((categoriaNome) => {
    if (agrupados[categoriaNome] && agrupados[categoriaNome].length > 0) {
      const emoji = getEmojiCategoria(categoriaNome);
      const nomeFormatado = CATEGORY_CONFIG[categoriaNome]?.name || categoriaNome;

      cardapio += `*${emoji} ${nomeFormatado.toUpperCase()}*\n`;

      agrupados[categoriaNome].forEach((item) => {
        const nomeItem = formatarNomeItem(item.name);
        const preco = formatarPreco(item.basePrice);
        cardapio += `• ${nomeItem} — R$ ${preco}\n`;
      });

      cardapio += "\n";
    }
  });

  return cardapio.trim();
}

/** Preço real de um item por nome (case-insensitive). `null` se não está no cardápio.
 *  Match por nome é herança da migração — preço por `item_id` chega no Épico 5 (P5.2). */
export function findItemPrice(items: MenuItem[], itemName: string): number | null {
  const item = items.find((i) => i.name.toLowerCase() === itemName.toLowerCase());
  return item ? item.basePrice : null;
}
