/**
 * Processador local de mensagens (saudações e termos de conversa)
 */

/**
 * Verifica se a mensagem é uma saudação
 */
function isSaudacao(mensagemLower) {
  const texto = mensagemLower.trim();

  // Saudações diretas
  if (
    texto === "olá" ||
    texto === "ola" ||
    texto === "oi" ||
    texto === "oie" ||
    texto === "eai" ||
    texto === "e aí" ||
    texto === "eai" ||
    texto === "hey" ||
    texto === "hey!" ||
    texto === "bom dia" ||
    texto === "boa tarde" ||
    texto === "boa noite"
  ) {
    return true;
  }

  // Saudações com padrões
  const padroesSaudacao = [
    /^(oi|olá|ola|oie|hey)\s+(!|\?|$)/i,
    /^(e\s*a\s*í|e\s*ai|e\s*aí|eai)(\s+!|\s+\?|$)/i,
    /^(bom\s+dia|boa\s+tarde|boa\s+noite)(\s+!|\s+\?|$)/i
  ];

  return padroesSaudacao.some((padrao) => padrao.test(texto));
}

/**
 * Verifica se a mensagem é uma despedida/agradecimento
 */
function isDespedida(mensagemLower) {
  const texto = mensagemLower.trim();

  // Despedidas diretas
  if (
    texto === "tchau" ||
    texto === "tchau!" ||
    texto === "até logo" ||
    texto === "até mais" ||
    texto === "obrigado" ||
    texto === "obrigada" ||
    texto === "valeu" ||
    texto === "valeu!" ||
    texto === "vlw" ||
    texto === "obg" ||
    texto === "obrigado!" ||
    texto === "obrigada!"
  ) {
    return true;
  }

  // Despedidas com padrões
  const padroesDespedida = [
    /^(tchau|até\s+logo|até\s+mais|até\s+breve)(\s+!|\s+\?|$)/i,
    /^(obrigado|obrigada|valeu|vlw|obg)(\s+!|\s+\?|$)/i,
    /^(muito\s+obrigado|muito\s+obrigada)(\s+!|\s+\?|$)/i,
    /^(valeu\s+muito|vlw\s+muito)(\s+!|\s+\?|$)/i
  ];

  return padroesDespedida.some((padrao) => padrao.test(texto));
}

async function processarLocal(mensagem) {
  const mensagemLower = mensagem.toLowerCase();

  // Verificar saudações
  if (isSaudacao(mensagemLower)) {
    return (
      "Olá! 👋 Bem-vindo ao *Ponto do Lanche*!\n\n" +
      "Que bom ter você aqui! 😊\n\n" +
      "Estou aqui para te ajudar com:\n" +
      "🍔 Ver nosso cardápio completo\n" +
      "📝 Fazer seu pedido\n" +
      "💬 Tirar qualquer dúvida\n\n" +
      "O que você gostaria de ver hoje? 🍟🥤"
    );
  }

  // Verificar despedidas/agradecimentos
  if (isDespedida(mensagemLower)) {
    return "Obrigado pela preferência! 😊\n\n" + "Estamos à disposição sempre que precisar!\n\n" + "Tenha um ótimo dia! 🌟";
  }

  // Retorna null quando não há resposta específica do processamento local
  return null;
}

module.exports = processarLocal;
