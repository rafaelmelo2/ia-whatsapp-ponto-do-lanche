import fs from "fs";
import path from "path";
import { logger } from "../utils/logger.js";

export interface PhotoMetadata {
  filename: string;
  caption?: string;
  uploadedAt: string;
  itemName?: string;
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

  constructor(clientId: string) {
    this.clientId = clientId;
    this.photosDir = path.resolve(process.cwd(), "src", "data", clientId, "photos");
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

      // Salva metadata
      const metadata: PhotoMetadata = {
        filename,
        caption,
        uploadedAt: new Date().toISOString(),
        itemName
      };

      await this.saveMetadata(orderId, itemName, metadata);

      logger.info(`[PhotoService] Foto e metadata salvos com sucesso: ${filePath}`);
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
    const orderDir = path.join(this.photosDir, orderId);
    if (!fs.existsSync(orderDir)) {
      return [];
    }

    const items: ItemPhotos[] = [];
    const itemDirs = await fs.promises.readdir(orderDir, { withFileTypes: true });

    for (const itemDir of itemDirs) {
      if (!itemDir.isDirectory()) continue;

      const itemName = itemDir.name;
      const metadataPath = path.join(orderDir, itemName, "metadata.json");

      let photos: PhotoMetadata[] = [];
      if (fs.existsSync(metadataPath)) {
        const metadataContent = await fs.promises.readFile(metadataPath, "utf8");
        photos = JSON.parse(metadataContent);
      } else {
        // Fallback: lista arquivos de imagem diretamente
        const files = await fs.promises.readdir(path.join(orderDir, itemName));
        photos = files
          .filter((f) => f.match(/\.(jpg|jpeg|png|gif)$/i))
          .map((f) => ({
            filename: f,
            uploadedAt: new Date().toISOString(),
            itemName
          }));
      }

      if (photos.length > 0) {
        items.push({ itemName, photos });
      }
    }

    return items;
  }

  /**
   * Obtém o caminho completo de uma foto
   */
  getPhotoPath(orderId: string, itemName: string, filename: string): string {
    return path.join(this.photosDir, orderId, this.sanitizeFileName(itemName), filename);
  }

  /**
   * Salva metadata de uma foto
   */
  private async saveMetadata(orderId: string, itemName: string, metadata: PhotoMetadata): Promise<void> {
    const orderDir = path.join(this.photosDir, orderId);
    const itemDir = path.join(orderDir, this.sanitizeFileName(itemName));
    const metadataPath = path.join(itemDir, "metadata.json");

    let allMetadata: PhotoMetadata[] = [];
    if (fs.existsSync(metadataPath)) {
      const content = await fs.promises.readFile(metadataPath, "utf8");
      allMetadata = JSON.parse(content);
    }

    allMetadata.push(metadata);
    await fs.promises.writeFile(metadataPath, JSON.stringify(allMetadata, null, 2));
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
