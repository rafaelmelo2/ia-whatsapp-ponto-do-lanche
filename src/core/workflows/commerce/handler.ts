import { AppConfig } from "../../config/schema.js";
import { MenuService } from "../../menu/menuService.js";
import { WorkflowContext } from "../base/types.js";
import { WorkflowHandler, WorkflowProcessResult } from "../base/workflow.js";
import { OrderParser } from "./parser.js";
import { OrderRepository } from "./repository.js";
import { LLMOrderExtraction, Order } from "./types.js";

export class CommerceHandler implements WorkflowHandler {
    private parser: OrderParser;
    private menuService: MenuService | null = null;

    constructor() {
        this.parser = new OrderParser();
    }

    private getMenuService(config: AppConfig, clientId: string): MenuService {
        if (!this.menuService) {
            this.menuService = new MenuService(config, clientId);
            this.menuService.getMenu().catch(() => { });
        }
        return this.menuService;
    }

    getPromptSnippet(config: AppConfig): string {
        return `
FINALIZAÇÃO E JSON:

Quando o cliente confirmar o pedido explicitamente (ex: "pode fechar", "é só isso", "pode confirmar o pedido"), você deve:

1. Enviar uma mensagem curta de confirmação e despedida para o cliente.
2. Em seguida, produzir um bloco JSON oculto, COM O SEGUINTE FORMATO EXATO e NADA MAIS dentro do bloco:

O formato do JSON deve ser ESTRITAMENTE este:
<<<JSON
{
"items": [
{ "name": "Nome do Item exato do {{store.catalog_name}}", "quantity": 1, "observation": "" }
],
"deliveryNeeded": true,
"address": "Rua tal, 123" (ou null se não informado ainda),
"paymentMethod": "Pix" (ou null)
}
>>>

REGRAS DO JSON:
- "name" deve ser exatamente o nome do item no {{store.catalog_name}}.
- "quantity" é um número inteiro.
- "observation" pode ser uma string vazia ("") se não houver observações.
- "deliveryNeeded": true se for entrega, false se for retirada ou não precisar de entrega. Se o negócio não oferecer entrega, sempre use false.
- "address": string com o endereço completo (apenas necessário se deliveryNeeded for true), ou null se não tiver sido informado.
- "paymentMethod": forma de pagamento escolhida({{payments.methods}}), ou null se não tiver sido informada.
- NÃO coloque emojis, comentários ou texto fora da estrutura JSON dentro do bloco.
`;
    }

    async processResponse(response: string, context: WorkflowContext): Promise<WorkflowProcessResult> {
        const extraction = this.parser.extract(response);
        const cleaned = this.parser.cleanResponse(response);

        return {
            data: extraction,
            cleanedResponse: cleaned,
            actionNeeded: !!extraction
        };
    }

    async executeAction(data: LLMOrderExtraction, context: WorkflowContext): Promise<Order> {
        const { config, clientId, phone, whatsapp, logger } = context;
        const menuService = this.getMenuService(config, clientId);

        // Recalcular total e validar itens
        let total = 0;
        const validItems = [];

        // Garante cache atualizado
        await menuService.getMenu();

        for (const item of data.items) {
            const price = menuService.getItemPrice(item.name);
            if (price !== null) {
                total += price * item.quantity;
                validItems.push({
                    ...item,
                    priceAtMoment: price
                });
            } else {
                logger.warn(`[CommerceHandler] Item não encontrado no menu: ${item.name}`);
                // Mantém item mesmo sem preço para não perder info, mas total não soma
                validItems.push({ ...item, priceAtMoment: 0 });
            }
        }

        // Adicionar taxas de entrega se necessário (lógica simplificada)
        if (data.deliveryNeeded && config.delivery?.enabled && config.delivery.minimum_fee) {
            // if total < minimum_fee ...
        }

        const newOrder: Order = {
            id: Date.now().toString(),
            customerPhone: phone,
            items: validItems,
            total: total,
            status: "pending",
            deliveryNeeded: data.deliveryNeeded,
            address: data.address,
            paymentMethod: data.paymentMethod,
            createdAt: new Date().toISOString()
        };

        const repo = new OrderRepository(clientId);
        await repo.save(newOrder);

        // Notificação para o Grupo
        const envVarName = `${clientId.toUpperCase().replace(/-/g, "_")}_NOTIFICATION_GROUP_ID`;
        const notificationGroupId = process.env[envVarName];

        if (notificationGroupId) {
            const groupMessage = `🚨 *NOVO PEDIDO DETECTADO* 🚨\n\n👤 Cliente: ${phone.split("@")[0]}\n🆔 Pedido: ${newOrder.id
                }\n📍 Entrega: ${newOrder.deliveryNeeded ? "Sim" : "Não"}\n${newOrder.address ? `🏠 Endereço: ${newOrder.address}\n` : ""
                }💰 Pagamento: ${newOrder.paymentMethod || "A combinar"}\n\n📋 *Itens:*\n${newOrder.items
                    .map((i) => `- ${i.quantity}x ${i.name} ${i.observation ? `(${i.observation})` : ""}`)
                    .join("\n")}\n\n💵 *Total Estimado:* R$ ${newOrder.total.toFixed(2)}`;

            try {
                await whatsapp.sendText(notificationGroupId, groupMessage);
                logger.info(`Notificação enviada para o grupo ${notificationGroupId}`);
            } catch (error) {
                logger.error(`Erro ao enviar notificação para o grupo ${notificationGroupId}`, error);
            }
        } else {
            logger.warn(`${envVarName} não configurado na env, notificação de grupo pulada.`);
        }

        return newOrder;
    }
}
