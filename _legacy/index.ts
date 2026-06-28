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
import { logger } from "./core/utils/logger.js";
import { BaileysProvider } from "./core/whatsapp/baileys.js";
import { startServer } from "./server.js";

// ID do cliente (poderia vir de env var)
const CLIENT_ID = process.env.CLIENT_ID || "ponto-do-lanche";

async function main() {
  try {
    startServer(Number(process.env.PORT) || 3000);
    logger.info(`Iniciando bot para cliente: ${CLIENT_ID}`);

    // 1. Config
    const config = loadConfig(CLIENT_ID);

    // 2. Services
    const menuService = new MenuService(config);
    const promptBuilder = new PromptBuilder();
    const llm = new LLMModel(config);
    const guard = new PromptGuard();
    const parser = new OrderParser();
    const orderRepo = new OrderRepository();
    const conversationManager = new ConversationManager();
    const whatsapp = new BaileysProvider();

    // 3. Handler de Mensagens
    whatsapp.onMessage(async (msg) => {
      logger.info(`Msg de ${msg.from}: ${msg.body}`);

      // Marca mensagem como lida (azul)
      if (msg.messageId) {
        await whatsapp.markAsRead(msg.from, msg.messageId);
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
        logger.info(`Gerando resposta LLM...`);
        const llmResponse = await llm.generate(systemPrompt, history);
        let answer = llmResponse.content;

        // D. Validação (Guard)
        const validation = guard.validate(answer);
        if (!validation.isValid) {
          logger.warn(`Resposta inválida do LLM: ${validation.reason}`);
          // Fallback simples ou retry (aqui vamos só mandar msg de erro genérica interna e logar)
          // O ideal seria pedir pro LLM corrigir, mas vamos simplificar.
          // Se tiver header, a gente tenta limpar na marra? Não, o guard já avisou.
          // Vamos deixar passar mas logar erro, ou cortar headers.
          answer = answer.replace(/^#+\s/gm, "* "); // Tentativa de correção simples
        }

        // E. Extração de Pedido (JSON Oculto)
        const orderExtraction = parser.extract(answer);
        let finalMessage = parser.cleanResponse(answer);

        if (orderExtraction) {
          logger.info("Pedido detectado!", orderExtraction);

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
              logger.warn(`Item não encontrado no menu ao fechar pedido: ${item.name}`);
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
          const groupID = process.env.WHATSAPP_GROUP_ID;
          if (groupID) {
            const groupMessage = `🚨 *NOVO PEDIDO DETECTADO* 🚨\n\n👤 Cliente: ${msg.from.split("@")[0]}\n🆔 Pedido: ${
              newOrder.id
            }\n📍 Entrega: ${newOrder.deliveryNeeded ? "Sim" : "Não"}\n${
              newOrder.address ? `🏠 Endereço: ${newOrder.address}\n` : ""
            }💰 Pagamento: ${newOrder.paymentMethod || "A combinar"}\n\n📋 *Itens:*\n${newOrder.items
              .map((i) => `- ${i.quantity}x ${i.name} ${i.observation ? `(${i.observation})` : ""}`)
              .join("\n")}\n\n💵 *Total Estimado:* R$ ${newOrder.total.toFixed(2)}`;

            try {
              await whatsapp.sendText(groupID, groupMessage);
              logger.info(`Notificação enviada para o grupo ${groupID}`);
            } catch (error) {
              logger.error(`Erro ao enviar notificação para o grupo ${groupID}`, error);
            }
          } else {
            logger.warn("WHATSAPP_GROUP_ID não configurado na env, notificação de grupo pulada.");
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
        logger.error("Erro no processamento da mensagem", err);
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
    logger.error("Fatal error no startup:", e);
    process.exit(1);
  }
}

main();
