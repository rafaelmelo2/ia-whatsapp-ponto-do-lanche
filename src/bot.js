/**
 * Bot WhatsApp - Ponto do Lanche
 * Bot completo em Node.js usando whatsapp-web.js e Chutes.ai
 */

const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const path = require("path");
require("dotenv").config();

// Importar módulos locais
const ConversationManager = require("./managers/conversationManager");
const ChutesClient = require("./clients/chutesClient");
const carregarInstrucoes = require("./config/loadInstructions");
const processarLocal = require("./utils/localProcessor");
const { getMenu, atualizarCardapio } = require("./utils/getMenu");
const { verificarPedidoFinalizado, enviarPedidoParaGrupo } = require("./utils/orderNotifier");
const { extrairDadosOcultos } = require("./utils/jsonParser");

// Inicializar gerenciadores
const conversationManager = new ConversationManager();
const chutesClient = new ChutesClient();

// Armazenar o momento de início do bot (em segundos) para ignorar mensagens antigas
const BOT_START_TIME = Math.floor(Date.now() / 1000);

// Função para inicializar o cardápio ANTES do bot iniciar
async function inicializarCardapio() {
  try {
    console.log("🔄 Buscando cardápio atualizado na inicialização...");
    await atualizarCardapio();
    console.log("✅ Cardápio inicializado com sucesso!");
  } catch (error) {
    console.error("⚠️ Falha ao atualizar cardápio na inicialização:", error.message);
    // Silencioso - o cardápio será carregado quando necessário
  }
}

// Criar cliente WhatsApp
const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: path.join(__dirname, "./data/tokens")
  }),
  puppeteer: {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--no-first-run",
      "--disable-gpu"
    ],
    timeout: 60000 // 60 segundos de timeout
  },
  webVersionCache: {
    type: "remote",
    remotePath: "https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2413.51-beta.html"
  }
});

// QR Code
client.on("qr", (qr) => {
  console.log("\n" + "=".repeat(60));
  console.log("📱 QR CODE - ESCANEIE COM SEU WHATSAPP");
  console.log("=".repeat(60));
  qrcode.generate(qr, { small: true });
  console.log("=".repeat(60));
});

// Cliente pronto
client.on("ready", async () => {
  console.log("✅ WhatsApp conectado!");

  // Atualizar cardápio quando o WhatsApp estiver pronto
  try {
    await atualizarCardapio();
  } catch (error) {
    // Silencioso
  }

  // Schedule: atualizar cardápio a cada 10 minutos
  const INTERVALO_ATUALIZACAO = 10 * 60 * 1000; // 10 minutos em milissegundos

  setInterval(async () => {
    console.log("🔄 Atualizando cardápio (schedule)...");
    await atualizarCardapio();
  }, INTERVALO_ATUALIZACAO);
});

// Erro de autenticação
client.on("authenticated", () => {
  console.log("✅ Autenticação realizada com sucesso!");
});

// Erro de autenticação
client.on("auth_failure", (msg) => {
  console.error("❌ Erro de autenticação:", msg);
});

// Desconectado
client.on("disconnected", (reason) => {
  console.log("⚠️ Cliente desconectado:", reason);
});

// Mensagens recebidas
client.on("message", async (message) => {
  // Ignorar próprias mensagens
  if (message.fromMe) {
    return;
  }

  // Ignorar mensagens recebidas antes do bot iniciar
  if (message.timestamp && message.timestamp < BOT_START_TIME) {
    console.log(
      `⏳ Ignorando mensagem antiga de ${message.from.replace("@c.us", "")} (${new Date(
        message.timestamp * 1000
      ).toLocaleTimeString()}): ${message.body}`
    );
    return;
  }

  // Logar mensagens de grupos para mostrar o ID (mas não processar)
  if (message.from.includes("@g.us")) {
    const grupoId = message.from;
    const chat = await message.getChat();
    const nomeGrupo = chat.name || "Grupo sem nome";
    const nomeAutor = message.notifyName || message.pushName || "Desconhecido";
    const texto = message.body;

    console.log(`\n${"=".repeat(60)}`);
    console.log(`📱 MENSAGEM DE GRUPO DETECTADA`);
    console.log(`${"=".repeat(60)}`);
    console.log(`Nome do Grupo: ${nomeGrupo}`);
    console.log(`ID do Grupo: ${grupoId}`);
    console.log(`Autor: ${nomeAutor}`);
    console.log(`Mensagem: ${texto}`);
    console.log(`${"=".repeat(60)}\n`);
    console.log(`💡 Para receber pedidos neste grupo, adicione ao .env:`);
    console.log(`   WHATSAPP_GROUP_ID=${grupoId}\n`);
    return;
  }

  const numero = message.from.replace("@c.us", "").replace("@g.us", "");
  const nome = message.notifyName || message.pushName || numero;
  const texto = message.body;

  console.log(`📨 Mensagem recebida de ${nome} (${numero}): ${texto}`);

  try {
    // Verificar se existe conversa ativa (não expirada)
    // Por padrão, conversas expiram após 10 minutos de inatividade
    const CONVERSATION_TIMEOUT_MINUTES = process.env.CONVERSATION_TIMEOUT_MINUTES
      ? parseInt(process.env.CONVERSATION_TIMEOUT_MINUTES)
      : 5;

    let conversaAtiva = conversationManager.getActiveConversation(numero, CONVERSATION_TIMEOUT_MINUTES);
    let conversationId;

    if (!conversaAtiva) {
      // Criar nova conversa se não houver conversa ativa
      conversationId = conversationManager.createConversation(numero, nome);
    } else {
      // Continuar conversa existente
      conversationId = conversaAtiva.conversation_id;
    }

    // Marcar mensagem como lida
    try {
      await message.markAsRead();
    } catch (err) {
      // Ignorar erros ao marcar como lida
    }

    // Adicionar mensagem do usuário
    conversationManager.addMessage(conversationId, "user", texto);

    // Mostrar indicador de "digitando..." enquanto processa
    const chat = await message.getChat();
    let typingInterval;

    try {
      // Iniciar indicador de digitação (whatsapp-web.js usa sendStateTyping)
      await chat.sendStateTyping();

      // Manter o indicador ativo (renovar a cada 20 segundos, pois o WhatsApp desliga após 25s)
      typingInterval = setInterval(async () => {
        try {
          await chat.sendStateTyping();
        } catch (err) {
          // Ignorar erros
        }
      }, 20000);
    } catch (err) {
      // Ignorar erros
    }

    // Processar mensagem
    let resposta;

    // Primeiro tenta o processamento local (cardápio, olá, etc.)
    resposta = await processarLocal(texto);

    // Se não houver resposta local específica, usa o Chutes.ai (se configurado)
    if (!resposta && chutesClient.isConfigured()) {
      // Simular tempo de processamento humano (1-3 segundos)
      const tempoProcessamento = Math.random() * 2000 + 1000; // Entre 1 e 3 segundos
      await new Promise((resolve) => setTimeout(resolve, tempoProcessamento));

      const historico = conversationManager.getRecentMessages(conversationId, 10);
      const contexto = conversationManager.getContext(conversationId);
      const instrucoesAgente = carregarInstrucoes();

      resposta = await chutesClient.processarMensagem(texto, historico, contexto, instrucoesAgente);
    }

    // Processar resposta para extrair dados ocultos (JSON)
    let dadosOcultos = null;
    if (resposta) {
      const resultadoParser = extrairDadosOcultos(resposta);
      dadosOcultos = resultadoParser.dados;
      resposta = resultadoParser.mensagemLimpa;
    }

    // Fallback se nenhum processamento retornar resposta
    if (!resposta) {
      resposta =
        "Desculpe, para uma experiência completa, configure o Chutes.ai.\n\n" +
        "Por enquanto, posso te ajudar com:\n" +
        "  • Ver o cardápio (digite 'cardápio')\n" +
        "  • Fazer um pedido\n\n" +
        "Configure as variáveis de ambiente do Chutes.ai para respostas mais inteligentes!";
    }

    // Parar indicador de digitação
    if (typingInterval) {
      clearInterval(typingInterval);
    }

    try {
      await chat.clearState();
    } catch (err) {
      // Ignorar erros ao parar de digitar
    }

    // Simular tempo de "digitação" baseado no tamanho da resposta
    // Aproximadamente 30-50ms por caractere (velocidade humana de digitação)
    const tempoDigitacao = Math.min(resposta.length * 40, 4000); // Máximo 4 segundos
    await new Promise((resolve) => setTimeout(resolve, tempoDigitacao));

    // Adicionar resposta ao histórico
    conversationManager.addMessage(conversationId, "assistant", resposta);

    // Verificar se o pedido foi finalizado
    const contexto = conversationManager.getContext(conversationId);

    // Verifica se já estava finalizado antes desta interação
    const jaEstavaFinalizado = contexto.pedido_atual && contexto.pedido_atual.status === "finalizado";

    const resultadoVerificacao = verificarPedidoFinalizado(texto, resposta, contexto, dadosOcultos);

    // Só processa finalização se:
    // 1. Detectou finalização AGORA
    // 2. E (não estava finalizado antes OU tem novos dados estruturados explícitos - mas evita reenvio imediato se for só confirmação de texto)
    // Adicionamos proteção extra para não reenviar se já estiver finalizado há menos de 5 minutos
    const TEMPO_MINIMO_REENVIO = 5 * 60 * 1000; // 5 minutos
    const ultimoEnvioRecente =
      contexto.pedido_atual?.finalizado_em && new Date() - new Date(contexto.pedido_atual.finalizado_em) < TEMPO_MINIMO_REENVIO;

    if (resultadoVerificacao && resultadoVerificacao.finalizado && (!jaEstavaFinalizado || (dadosOcultos && !ultimoEnvioRecente))) {
      // Preparar atualização do contexto
      const atualizacaoContexto = {
        pedido_atual: {
          ...contexto.pedido_atual,
          status: "finalizado",
          finalizado_em: new Date().toISOString(),
          itens: resultadoVerificacao.itens,
          total: resultadoVerificacao.total
        }
      };

      // Atualizar preferências do cliente se vierem no JSON
      if (dadosOcultos) {
        if (!atualizacaoContexto.preferencias_cliente) {
          atualizacaoContexto.preferencias_cliente = { ...contexto.preferencias_cliente };
        }

        if (dadosOcultos.forma_pagamento) {
          atualizacaoContexto.preferencias_cliente.forma_pagamento_preferida = dadosOcultos.forma_pagamento;
        }

        // Se houver endereço no JSON, poderia ser atualizado aqui também
        // mas geralmente a IA não extrai endereço estruturado, deixa no texto
      }

      // Se detectou endereço no texto da resposta, atualiza nas preferências
      if (resultadoVerificacao.endereco_detectado) {
        if (!atualizacaoContexto.preferencias_cliente) {
          atualizacaoContexto.preferencias_cliente = { ...contexto.preferencias_cliente };
        }
        atualizacaoContexto.preferencias_cliente.endereco = resultadoVerificacao.endereco_detectado;
      }

      conversationManager.updateContext(conversationId, atualizacaoContexto);

      // Verificar se há grupo configurado para enviar pedidos
      const GROUP_ID = process.env.WHATSAPP_GROUP_ID || "";

      if (GROUP_ID) {
        // Buscar contexto atualizado após atualização
        const contextoAtualizado = conversationManager.getContext(conversationId);
        const nomeCliente = contextoAtualizado.preferencias_cliente?.nome || nome;
        const resumoTexto = resultadoVerificacao.resumoTexto || null;

        const enviado = await enviarPedidoParaGrupo(client, GROUP_ID, contextoAtualizado, nomeCliente, numero, resumoTexto);
        if (enviado) {
          console.log(`✅ Pedido finalizado e enviado para o grupo`);
        }
      }
    }

    // Enviar resposta
    await message.reply(resposta);
  } catch (error) {
    console.error("❌ Erro ao processar mensagem:", error);
    try {
      await message.reply("Desculpe, ocorreu um erro ao processar sua mensagem. Tente novamente.");
    } catch (err) {
      console.error("❌ Erro ao enviar mensagem de erro:", err);
    }
  }
});

// Inicializar cardápio ANTES de inicializar o cliente WhatsApp
inicializarCardapio()
  .then(() => {
    // Inicializar cliente após o cardápio estar pronto
    console.log("🚀 Inicializando cliente WhatsApp...");
    return client.initialize();
  })
  .catch((error) => {
    console.error("\n" + "=".repeat(60));
    console.error("❌ Erro ao inicializar cliente WhatsApp");
    console.error("=".repeat(60));
    console.error("Erro:", error.message || error);

    if (error.message && error.message.includes("Execution context was destroyed")) {
      console.error("\n🔧 Este erro geralmente acontece quando:");
      console.error("1. A sessão do WhatsApp foi corrompida");
      console.error("2. Há cache antigo do navegador");
      console.error("3. Problemas de conexão durante a inicialização");
      console.error("\n💡 Soluções:");
      console.error("1. Delete a pasta: data/tokens");
      console.error("2. Delete a pasta: .wwebjs_cache (se existir)");
      console.error("3. Verifique sua conexão com a internet");
      console.error("4. Tente executar novamente: npm start");
      console.error("5. Se persistir, tente executar em modo não-headless (altere headless: false temporariamente)");
    }

    console.error("=".repeat(60) + "\n");
    process.exit(1);
  });
