const axios = require("axios");

async function buscarItensDaAPI() {
  try {
    const response = await axios.get("http://129.153.92.154/api/menu/items", {
      timeout: 10000
    });

    const itens = response.data || [];

    if (!Array.isArray(itens)) {
      return null;
    }

    const itensFiltrados = itens.filter((item) => item.active === true && item.showOnWebsite === true);

    return itensFiltrados.length > 0 ? itensFiltrados : null;
  } catch (error) {
    console.error("Erro ao buscar cardápio da API:", error.message);
    return null;
  }
}

// Teste do endpoint
async function testarEndpoint() {
  console.log("🔍 Testando endpoint: http://129.153.92.154/api/menu/items");
  console.log("⏳ Aguarde...\n");

  try {
    const inicio = Date.now();
    const response = await axios.get("http://129.153.92.154/api/menu/items", {
      timeout: 10000
    });
    const tempoResposta = Date.now() - inicio;

    console.log("✅ SUCESSO! Endpoint está funcionando\n");
    console.log("📊 Informações da resposta:");
    console.log(`   Status: ${response.status} ${response.statusText}`);
    console.log(`   Tempo de resposta: ${tempoResposta}ms`);
    console.log(`   Tipo de dados: ${Array.isArray(response.data) ? "Array" : typeof response.data}`);

    if (Array.isArray(response.data)) {
      console.log(`   Total de itens: ${response.data.length}`);

      const itensAtivos = response.data.filter((item) => item.active === true && item.showOnWebsite === true);
      console.log(`   Itens ativos e visíveis: ${itensAtivos.length}`);

      if (itensAtivos.length > 0) {
        console.log("\n📋 Primeiros itens filtrados:");
        itensAtivos.slice(0, 3).forEach((item, index) => {
          console.log(`   ${index + 1}. ${item.name || item.title || "Sem nome"} (ID: ${item.id || "N/A"})`);
        });
      }
    }

    console.log("\n📦 Dados completos (primeiros 500 caracteres):");
    console.log(JSON.stringify(response.data, null, 2).substring(0, 500) + "...");

    // Testar a função buscarItensDaAPI
    console.log("\n\n🧪 Testando função buscarItensDaAPI():");
    const resultado = await buscarItensDaAPI();
    if (resultado) {
      console.log(`✅ Função retornou ${resultado.length} itens filtrados`);
    } else {
      console.log("⚠️  Função retornou null (nenhum item ativo encontrado)");
    }
  } catch (error) {
    console.log("❌ ERRO! Endpoint não está funcionando\n");
    console.log("📋 Detalhes do erro:");
    console.log(`   Mensagem: ${error.message}`);

    if (error.response) {
      console.log(`   Status: ${error.response.status} ${error.response.statusText}`);
      console.log(`   Dados: ${JSON.stringify(error.response.data).substring(0, 200)}`);
    } else if (error.request) {
      console.log("   Erro: Nenhuma resposta recebida do servidor");
      console.log("   Possíveis causas: Servidor offline, timeout, ou problema de rede");
    } else {
      console.log(`   Erro de configuração: ${error.message}`);
    }

    if (error.code === "ECONNABORTED") {
      console.log("\n⏱️  Timeout: A requisição demorou mais de 10 segundos");
    } else if (error.code === "ENOTFOUND" || error.code === "ECONNREFUSED") {
      console.log("\n🌐 Erro de conexão: Não foi possível conectar ao servidor");
    }
  }
}

// Executar o teste
testarEndpoint();
