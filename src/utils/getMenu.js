/**
 * Busca o cardápio da API e formata para o WhatsApp
 */

const axios = require("axios");
const MenuCache = require("./menuCache");

const API_MENU_URL = process.env.API_MENU_URL || "http://129.153.92.154/api/menu/items";
const menuCache = new MenuCache();

// Mapeamento de categorias para emojis e nomes formatados
const CATEGORY_CONFIG = {
  Hamburger: { emoji: "🍔", name: "Hambúrgueres" },
  Lombo: { emoji: "🥩", name: "Lombos" },
  Frango: { emoji: "🍗", name: "Sanduíches de Frango" },
  Vegetariano: { emoji: "🥗", name: "Vegetarianos" }
};

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

  const ordemCategorias = ["Hamburger", "Lombo", "Frango", "Vegetariano"];

  ordemCategorias.forEach((categoriaNome) => {
    if (itensPorCategoria[categoriaNome] && itensPorCategoria[categoriaNome].length > 0) {
      const config = CATEGORY_CONFIG[categoriaNome] || {
        emoji: "🔸",
        name: categoriaNome
      };

      // Formatação bonita para WhatsApp:
      // Títulos em negrito e maiúsculas
      cardapio += `*${config.emoji} ${config.name.toUpperCase()}*\n`;

      itensPorCategoria[categoriaNome].forEach((item) => {
        const nomeFormatado = formatarNomeItem(item.name);
        const precoFormatado = formatarPreco(item.basePrice);
        // Itens com bullet point simples
        cardapio += `• ${nomeFormatado} — R$ ${precoFormatado}\n`;
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
