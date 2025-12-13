import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { PhotoService } from "../../../services/photoService.js";
import { logger } from "../../../utils/logger.js";
import { WorkflowContext } from "../../base/types.js";
import { WorkflowTools } from "../../base/workflowTools.js";

/**
 * Schema para a ferramenta de coletar fotos
 */
const CollectPhotosSchema = z.object({
  orderId: z.string().describe("ID do pedido (use 'pending' se ainda não foi criado)"),
  itemName: z.string().describe("Nome exato do item do catálogo que precisa das fotos"),
  imageMessageId: z.string().describe("ID da mensagem de imagem recebida"),
  caption: z.string().optional().describe("Legenda ou descrição da foto fornecida pelo cliente")
});

/**
 * Tool separada para coletar fotos de itens específicos
 * Esta tool é usada quando o cliente envia fotos para personalização
 */
export class PhotoTools extends WorkflowTools {
  private photoService: PhotoService;
  private processedImageIds: Set<string> = new Set(); // Rastreia imagens processadas nesta instância

  constructor(context: WorkflowContext) {
    super(context);
    this.photoService = new PhotoService(context.clientId);
  }

  getTools(): DynamicStructuredTool[] {
    return [this.createCollectPhotoTool()];
  }

  /**
   * Ferramenta para coletar e salvar uma foto de um item específico
   */
  private createCollectPhotoTool(): DynamicStructuredTool {
    return this.createTool(
      "collect_photo",
      `Coleta e salva uma foto enviada pelo cliente.
      CRÍTICO: Se o usuário enviou MÚLTIPLAS FOTOS (aparecem como múltiplas tags [IMAGEM_ENVIADA:ID] na mensagem), você DEVE chamar esta ferramenta UMA VEZ PARA CADA ID de imagem.
      Exemplo: Se a mensagem for "[IMAGEM_ENVIADA:123] [IMAGEM_ENVIADA:456]", chame collect_photo(id=123) E DEPOIS chame collect_photo(id=456).
      O orderId pode ser 'pending' se o pedido ainda não foi finalizado.`,
      CollectPhotosSchema,
      async (input: z.infer<typeof CollectPhotosSchema>) => {
        try {
          const { imageMessageId, itemName, caption, orderId } = input;
          const { whatsapp, phone, logger, currentMessage, additionalRawMessages } = this.context;

          // Verifica se já processamos esta imagem nesta interação
          if (this.processedImageIds.has(imageMessageId)) {
            logger.info(`[PhotoTools] Imagem ${imageMessageId} já processada nesta interação. Ignorando download duplicado.`);
            return `✅ Foto ${imageMessageId} já foi salva anteriormente.`;
          }

          // Baixa a imagem usando a mensagem raw se disponível
          logger.info(`[PhotoTools] Baixando imagem ${imageMessageId} para item ${itemName}`);

          // Tenta encontrar a rawMessage correta:
          // 1. Verifica se está em additionalRawMessages (mapeado por ID)
          // 2. Verifica se currentMessage corresponde ao ID (se tiver ID acessível)
          // 3. Usa currentMessage como fallback

          let rawMessageToUse = currentMessage;

          if (additionalRawMessages && additionalRawMessages[imageMessageId]) {
            logger.info(`[PhotoTools] Encontrada mensagem raw específica para ID ${imageMessageId}`);
            rawMessageToUse = additionalRawMessages[imageMessageId];
          }

          logger.info(`[PhotoTools] Contexto - HasRawMessage: ${!!rawMessageToUse}, Phone: ${phone}`);
          const imageBuffer = await whatsapp.downloadImage(imageMessageId, phone, rawMessageToUse);

          if (!imageBuffer) {
            logger.error(`[PhotoTools] Falha ao baixar imagem ${imageMessageId} - não foi possível processar`);
            return `❌ Não foi possível baixar a imagem. Por favor, envie a foto novamente.`;
          }

          // Salva a foto
          const photoMetadata = await this.photoService.savePhoto(
            orderId === "pending" ? `pending_${phone}` : orderId,
            itemName,
            imageBuffer,
            caption
          );

          // Marca como processada
          this.processedImageIds.add(imageMessageId);

          logger.info(`[PhotoTools] Foto coletada para item ${itemName}: ${photoMetadata.filename}`);

          return `✅ Foto recebida e salva para o item "${itemName}"${caption ? ` com a descrição: "${caption}"` : ""}. ${
            caption ? "" : "Você pode enviar mais fotos para este item ou continuar com o próximo item que precisa de fotos."
          }`;
        } catch (error) {
          logger.error("[PhotoTools] Erro ao coletar foto", error);
          return `❌ Erro ao processar a foto: ${error instanceof Error ? error.message : "Erro desconhecido"}`;
        }
      }
    );
  }

  /**
   * Obtém todas as fotos de um pedido (usado na notificação)
   */
  async getOrderPhotos(orderId: string) {
    return await this.photoService.getOrderPhotos(orderId);
  }

  /**
   * Obtém o caminho de uma foto específica
   */
  getPhotoPath(orderId: string, itemName: string, filename: string): string {
    return this.photoService.getPhotoPath(orderId, itemName, filename);
  }
}
