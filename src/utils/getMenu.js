/**
 * Busca o cardápio da API e formata para o WhatsApp
 */

const axios = require("axios");
const MenuCache = require("./menuCache");

const API_MENU_URL = process.env.API_MENU_URL || "http://129.153.92.154/api/menu/items";
const menuCache = new MenuCache();

// Mapeamento de categorias para emojis e nomes formatados (opcional - usado para formatação especial)
const CATEGORY_CONFIG = {
  Hamburger: { emoji: "🍔", name: "Hambúrgueres" },
  Lombo: { emoji: "🥩", name: "Lombos" },
  Frango: { emoji: "🍗", name: "Sanduíches de Frango" },
  Vegetariano: { emoji: "🥗", name: "Vegetarianos" },
  Refrigerantes: { emoji: "🥤", name: "Refrigerantes" },
  Cervejas: { emoji: "🍺", name: "Cervejas" },
  "Sucos e cremes": { emoji: "🧃", name: "Sucos e Cremes" }
};

// Ordem preferencial para categorias conhecidas (outras aparecerão depois, em ordem alfabética)
const ORDEM_CATEGORIAS_PREFERIDA = ["Hamburger", "Lombo", "Frango", "Vegetariano", "Refrigerantes", "Cervejas", "Sucos e cremes"];

// Função para obter emoji baseado no nome da categoria
function obterEmojiCategoria(categoriaNome) {
  // Tenta encontrar no mapeamento
  if (CATEGORY_CONFIG[categoriaNome]) {
    return CATEGORY_CONFIG[categoriaNome].emoji;
  }

  // Emojis padrão baseados em palavras-chave
  const nomeLower = categoriaNome.toLowerCase();
  if (nomeLower.includes("refrigerante") || nomeLower.includes("bebida")) return "🥤";
  if (nomeLower.includes("cerveja") || nomeLower.includes("bebida alcoólica")) return "🍺";
  if (nomeLower.includes("suco") || nomeLower.includes("creme")) return "🧃";
  if (nomeLower.includes("hamburger") || nomeLower.includes("hambúrguer")) return "🍔";
  if (nomeLower.includes("lombo")) return "🥩";
  if (nomeLower.includes("frango")) return "🍗";
  if (nomeLower.includes("vegetariano")) return "🥗";

  // Emoji padrão genérico
  return "🔸";
}

// Função para obter nome formatado da categoria
function obterNomeFormatadoCategoria(categoriaNome) {
  if (CATEGORY_CONFIG[categoriaNome]) {
    return CATEGORY_CONFIG[categoriaNome].name;
  }
  return categoriaNome;
}

function formatarPreco(preco) {
  return preco.toFixed(2).replace(".", ",");
}

function formatarNomeItem(nome) {
  return nome
    .toLowerCase()
    .split(" ")
    .map((palavra) => palavra.charAt(0).toUpperCase() + palavra.slice(1))
    .join(" ");
}

function agruparPorCategoria(itens) {
  const agrupados = {};

  itens.forEach((item) => {
    const categoriaNome = item.category?.name || "Outros";

    if (!agrupados[categoriaNome]) {
      agrupados[categoriaNome] = [];
    }

    agrupados[categoriaNome].push(item);
  });

  return agrupados;
}

function formatarCardapio(itensPorCategoria) {
  let cardapio = "*PONTO DO LANCHE*\n\n";

  // Obter todas as categorias dinamicamente
  const todasCategorias = Object.keys(itensPorCategoria);

  // Separar categorias conhecidas (na ordem preferida) e desconhecidas
  const categoriasConhecidas = [];
  const categoriasDesconhecidas = [];

  ORDEM_CATEGORIAS_PREFERIDA.forEach((categoriaNome) => {
    if (todasCategorias.includes(categoriaNome)) {
      categoriasConhecidas.push(categoriaNome);
    }
  });

  // Adicionar categorias desconhecidas (não estão na ordem preferida)
  todasCategorias.forEach((categoriaNome) => {
    if (!ORDEM_CATEGORIAS_PREFERIDA.includes(categoriaNome)) {
      categoriasDesconhecidas.push(categoriaNome);
    }
  });

  // Ordenar categorias desconhecidas alfabeticamente
  categoriasDesconhecidas.sort();

  // Combinar: primeiro as conhecidas (na ordem preferida), depois as desconhecidas (alfabeticamente)
  const ordemCategorias = [...categoriasConhecidas, ...categoriasDesconhecidas];

  ordemCategorias.forEach((categoriaNome) => {
    if (itensPorCategoria[categoriaNome] && itensPorCategoria[categoriaNome].length > 0) {
      const emoji = obterEmojiCategoria(categoriaNome);
      const nomeFormatado = obterNomeFormatadoCategoria(categoriaNome);

      // Formatação bonita para WhatsApp:
      // Títulos em negrito e maiúsculas
      cardapio += `*${emoji} ${nomeFormatado.toUpperCase()}*\n`;

      itensPorCategoria[categoriaNome].forEach((item) => {
        const nomeItemFormatado = formatarNomeItem(item.name);
        const precoFormatado = formatarPreco(item.basePrice);
        // Itens com bullet point simples
        cardapio += `• ${nomeItemFormatado} — R$ ${precoFormatado}\n`;
      });

      cardapio += "\n";
    }
  });

  return cardapio.trim();
}

async function buscarItensDaAPI() {
  try {
    const response = await axios.get(API_MENU_URL, {
      timeout: 10000
    });

    const itens = response.data || [];

    if (!Array.isArray(itens)) {
      return null;
    }

    const itensFiltrados = itens.filter((item) => item.active === true && item.showOnWebsite === true);

    return itensFiltrados.length > 0 ? itensFiltrados : null;
  } catch (error) {
    return null;
  }
}

async function getMenu() {
  const cardapioCache = menuCache.getCardapioFormatado();
  if (cardapioCache) {
    return cardapioCache;
  }

  const itens = await buscarItensDaAPI();

  if (!itens || itens.length === 0) {
    return "📋 Cardápio temporariamente indisponível. Por favor, tente novamente mais tarde.";
  }

  const itensPorCategoria = agruparPorCategoria(itens);
  const cardapioFormatado = formatarCardapio(itensPorCategoria);

  menuCache.salvar(cardapioFormatado);

  return cardapioFormatado;
}

async function atualizarCardapio() {
  const itens = await buscarItensDaAPI();

  if (!itens || itens.length === 0) {
    return;
  }

  const itensPorCategoria = agruparPorCategoria(itens);
  const cardapioFormatado = formatarCardapio(itensPorCategoria);

  menuCache.salvar(cardapioFormatado);
}

module.exports = {
  getMenu,
  atualizarCardapio
};
