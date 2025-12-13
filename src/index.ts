import "dotenv/config";
import { loadConfig } from "./core/config/loadConfig.js";
import { PromptGuard } from "./core/llm/guard.js";
import { LangchainModel } from "./core/llm/langchainModel.js";
import { PromptBuilder } from "./core/llm/promptBuilder.js";
import { MenuService } from "./core/menu/menuService.js";
import { ConversationManager } from "./core/orders/orderState.js";
import { createClientLogger } from "./core/utils/logger.js";
import { BaileysProvider } from "./core/whatsapp/baileys.js";
import { GroupCommandManager } from "./core/whatsapp/groupCommandManager.js";
import { WorkflowContext } from "./core/workflows/base/types.js";
import { WorkflowAgent } from "./core/workflows/base/workflowAgent.js";
import { getWorkflowHandler } from "./core/workflows/factory.js";
import { startServer } from "./server.js";

// ID do cliente (obrigatório via env var)
const CLIENT_ID: string = process.env.CLIENT_ID as string;
if (!CLIENT_ID) {
  console.error("❌ ERRO: CLIENT_ID não definido na variável de ambiente!");
  process.exit(1);
}

// Helper para normalizar nome de variável de ambiente baseado no CLIENT_ID
function getEnvVarName(baseName: string, clientId: string): string {
  // Converte clientId para formato UPPER_SNAKE_CASE
  const clientIdUpper = clientId.toUpperCase().replace(/-/g, "_");
  return `${clientIdUpper}_${baseName}`;
}

async function main() {
  try {
    const port = Number(process.env.PORT) || 3000;
    startServer(port, CLIENT_ID);

    // Criar logger específico do cliente
    const clientLogger = createClientLogger(CLIENT_ID);

    // 1. Config
    const config = loadConfig(CLIENT_ID);

    // 1. Config logger
    clientLogger.info(`=${"=".repeat(50)}`);
    clientLogger.info(` ✨ Iniciando bot para cliente: ${CLIENT_ID} MODEL: ${process.env.LLM_MODEL_OVERRIDE || config.llm.model}`);
    clientLogger.info(`=${"=".repeat(50)}`);

    // 2. Services (todos recebem clientId agora)
    const menuService = new MenuService(config, CLIENT_ID);
    const promptBuilder = new PromptBuilder();
    const llm = new LangchainModel(config);
    const guard = new PromptGuard();
    const conversationManager = new ConversationManager(CLIENT_ID);
    const whatsapp = new BaileysProvider(CLIENT_ID);

    // Workflow Handler Factory (usa o modelo Langchain)
    const workflowHandler = getWorkflowHandler(config, CLIENT_ID, llm.getModel());
    clientLogger.info(`Workflow ativo: ${config.workflow?.type || "commerce"}`);

    // Cria o agente com ferramentas do workflow
    let workflowAgent: WorkflowAgent | null = null;

    // 2.5. Configurar sistema de comandos de grupo
    // Ajustado para COMMANDS (plural) conforme docker-compose
    const commandGroupId = process.env[getEnvVarName("COMMANDS_GROUP_ID", CLIENT_ID)] || null;
    const adminPhonesStr = process.env[getEnvVarName("ADMIN_PHONES", CLIENT_ID)] || "";
    const adminPhones = adminPhonesStr
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);

    const commandManager = new GroupCommandManager(commandGroupId, adminPhones);

    if (commandGroupId) {
      clientLogger.info(`Grupo de comandos configurado: ${commandGroupId}`);
      clientLogger.info(`Admins autorizados: ${adminPhones.length} número(s)`);
    } else {
      clientLogger.warn(`Grupo de comandos não configurado (${getEnvVarName("COMMANDS_GROUP_ID", CLIENT_ID)})`);
    }

    // 2.6. Handler para comandos de grupo
    whatsapp.onGroupCommand(commandGroupId, async (msg) => {
      // Em grupos, usa participant (remetente real), senão usa from
      const senderPhone = msg.participant || msg.from;
      const command = commandManager.parseCommand(msg.body, msg.from, senderPhone);

      if (!command) {
        return; // Não é um comando válido ou não autorizado
      }

      clientLogger.info(
        `Comando recebido: ${command.type}${command.targetPhone ? ` para ${command.targetPhone.split("@")[0]}` : ""}`
      );

      let response = "";

      switch (command.type) {
        case "start":
          if (command.targetPhone) {
            commandManager.resumeNumber(command.targetPhone);
            response = `✅ Bot retomado para ${command.targetPhone.split("@")[0]}`;
          } else {
            response = `✅ Bot iniciado. Use /stop <número> ou /<número> para pausar atendimento automático.`;
          }
          break;

        case "stop":
        case "pause":
          if (command.targetPhone) {
            commandManager.pauseNumber(command.targetPhone);
            response = `⏸️ Bot pausado para ${
              command.targetPhone.split("@")[0]
            }. Agora você pode assumir o atendimento manualmente.`;
          } else {
            response = `❌ Por favor, informe o número: /stop <número> ou /<número>`;
          }
          break;

        case "resume":
          if (command.targetPhone) {
            commandManager.resumeNumber(command.targetPhone);
            response = `▶️ Bot retomado para ${command.targetPhone.split("@")[0]}`;
          } else {
            response = `❌ Por favor, informe o número: /resume <número>`;
          }
          break;

        case "status":
          const pausedNumbers = commandManager.getAllPausedNumbers();
          if (pausedNumbers.length === 0) {
            response = `✅ Bot ativo. Nenhum número pausado no momento.`;
          } else {
            response = `⏸️ Bot pausado para ${pausedNumbers.length} número(s):\n${pausedNumbers
              .map((p) => `- ${p.split("@")[0]}`)
              .join("\n")}`;
          }
          break;
      }

      if (response) {
        await whatsapp.sendText(msg.from, response);
      }
    });

    // 3. Handler de Mensagens
    whatsapp.onMessage(async (msg) => {
      // Verifica se o número está pausado (modo manual)
      if (commandManager.isPaused(msg.from)) {
        clientLogger.info(`Mensagem de ${msg.from.split("@")[0]} ignorada (modo manual ativo)`);
        return; // Não responde automaticamente
      }

      // Log da mensagem (incluindo informação de imagem)
      if (msg.hasImage) {
        clientLogger.info(`Msg de ${msg.from}: [IMAGEM] ${msg.body || "(sem legenda)"} - ID: ${msg.imageMessageId}`);
      } else {
        clientLogger.info(`Msg de ${msg.from}: ${msg.body}`);
      }

      // Marca mensagem como lida (azul)
      if (msg.messageId) {
        await whatsapp.markAsRead(msg.from, msg.messageId);
      }

      // Prepara o body da mensagem para incluir informação de imagem
      let messageBody = msg.body;
      if (msg.hasImage && msg.imageMessageId) {
        // Adiciona informação sobre a imagem no body para o agente processar
        messageBody = `[IMAGEM_ENVIADA:${msg.imageMessageId}] ${msg.body || "Cliente enviou uma foto"}`;
      }

      // Validação da mensagem do usuário ANTES de processar (bloqueia prompt injection)
      const userValidation = guard.validateUserMessage(messageBody);
      if (!userValidation.isValid) {
        clientLogger.warn(`Guard: Bloqueou mensagem do usuário: ${userValidation.reason}`);
        await whatsapp.sendText(msg.from, "Desculpe, não posso processar essa mensagem. Como posso ajudar com seu pedido? 😊");
        return; // Bloqueia completamente - não envia para o LLM
      }

      // Mostra "digitando..."
      await whatsapp.startTyping(msg.from);

      try {
        // A. Carrega estado e Menu
        const state = await conversationManager.addMessage(msg.from, "user", messageBody);
        const menu = await menuService.getMenu();

        // B. Monta Prompt base (sem instruções JSON, pois usamos ferramentas agora)
        const systemPrompt = promptBuilder.build(config, menu.rendered, "");

        // C. Cria ou reutiliza o agente com ferramentas
        // Prepara mapa de mensagens raw adicionais se houver agrupamento
        const additionalRawMessages: Record<string, any> = {};
        if (msg.mergedMessages) {
          msg.mergedMessages.forEach((m) => {
            if (m.imageMessageId && m.rawMessage) {
              additionalRawMessages[m.imageMessageId] = m.rawMessage;
            }
          });
        }

        // Atualiza o contexto com a mensagem atual para passar rawMessage para tools
        const workflowContext: WorkflowContext = {
          clientId: CLIENT_ID,
          phone: msg.from,
          config,
          logger: clientLogger,
          whatsapp,
          currentMessage: msg.rawMessage, // Passa mensagem raw principal
          additionalRawMessages // Passa mapa de rawMessages adicionais
        };

        // Sempre recria as tools para ter o contexto atualizado (especialmente currentMessage)
        const workflowTools = workflowHandler.getTools(workflowContext);
        const langchainTools = workflowTools.getTools();

        if (!workflowAgent) {
          workflowAgent = new WorkflowAgent(config, llm.getModel(), langchainTools, systemPrompt);
          clientLogger.info(`Agente criado com ${langchainTools.length} ferramentas`);
        } else {
          // Atualiza as tools do agente com o novo contexto
          workflowAgent = new WorkflowAgent(config, llm.getModel(), langchainTools, systemPrompt);
          clientLogger.debug(`Agente atualizado com ${langchainTools.length} ferramentas (contexto atualizado)`);
        }

        // D. Gera Resposta usando o Agente (que decide quando usar ferramentas)
        clientLogger.info(`Gerando resposta com agente Langchain...`);
        const history = state.history.map((m) => ({ role: m.role, content: m.content }));

        // Recebe objeto { content, thought }
        const agentResponse = await workflowAgent.invoke(messageBody, history);
        const answer = agentResponse.content;
        const thought = agentResponse.thought;

        // E. Validação da Resposta do LLM (Guard)
        const validation = guard.validateLLMResponse(answer);
        if (!validation.isValid) {
          clientLogger.warn(`Resposta inválida do LLM: ${validation.reason}`);

          // Tenta corrigir problemas de formatação simples
          if (validation.reason?.includes("headers Markdown")) {
            const corrected = answer.replace(/^#+\s/gm, "* ");
            clientLogger.info("Guard: Tentou corrigir headers Markdown automaticamente");
            await whatsapp.stopTyping(msg.from);
            await whatsapp.sendText(msg.from, corrected);
            await conversationManager.addMessage(msg.from, "assistant", corrected);
            return;
          } else {
            // Para outros problemas, não envia a resposta
            await whatsapp.stopTyping(msg.from);
            await whatsapp.sendText(msg.from, "Desculpe, tive um problema ao processar sua mensagem. Pode repetir, por favor? 😊");
            return;
          }
        }

        // F. Envia Resposta
        if (answer.trim()) {
          await whatsapp.stopTyping(msg.from);
          await whatsapp.sendText(msg.from, answer);

          // Salva com o thought separado
          await conversationManager.addMessage(msg.from, "assistant", answer, thought);
        } else {
          await whatsapp.stopTyping(msg.from);
        }
      } catch (err) {
        clientLogger.error("Erro no processamento da mensagem", err);
        await whatsapp.stopTyping(msg.from);
        await whatsapp.sendText(msg.from, "Desculpe, tive um erro interno. Tente novamente.");
      }
    });

    // 4. Start
    await whatsapp.initialize();

    // Opcional: Servidor HTTP para healthcheck ou webhook
    // import app from './server';
    // app.listen(3000...);
  } catch (e) {
    console.error("Fatal error no startup:", e);
    process.exit(1);
  }
}

main();
