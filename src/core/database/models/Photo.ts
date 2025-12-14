import mongoose, { Schema, Document } from "mongoose";

export interface IPhoto extends Document {
  clientId: string;
  orderId: string;
  itemName: string;
  filename: string;
  caption?: string;
  uploadedAt: Date;
  filePath?: string; // Caminho relativo ou absoluto
}

const PhotoSchema = new Schema<IPhoto>({
  clientId: { type: String, required: true, index: true },
  orderId: { type: String, required: true, index: true },
  itemName: { type: String, required: true },
  filename: { type: String, required: true },
  caption: { type: String },
  uploadedAt: { type: Date, default: Date.now },
  filePath: { type: String }
});

// Índice para buscar fotos de um pedido rapidamente
PhotoSchema.index({ clientId: 1, orderId: 1 });
PhotoSchema.index({ clientId: 1, orderId: 1, itemName: 1 });

export const PhotoModel = mongoose.model<IPhoto>("Photo", PhotoSchema);

