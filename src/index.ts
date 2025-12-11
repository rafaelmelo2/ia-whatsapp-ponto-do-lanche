import "dotenv/config";
import { loadConfig } from "./core/config/loadConfig.js";
import { PromptGuard } from "./core/llm/guard.js";
import { LLMModel } from "./core/llm/model.js";
import { PromptBuilder } from "./core/llm/promptBuilder.js";
import { MenuService } from "./core/menu/menuService.js";
import { OrderParser } from "./core/orders/orderParser.js";
import { OrderRepository } from "./core/orders/orderRepo.js";
import { ConversationManager } from "./core/orders/orderState.js";
import { Order } from "./core/orders/orderTypes.js";
import { createClientLogger } from "./core/utils/logger.js";
import { BaileysProvider } from "./core/whatsapp/baileys.js";
import { GroupCommandManager } from "./core/whatsapp/groupCommandManager.js";
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
    clientLogger.info(`Iniciando bot para cliente: ${CLIENT_ID}`);

    // 1. Config
    const config = loadConfig(CLIENT_ID);

    // 2. Services (todos recebem clientId agora)
    const menuService = new MenuService(config, CLIENT_ID);
    const promptBuilder = new PromptBuilder();
    const llm = new LLMModel(config);
    const guard = new PromptGuard();
    const parser = new OrderParser();
    const orderRepo = new OrderRepository(CLIENT_ID);
    const conversationManager = new ConversationManager(CLIENT_ID);
    const whatsapp = new BaileysProvider(CLIENT_ID);

    // 2.5. Configurar sistema de comandos de grupo
    const commandGroupId = process.env[getEnvVarName("COMMAND_GROUP_ID", CLIENT_ID)] || null;
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
      clientLogger.warn(`Grupo de comandos não configurado (${getEnvVarName("COMMAND_GROUP_ID", CLIENT_ID)})`);
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

      clientLogger.info(`Msg de ${msg.from}: ${msg.body}`);

      // Marca mensagem como lida (azul)
      if (msg.messageId) {
        await whatsapp.markAsRead(msg.from, msg.messageId);
      }

      // Validação da mensagem do usuário ANTES de processar (bloqueia prompt injection)
      const userValidation = guard.validateUserMessage(msg.body);
      if (!userValidation.isValid) {
        clientLogger.warn(`Guard: Bloqueou mensagem do usuário: ${userValidation.reason}`);
        await whatsapp.sendText(msg.from, "Desculpe, não posso processar essa mensagem. Como posso ajudar com seu pedido? 😊");
        return; // Bloqueia completamente - não envia para o LLM
      }

      // Mostra "digitando..."
      await whatsapp.startTyping(msg.from);

      try {
        // A. Carrega estado e Menu
        const state = await conversationManager.addMessage(msg.from, "user", msg.body);
        const menu = await menuService.getMenu();

        // B. Monta Prompt
        // Injetamos histórico recente (ex: últimas 10 trocas)
        const history = state.history.map((m) => ({ role: m.role, content: m.content }));
        const systemPrompt = promptBuilder.build(config, menu.rendered);

        // C. Gera Resposta LLM
        clientLogger.info(`Gerando resposta LLM...`);
        const llmResponse = await llm.generate(systemPrompt, history);
        let answer = llmResponse.content;

        // D. Validação da Resposta do LLM (Guard)
        const validation = guard.validateLLMResponse(answer);
        if (!validation.isValid) {
          clientLogger.warn(`Resposta inválida do LLM: ${validation.reason}`);

          // Tenta corrigir problemas de formatação simples
          if (validation.reason?.includes("headers Markdown")) {
            answer = answer.replace(/^#+\s/gm, "* "); // Remove headers markdown
            clientLogger.info("Guard: Tentou corrigir headers Markdown automaticamente");
          } else {
            // Para outros problemas (JSON quebrado, muito longo, etc), não envia a resposta
            await whatsapp.stopTyping(msg.from);
            await whatsapp.sendText(msg.from, "Desculpe, tive um problema ao processar sua mensagem. Pode repetir, por favor? 😊");
            return; // Não envia resposta inválida
          }
        }

        // E. Extração de Pedido (JSON Oculto)
        const orderExtraction = parser.extract(answer);
        let finalMessage = parser.cleanResponse(answer);

        if (orderExtraction) {
          clientLogger.info("Pedido detectado!", orderExtraction);

          // F. Salvar Pedido (Recalcular total)
          // Aqui validamos preços
          let total = 0;
          const confirmedItems = [];

          for (const item of orderExtraction.items) {
            const price = menuService.getItemPrice(item.name);
            if (price !== null) {
              total += price * item.quantity;
              confirmedItems.push({
                ...item,
                priceAtMoment: price
              });
            } else {
              clientLogger.warn(`Item não encontrado no menu ao fechar pedido: ${item.name}`);
              // Tratar erro: avisar usuário? Por enquanto segue.
            }
          }

          // Adicionar taxa entrega?
          // if (orderExtraction.deliveryNeeded && config.delivery.enabled) ...

          const newOrder: Order = {
            id: Date.now().toString(), // uuidv4() seria melhor
            customerPhone: msg.from,
            items: orderExtraction.items,
            total: total, // Preço validado
            status: "pending",
            deliveryNeeded: orderExtraction.deliveryNeeded,
            address: orderExtraction.address,
            paymentMethod: orderExtraction.paymentMethod,
            createdAt: new Date().toISOString()
          };

          await orderRepo.save(newOrder);

          // Notificação para o Grupo
          const notificationGroupId = process.env[getEnvVarName("NOTIFICATION_GROUP_ID", CLIENT_ID)];
          if (notificationGroupId) {
            const groupMessage = `🚨 *NOVO PEDIDO DETECTADO* 🚨\n\n👤 Cliente: ${msg.from.split("@")[0]}\n🆔 Pedido: ${
              newOrder.id
            }\n📍 Entrega: ${newOrder.deliveryNeeded ? "Sim" : "Não"}\n${
              newOrder.address ? `🏠 Endereço: ${newOrder.address}\n` : ""
            }💰 Pagamento: ${newOrder.paymentMethod || "A combinar"}\n\n📋 *Itens:*\n${newOrder.items
              .map((i) => `- ${i.quantity}x ${i.name} ${i.observation ? `(${i.observation})` : ""}`)
              .join("\n")}\n\n💵 *Total Estimado:* R$ ${newOrder.total.toFixed(2)}`;

            try {
              await whatsapp.sendText(notificationGroupId, groupMessage);
              clientLogger.info(`Notificação enviada para o grupo ${notificationGroupId}`);
            } catch (error) {
              clientLogger.error(`Erro ao enviar notificação para o grupo ${notificationGroupId}`, error);
            }
          } else {
            clientLogger.warn(
              `${getEnvVarName("NOTIFICATION_GROUP_ID", CLIENT_ID)} não configurado na env, notificação de grupo pulada.`
            );
          }

          // Se o LLM não gerou texto de confirmação (só JSON), geramos um padrão
          if (!finalMessage.trim()) {
            finalMessage = `✅ *Pedido Confirmado!*

Seu pedido #${newOrder.id} foi recebido com sucesso!
Total estimado: R$ ${newOrder.total.toFixed(2)}

Já estamos preparando tudo. Qualquer dúvida é só chamar!`;
          }
        }

        // G. Envia Resposta
        if (finalMessage.trim()) {
          // Para de mostrar "digitando..." antes de enviar
          await whatsapp.stopTyping(msg.from);

          // sendText já tem delay aleatório embutido
          await whatsapp.sendText(msg.from, finalMessage);
          await conversationManager.addMessage(msg.from, "assistant", finalMessage, llmResponse.thought);
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
