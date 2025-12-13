import { DynamicStructuredTool } from "@langchain/core/tools";
import fs from "fs";
import path from "path";
import { z } from "zod";
import { MenuService } from "../../../menu/menuService.js";
import { logger } from "../../../utils/logger.js";
import { WorkflowContext } from "../../base/types.js";
import { WorkflowTools } from "../../base/workflowTools.js";
import { PhotoTools } from "./photoTools.js";
import { OrderRepository } from "./repository.js";
import { Order, OrderItem } from "./types.js";

/**
 * Schema para a ferramenta de finalizar pedido
 */
const FinalizeOrderSchema = z.object({
  items: z.array(
    z.object({
      name: z.string().describe("Nome exato do item do catálogo"),
      quantity: z.number().describe("Quantidade do item"),
      observation: z.string().optional().describe("Observações sobre o item")
    })
  ),
  deliveryNeeded: z.boolean().describe("Se o pedido precisa de entrega"),
  address: z.string().optional().nullable().describe("Endereço completo para entrega (se necessário)"),
  paymentMethod: z.string().optional().nullable().describe("Forma de pagamento escolhida")
});

/**
 * Schema para consultar preço de item
 */
const GetItemPriceSchema = z.object({
  itemName: z.string().describe("Nome exato do item para consultar o preço")
});

/**
 * Schema para verificar disponibilidade de item
 */
const CheckItemAvailabilitySchema = z.object({
  itemName: z.string().describe("Nome exato do item para verificar disponibilidade")
});

/**
 * Ferramentas disponíveis para o workflow de comércio
 */
export class CommerceTools extends WorkflowTools {
  private menuService: MenuService;

  constructor(context: WorkflowContext, clientId: string) {
    super(context);
    this.menuService = new MenuService(context.config, clientId);
    this.menuService.getMenu().catch(() => {});
  }

  getTools(): DynamicStructuredTool[] {
    // Cria PhotoTools com o contexto atual (que tem currentMessage atualizado)
    const photoTools = new PhotoTools(this.context);
    return [
      this.createFinalizeOrderTool(),
      this.createGetItemPriceTool(),
      this.createCheckItemAvailabilityTool(),
      ...photoTools.getTools() // Inclui as tools de foto com contexto atualizado
    ];
  }

  /**
   * Ferramenta principal: Finaliza um pedido
   * O agente deve usar esta ferramenta quando o cliente confirmar o pedido
   */
  private createFinalizeOrderTool(): DynamicStructuredTool {
    return this.createTool(
      "finalize_order",
      `Finaliza um pedido do cliente. Use esta ferramenta quando o cliente confirmar explicitamente o pedido (ex: "pode fechar", "é só isso", "pode confirmar"). 
      Esta ferramenta salva o pedido, calcula o total e envia notificações.`,
      FinalizeOrderSchema,
      async (input: z.infer<typeof FinalizeOrderSchema>) => {
        try {
          const { config, clientId, phone, logger } = this.context;

          // Recalcular total e validar itens
          let total = 0;
          const validItems: (OrderItem & { priceAtMoment: number })[] = [];

          // Garante cache atualizado
          await this.menuService.getMenu();

          for (const item of input.items) {
            const price = this.menuService.getItemPrice(item.name);
            if (price !== null) {
              total += price * item.quantity;
              validItems.push({
                ...item,
                priceAtMoment: price
              });
            } else {
              logger.warn(`[CommerceTools] Item não encontrado no menu: ${item.name}`);
              validItems.push({ ...item, priceAtMoment: 0 });
            }
          }

          // Adicionar taxas de entrega se necessário
          if (input.deliveryNeeded && config.delivery?.enabled && config.delivery.minimum_fee) {
            // Lógica de taxa mínima pode ser adicionada aqui
          }

          // Busca o nome do cliente
          let customerName: string | undefined;
          try {
            const name = await this.context.whatsapp.getContactName(phone);
            if (name) {
              customerName = name;
            }
          } catch (error) {
            logger.debug(`[CommerceTools] Não foi possível obter nome do cliente ${phone}`);
          }

          const newOrder: Order = {
            id: Date.now().toString(),
            customerPhone: phone,
            customerName: customerName,
            items: validItems,
            total: total,
            status: "pending",
            deliveryNeeded: input.deliveryNeeded,
            address: input.address || undefined,
            paymentMethod: input.paymentMethod || undefined,
            createdAt: new Date().toISOString()
          };

          const repo = new OrderRepository(clientId);
          await repo.save(newOrder);

          // Move fotos de "pending" para o orderId real se existirem
          await this.movePendingPhotos(phone, newOrder.id);

          // Envia notificação
          await this.sendNotification(newOrder);

          return `✅ Pedido finalizado com sucesso! ID: ${newOrder.id}, Total: R$ ${newOrder.total.toFixed(2)}`;
        } catch (error) {
          logger.error("[CommerceTools] Erro ao finalizar pedido", error);
          return `❌ Erro ao finalizar pedido: ${error instanceof Error ? error.message : "Erro desconhecido"}`;
        }
      }
    );
  }

  /**
   * Ferramenta auxiliar: Consulta preço de um item
   */
  private createGetItemPriceTool(): DynamicStructuredTool {
    return this.createTool(
      "get_item_price",
      "Consulta o preço de um item específico do catálogo. Use quando o cliente perguntar sobre preços.",
      GetItemPriceSchema,
      async (input: z.infer<typeof GetItemPriceSchema>) => {
        try {
          await this.menuService.getMenu();
          const price = this.menuService.getItemPrice(input.itemName);

          if (price === null) {
            return `❌ Item "${input.itemName}" não encontrado no catálogo.`;
          }

          return `💰 O item "${input.itemName}" custa R$ ${price.toFixed(2)}`;
        } catch (error) {
          return `❌ Erro ao consultar preço: ${error instanceof Error ? error.message : "Erro desconhecido"}`;
        }
      }
    );
  }

  /**
   * Ferramenta auxiliar: Verifica disponibilidade de um item
   */
  private createCheckItemAvailabilityTool(): DynamicStructuredTool {
    return this.createTool(
      "check_item_availability",
      "Verifica se um item está disponível no catálogo. Use quando o cliente perguntar sobre disponibilidade.",
      CheckItemAvailabilitySchema,
      async (input: z.infer<typeof CheckItemAvailabilitySchema>) => {
        try {
          await this.menuService.getMenu();
          const price = this.menuService.getItemPrice(input.itemName);

          if (price === null) {
            return `❌ O item "${input.itemName}" não está disponível no momento.`;
          }

          return `✅ O item "${input.itemName}" está disponível!`;
        } catch (error) {
          return `❌ Erro ao verificar disponibilidade: ${error instanceof Error ? error.message : "Erro desconhecido"}`;
        }
      }
    );
  }

  /**
   * Move fotos de "pending" para o orderId real
   */
  private async movePendingPhotos(phone: string, orderId: string): Promise<void> {
    const pendingOrderId = `pending_${phone}`;
    const photosDir = path.resolve(process.cwd(), "src", "data", this.context.clientId, "photos");
    const pendingDir = path.join(photosDir, pendingOrderId);
    const orderDir = path.join(photosDir, orderId);

    if (!fs.existsSync(pendingDir)) {
      return; // Não há fotos pendentes
    }

    try {
      // Cria diretório do pedido se não existir
      if (!fs.existsSync(orderDir)) {
        fs.mkdirSync(orderDir, { recursive: true });
      }

      // Move todos os itens
      const items = await fs.promises.readdir(pendingDir, { withFileTypes: true });
      for (const item of items) {
        if (item.isDirectory()) {
          const sourcePath = path.join(pendingDir, item.name);
          const destPath = path.join(orderDir, item.name);
          await fs.promises.rename(sourcePath, destPath);
        }
      }

      // Remove diretório pending se estiver vazio
      const remaining = await fs.promises.readdir(pendingDir);
      if (remaining.length === 0) {
        await fs.promises.rmdir(pendingDir);
      }

      this.context.logger.info(`[CommerceTools] Fotos movidas de ${pendingOrderId} para ${orderId}`);
    } catch (error) {
      this.context.logger.error(`[CommerceTools] Erro ao mover fotos pendentes`, error);
    }
  }

  /**
   * Envia notificação para grupo com fotos organizadas
   */
  private async sendNotification(order: Order): Promise<void> {
    const envVarName = `${this.context.clientId.toUpperCase().replace(/-/g, "_")}_NOTIFICATION_GROUP_ID`;
    const notificationGroupId = process.env[envVarName];

    this.context.logger.info(`[CommerceTools] Tentando notificar grupo. EnvVar: ${envVarName}, Valor: ${notificationGroupId}`);

    if (!notificationGroupId) {
      this.context.logger.warn(`${envVarName} não configurado na env, notificação de grupo pulada.`);
      return;
    }

    // Obtém fotos do pedido
    const photoTools = new PhotoTools(this.context);
    const itemPhotos = await photoTools.getOrderPhotos(order.id);

    // Monta mensagem de texto
    const phoneNumber = order.customerPhone.split("@")[0];
    const customerDisplay = order.customerName 
      ? `${order.customerName}\n${phoneNumber}`
      : phoneNumber;

    let message = `🚨 *NOVO PEDIDO DETECTADO* 🚨

👤 Cliente: ${customerDisplay}
🆔 Pedido: ${order.id}
📍 Entrega: ${order.deliveryNeeded ? "Sim" : "Não"}
${order.address ? `🏠 Endereço: ${order.address}\n` : ""}💰 Pagamento: ${order.paymentMethod || "A combinar"}

📋 *Itens:*`;

    // Adiciona itens com informações de fotos
    for (const item of order.items) {
      const photosForItem = itemPhotos.find((ip) => ip.itemName === item.name);
      if (photosForItem && photosForItem.photos.length > 0) {
        message += `\n- ${item.quantity}x ${item.name} ${item.observation ? `(${item.observation})` : ""}`;
        message += `\n  📸 Fotos (${photosForItem.photos.length}):`;
        photosForItem.photos.forEach((photo, idx) => {
          message += `\n    • Foto ${idx + 1}${photo.caption ? `: ${photo.caption}` : ""}`;
        });
      } else {
        message += `\n- ${item.quantity}x ${item.name} ${item.observation ? `(${item.observation})` : ""}`;
      }
    }

    message += `\n\n💵 *Total Estimado:* R$ ${order.total.toFixed(2)}`;

    try {
      // Envia mensagem de texto
      await this.context.whatsapp.sendText(notificationGroupId, message);

      // Envia fotos organizadas por item
      for (const itemPhoto of itemPhotos) {
        for (const photo of itemPhoto.photos) {
          const photoPath = photoTools.getPhotoPath(order.id, itemPhoto.itemName, photo.filename);
          const caption = `📸 ${itemPhoto.itemName}${photo.caption ? ` - ${photo.caption}` : ""}`;
          await this.context.whatsapp.sendImage(notificationGroupId, photoPath, caption);
          // Pequeno delay entre fotos
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      this.context.logger.info(
        `Notificação enviada para o grupo ${notificationGroupId} com ${itemPhotos.reduce(
          (sum: number, ip: any) => sum + ip.photos.length,
          0
        )} foto(s)`
      );
    } catch (error) {
      this.context.logger.error(`Erro ao enviar notificação para o grupo ${notificationGroupId}`, error);
    }
  }
}
