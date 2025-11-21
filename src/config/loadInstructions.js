/**
 * Carrega as instruções do agente com o cardápio atualizado
 */

const fs = require("fs");
const path = require("path");
const MenuCache = require("../utils/menuCache");

const INSTRUCOES_PATH = path.join(__dirname, "../config/instrucoes_agente.md");
const menuCache = new MenuCache();

function carregarInstrucoes() {
  try {
    let instrucoes = "";

    if (fs.existsSync(INSTRUCOES_PATH)) {
      instrucoes = fs.readFileSync(INSTRUCOES_PATH, "utf-8");
    }

    const cardapio = menuCache.getCardapioFormatado();

    if (cardapio) {
      const cardapioSection = `## 🍔 Cardápio\n\n${cardapio}\n\n**IMPORTANTE:**\n- O texto acima JÁ ESTÁ formatado para WhatsApp.\n- Se o cliente pedir o cardápio, copie o texto acima EXATAMENTE como está, caractere por caractere.\n- NÃO adicione '###' ou outros marcadores Markdown.\n- Use APENAS os nomes exatos e preços do cardápio acima.\n\n---\n`;

      const cardapioRegex = /## 🍔 Cardápio[\s\S]*?(?=\n---|\n## |$)/;

      if (cardapioRegex.test(instrucoes)) {
        instrucoes = instrucoes.replace(cardapioRegex, cardapioSection.trim());
      } else {
        const linhas = instrucoes.split("\n");
        const indiceCardapio = linhas.findIndex((linha) => linha.includes("## 🍔"));

        if (indiceCardapio !== -1) {
          let fimSecao = indiceCardapio + 1;
          while (fimSecao < linhas.length && !linhas[fimSecao].startsWith("##") && !linhas[fimSecao].startsWith("---")) {
            fimSecao++;
          }
          linhas.splice(indiceCardapio, fimSecao - indiceCardapio, ...cardapioSection.trim().split("\n"));
          instrucoes = linhas.join("\n");
        } else {
          const indiceFuncao = linhas.findIndex((linha) => linha.includes("## 🎯 Função Principal"));
          if (indiceFuncao !== -1) {
            let fimFuncao = indiceFuncao + 1;
            while (fimFuncao < linhas.length && !linhas[fimFuncao].startsWith("##")) {
              fimFuncao++;
            }
            linhas.splice(fimFuncao, 0, ...cardapioSection.trim().split("\n"));
            instrucoes = linhas.join("\n");
          }
        }
      }
    }

    return instrucoes;
  } catch (error) {
    console.error("Erro ao carregar instruções:", error);
    return "";
  }
}

module.exports = carregarInstrucoes;
