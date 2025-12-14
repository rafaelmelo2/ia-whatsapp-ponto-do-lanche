import fs from "fs";
import path from "path";
import { logger } from "../utils/logger.js";
import { MongoDBPhotoRepository } from "../database/repositories/PhotoRepository.js";

export interface PhotoMetadata {
  filename: string;
  caption?: string;
  uploadedAt: string;
  itemName: string;
}

export interface ItemPhotos {
  itemName: string;
  photos: PhotoMetadata[];
}

/**
 * Serviço para gerenciar download, armazenamento e organização de fotos
 */
export class PhotoService {
  private clientId: string;
  private photosDir: string;
  private photoRepo: MongoDBPhotoRepository;

  constructor(clientId: string) {
    this.clientId = clientId;
    this.photosDir = path.resolve(process.cwd(), "src", "data", clientId, "photos");
    this.photoRepo = new MongoDBPhotoRepository(clientId);
    
    if (!fs.existsSync(this.photosDir)) {
      fs.mkdirSync(this.photosDir, { recursive: true });
    }
  }

  /**
   * Salva uma foto para um pedido e item específico
   */
  async savePhoto(orderId: string, itemName: string, imageBuffer: Buffer, caption?: string): Promise<PhotoMetadata> {
    try {
      logger.info(
        `[PhotoService] Iniciando salvamento de foto. OrderId: ${orderId}, Item: ${itemName}, Buffer size: ${imageBuffer.length} bytes`
      );
      logger.info(`[PhotoService] Diretório base: ${this.photosDir}`);

      // Verifica se o diretório base existe
      if (!fs.existsSync(this.photosDir)) {
        logger.warn(`[PhotoService] Diretório base não existe, criando: ${this.photosDir}`);
        fs.mkdirSync(this.photosDir, { recursive: true });
      }

      const orderDir = path.join(this.photosDir, orderId);
      const sanitizedItemName = this.sanitizeFileName(itemName);
      const itemDir = path.join(orderDir, sanitizedItemName);

      logger.info(`[PhotoService] Criando diretórios: ${itemDir}`);
      if (!fs.existsSync(itemDir)) {
        fs.mkdirSync(itemDir, { recursive: true });
        logger.info(`[PhotoService] Diretório criado: ${itemDir}`);
      }

      // Verifica se o diretório foi criado
      if (!fs.existsSync(itemDir)) {
        throw new Error(`Não foi possível criar o diretório: ${itemDir}`);
      }

      // Gera nome único para a foto
      const timestamp = Date.now();
      const extension = "jpg"; // WhatsApp geralmente envia JPG
      const filename = `photo_${timestamp}.${extension}`;
      const filePath = path.join(itemDir, filename);

      logger.info(`[PhotoService] Salvando arquivo: ${filePath} (${imageBuffer.length} bytes)`);

      // Salva a imagem
      await fs.promises.writeFile(filePath, imageBuffer);

      // Verifica se o arquivo foi realmente salvo
      if (!fs.existsSync(filePath)) {
        throw new Error(`Arquivo não foi salvo: ${filePath}`);
      }

      const stats = await fs.promises.stat(filePath);
      logger.info(`[PhotoService] Arquivo salvo com sucesso: ${filePath} (${stats.size} bytes)`);

      // Salva metadata no MongoDB
      const uploadedAt = new Date();
      await this.photoRepo.save({
        clientId: this.clientId,
        orderId,
        itemName,
        filename,
        caption,
        uploadedAt
      });

      const metadata: PhotoMetadata = {
        filename,
        caption,
        uploadedAt: uploadedAt.toISOString(),
        itemName
      };

      logger.info(`[PhotoService] Foto salva e metadata persistido no MongoDB: ${filename}`);
      return metadata;
    } catch (error) {
      logger.error(`[PhotoService] Erro ao salvar foto:`, error);
      throw error;
    }
  }

  /**
   * Obtém todas as fotos de um pedido, organizadas por item
   */
  async getOrderPhotos(orderId: string): Promise<ItemPhotos[]> {
    try {
      // Busca metadados do MongoDB
      const photos = await this.photoRepo.getByOrderId(orderId);

      // Agrupa por item
      const itemsMap = new Map<string, PhotoMetadata[]>();
      
      for (const photo of photos) {
        const itemPhotos = itemsMap.get(photo.itemName) || [];
        itemPhotos.push({
          filename: photo.filename,
          caption: photo.caption,
          uploadedAt: photo.uploadedAt.toISOString(),
          itemName: photo.itemName
        });
        itemsMap.set(photo.itemName, itemPhotos);
      }

      const items: ItemPhotos[] = [];
      itemsMap.forEach((photos, itemName) => {
        items.push({ itemName, photos });
      });

      return items;
    } catch (error) {
      logger.error(`[PhotoService] Erro ao buscar fotos do pedido ${orderId}:`, error);
      return [];
    }
  }

  /**
   * Obtém o caminho completo de uma foto
   */
  getPhotoPath(orderId: string, itemName: string, filename: string): string {
    return path.join(this.photosDir, orderId, this.sanitizeFileName(itemName), filename);
  }

  /**
   * Sanitiza nome de arquivo para evitar problemas
   */
  private sanitizeFileName(name: string): string {
    return name
      .replace(/[^a-z0-9]/gi, "_")
      .replace(/_+/g, "_")
      .toLowerCase()
      .substring(0, 50);
  }
}
