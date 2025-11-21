/**
 * Gerenciador de cache do cardápio
 */

const fs = require("fs");
const path = require("path");

class MenuCache {
  constructor(cachePath = "../data/menu") {
    // Usa path.resolve para resolver corretamente caminhos relativos com ../
    this.cachePath = path.resolve(__dirname, cachePath);
    this.cacheFile = path.join(this.cachePath, "cache.json");

    if (!fs.existsSync(this.cachePath)) {
      fs.mkdirSync(this.cachePath, { recursive: true });
    }
  }

  salvar(cardapioFormatado) {
    try {
      if (!cardapioFormatado || typeof cardapioFormatado !== "string" || cardapioFormatado.trim().length === 0) {
        return false;
      }

      if (!fs.existsSync(this.cachePath)) {
        fs.mkdirSync(this.cachePath, { recursive: true });
      }

      const cacheData = {
        cardapioFormatado: cardapioFormatado,
        dataAtualizacao: new Date().toISOString()
      };

      fs.writeFileSync(this.cacheFile, JSON.stringify(cacheData, null, 2), "utf-8");
      return fs.existsSync(this.cacheFile);
    } catch (error) {
      return false;
    }
  }

  getCardapioFormatado() {
    try {
      if (!fs.existsSync(this.cacheFile)) {
        return null;
      }

      const data = fs.readFileSync(this.cacheFile, "utf-8");
      const cacheData = JSON.parse(data);

      return cacheData.cardapioFormatado || null;
    } catch (error) {
      return null;
    }
  }
}

module.exports = MenuCache;
