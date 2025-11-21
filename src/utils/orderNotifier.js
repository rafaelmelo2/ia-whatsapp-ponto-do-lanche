/**
 * Utilitário para notificar pedidos finalizados em grupo do WhatsApp
 */

/**
 * Detecta se um pedido foi finalizado baseado nas mensagens do usuário e assistente
 * @param {string} mensagemUsuario - Mensagem do cliente
 * @param {string} respostaAssistente - Resposta do assistente (já limpa, sem JSON)
 * @param {Object} contexto - Contexto da conversa
 * @param {Object} dadosOcultos - Dados extraídos do JSON oculto (opcional)
 * @returns {Object|boolean} - Objeto com dados do pedido se finalizado, ou false
 */
function verificarPedidoFinalizado(mensagemUsuario, respostaAssistente, contexto, dadosOcultos = null) {
  // PRIORIDADE 1: Dados estruturados do JSON oculto
  // Se a IA gerou o bloco <<<JSON...>>>, confiamos nele 100%
  if (dadosOcultos && dadosOcultos.itens && dadosOcultos.itens.length > 0) {
    return {
      finalizado: true,
      itens: dadosOcultos.itens,
      total: dadosOcultos.total || 0,
      resumoTexto: respostaAssistente,
      forma_pagamento: dadosOcultos.forma_pagamento,
      tipo_entrega: dadosOcultos.tipo_entrega
    };
  }

  // PRIORIDADE 2 (Fallback): Verificação manual por palavras-chave
  // Só entra aqui se a IA falhou em gerar o JSON

  const mensagemLower = mensagemUsuario.toLowerCase().trim();
  const respostaLower = respostaAssistente.toLowerCase();

  // Palavras-chave que indicam confirmação do cliente
  const palavrasConfirmacao = [
    "confirmo",
    "confirmar",
    "pode anotar",
    "pode fechar",
    "finalizar",
    "finalizado",
    "feche o pedido",
    "fechar pedido",
    "só isso",
    "so isso",
    "pode mandar",
    "pode enviar",
    "tudo certo",
    "fechado"
  ];

  const clienteConfirmou = palavrasConfirmacao.some((palavra) => {
    return mensagemLower === palavra || mensagemLower.startsWith(palavra + " ");
  });

  const assistenteConfirmouPedido =
    // Frases afirmativas de conclusão
    (respostaLower.includes("pedido confirmado") ||
      respostaLower.includes("pedido anotado") ||
      respostaLower.includes("pedido fechado") ||
      respostaLower.includes("seu pedido foi registrado") ||
      respostaLower.includes("pedido registrado") ||
      respostaLower.includes("enviando seu pedido")) &&
    // E NÃO termina com pergunta (evita detectar resumo antes da confirmação final)
    !respostaLower.trim().endsWith("?");

  // Se qualquer um confirmar, consideramos finalizado
  if (clienteConfirmou || assistenteConfirmouPedido) {
    // Tenta recuperar itens que podem estar salvos no contexto
    const itensPedido =
      contexto.pedido_atual && contexto.pedido_atual.itens && contexto.pedido_atual.itens.length > 0
        ? contexto.pedido_atual.itens
        : null;

    // Se não tem itens no contexto nem no JSON, mas foi confirmado,
    // usamos o texto inteiro como "resumo" para não perder o pedido

    let total = 0;
    if (contexto.pedido_atual && contexto.pedido_atual.total > 0) {
      total = contexto.pedido_atual.total;
    } else {
      // Tenta extrair apenas o total simples do texto
      const regexTotal = /Total(?:\s*Parcial)?\s*[:=]\s*R\$\s*([\d,.]+)/i;
      const matchTotal = regexTotal.exec(respostaAssistente);
      if (matchTotal) {
        total = parseFloat(matchTotal[1].replace(/\./g, "").replace(",", "."));
      }
    }

    // Tentar extrair endereço da resposta do assistente
    let enderecoDetectado = null;
    const linhas = respostaAssistente.split("\n");
    for (const linha of linhas) {
      // Procura linhas como "Endereço: Rua X..." ou "Entrega: Av Y..."
      if (
        (linha.toLowerCase().includes("endereço:") || linha.toLowerCase().includes("entrega:")) &&
        linha.length > 15 // Evita pegar apenas o título "Endereço:"
      ) {
        const partes = linha.split(":");
        if (partes.length > 1) {
          // Remove emojis comuns e limpa espaços
          enderecoDetectado = partes[1].replace(/[\u{1F300}-\u{1F9FF}]/gu, "").trim();
          break;
        }
      }
    }

    return {
      finalizado: true,
      itens: itensPedido,
      resumoTexto: respostaAssistente,
      total: total,
      endereco_detectado: enderecoDetectado
    };
  }

  return false;
}

/**
 * Formata uma mensagem bonita do pedido para enviar ao grupo
 * @param {Object} contexto - Contexto da conversa
 * @param {string} nomeCliente - Nome do cliente
 * @param {string} telefoneCliente - Telefone do cliente
 * @param {string} resumoTexto - Texto completo da resposta do assistente (opcional)
 * @returns {string} - Mensagem formatada
 */
function formatarMensagemPedido(contexto, nomeCliente, telefoneCliente, resumoTexto = null) {
  const pedido = contexto.pedido_atual || {};
  const preferencias = contexto.preferencias_cliente || {};

  // Formatar data e hora
  const agora = new Date();
  const dataHora = agora.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });

  let mensagem = `*📦 NOVO PEDIDO - ${dataHora}*\n\n`;

  // Informações do cliente
  mensagem += `*👤 CLIENTE:*\n`;
  mensagem += `Nome: ${nomeCliente || "Não informado"}\n`;
  mensagem += `Telefone: ${telefoneCliente || "Não informado"}\n`;

  if (preferencias.endereco) {
    mensagem += `Endereço: ${preferencias.endereco}\n`;
  }

  if (preferencias.forma_pagamento_preferida) {
    mensagem += `Forma de pagamento: ${preferencias.forma_pagamento_preferida}\n`;
  }

  mensagem += `\n*🍔 PEDIDO:*\n`;

  // Se tiver itens estruturados no contexto, usa eles
  if (pedido.itens && Array.isArray(pedido.itens) && pedido.itens.length > 0) {
    pedido.itens.forEach((item, index) => {
      if (typeof item === "string") {
        mensagem += `${index + 1}. ${item}\n`;
      } else if (item.nome) {
        const quantidade = item.quantidade || 1;
        const preco = item.preco ? ` - R$ ${parseFloat(item.preco).toFixed(2)}` : "";
        const obs = item.observacao ? ` (${item.observacao})` : "";
        mensagem += `${index + 1}. ${quantidade}x ${item.nome}${obs}${preco}\n`;
      }
    });
  } else if (resumoTexto) {
    // Se não tiver itens estruturados, usa o texto completo da resposta da IA
    // Limpa o texto removendo saudações e mantém apenas a parte do pedido
    let textoLimpo = resumoTexto.trim();

    // Tenta limpar saudações comuns para deixar só o corpo do pedido
    textoLimpo = textoLimpo.replace(/^(olá|oi|perfeito|ótimo|entendido|confirmado).*?[\n\r]+/im, "");

    // Limita o tamanho se for muito grande
    if (textoLimpo.length > 800) {
      textoLimpo = textoLimpo.substring(0, 800) + "...";
    }

    mensagem += `${textoLimpo}\n`;
  } else {
    mensagem += `(Detalhes do pedido não disponíveis)\n`;
  }

  // Observações globais do pedido
  if (pedido.observacoes) {
    mensagem += `\n*📝 Observações Gerais:*\n${pedido.observacoes}\n`;
  }

  // Total
  if (pedido.total && pedido.total > 0) {
    mensagem += `\n*💰 TOTAL: R$ ${parseFloat(pedido.total).toFixed(2)}*\n`;
  } else if (pedido.total === 0 || !pedido.total) {
    mensagem += `\n*💰 TOTAL: (A calcular)*\n`;
  }

  mensagem += `\n━━━━━━━━━━━━━━━━━━━━\n`;
  mensagem += `⚠️ Verifique os detalhes completos na conversa com o cliente`;

  return mensagem;
}

/**
 * Envia notificação de pedido finalizado para um grupo do WhatsApp
 * @param {Object} whatsappClient - Cliente do WhatsApp (whatsapp-web.js)
 * @param {string} groupId - ID do grupo (formato: 5511999999999-1234567890@g.us)
 * @param {Object} contexto - Contexto da conversa
 * @param {string} nomeCliente - Nome do cliente
 * @param {string} telefoneCliente - Telefone do cliente
 * @param {string} resumoTexto - Texto completo da resposta do assistente (opcional)
 * @returns {Promise<boolean>} - true se enviado com sucesso
 */
async function enviarPedidoParaGrupo(whatsappClient, groupId, contexto, nomeCliente, telefoneCliente, resumoTexto = null) {
  if (!whatsappClient || !groupId) {
    return false;
  }

  try {
    const mensagemPedido = formatarMensagemPedido(contexto, nomeCliente, telefoneCliente, resumoTexto);
    await whatsappClient.sendMessage(groupId, mensagemPedido);
    return true;
  } catch (error) {
    console.error(`❌ Erro ao enviar pedido para o grupo: ${error.message}`);
    return false;
  }
}

module.exports = {
  verificarPedidoFinalizado,
  formatarMensagemPedido,
  enviarPedidoParaGrupo
};
