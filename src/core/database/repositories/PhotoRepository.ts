import { PhotoModel, IPhoto } from "../models/Photo.js";

export interface PhotoData {
  clientId: string;
  orderId: string;
  itemName: string;
  filename: string;
  caption?: string;
  uploadedAt?: Date;
}

export class MongoDBPhotoRepository {
  private clientId: string;

  constructor(clientId: string) {
    this.clientId = clientId;
  }

  async save(data: PhotoData): Promise<IPhoto> {
    const photo = new PhotoModel({
      ...data,
      clientId: this.clientId,
      uploadedAt: data.uploadedAt || new Date()
    });
    return await photo.save();
  }

  async getByOrderId(orderId: string): Promise<IPhoto[]> {
    return await PhotoModel.find({ 
      clientId: this.clientId, 
      orderId 
    }).sort({ uploadedAt: 1 });
  }

  async getByItem(orderId: string, itemName: string): Promise<IPhoto[]> {
    return await PhotoModel.find({ 
      clientId: this.clientId, 
      orderId,
      itemName
    }).sort({ uploadedAt: 1 });
  }
}

