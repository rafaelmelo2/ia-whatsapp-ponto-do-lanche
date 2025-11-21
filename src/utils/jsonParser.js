/**
 * Utilitário para extrair e processar JSON oculto nas mensagens da IA
 */

/**
 * Extrai o bloco JSON oculto da mensagem e retorna os dados e a mensagem limpa
 * @param {string} mensagem - Mensagem completa vinda da IA
 * @returns {Object} - { dados: Object|null, mensagemLimpa: string }
 */
function extrairDadosOcultos(mensagem) {
  if (!mensagem) {
    return { dados: null, mensagemLimpa: "" };
  }

  // Procura por padrão <<<JSON ... >>> ou apenas <<< ... >>>
  // O flag 's' (dotAll) faz o ponto (.) corresponder a quebras de linha também
  const regexJson = /<<<JSON\s*([\s\S]*?)\s*>>>|<<<\s*([\s\S]*?)\s*>>>/i;
  const match = regexJson.exec(mensagem);

  if (!match) {
    return { dados: null, mensagemLimpa: mensagem };
  }

  // O conteúdo pode estar no grupo 1 ou 2 dependendo de qual parte do regex casou
  const jsonString = match[1] || match[2];
  let dados = null;

  try {
    // Tenta corrigir JSON inválido comum (vírgulas extras, etc) se falhar
    dados = JSON.parse(jsonString);
  } catch (error) {
    console.error("Erro ao fazer parse do JSON oculto:", error.message);
    // Tentar sanitização básica se necessário, mas geralmente a IA gera JSON válido
    // Se falhar, retorna null nos dados mas limpa a mensagem
  }

  // Remove o bloco JSON da mensagem original para o usuário não ver
  const mensagemLimpa = mensagem.replace(regexJson, "").trim();

  return { dados, mensagemLimpa };
}

module.exports = {
  extrairDadosOcultos
};
