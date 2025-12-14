import mongoose, { Schema, Document } from "mongoose";

export interface IOrderItem {
  name: string;
  quantity: number;
  observation?: string;
  requiresPhotos?: boolean;
  priceAtMoment?: number; // Preço no momento do pedido
}

export interface IOrder extends Document {
  id: string;
  clientId: string; // ID do cliente (emunah, ponto-do-lanche, etc.)
  customerPhone: string;
  customerName?: string;
  items: IOrderItem[];
  total: number;
  status: "pending" | "confirmed" | "delivering" | "completed" | "cancelled";
  deliveryNeeded: boolean;
  address?: string;
  paymentMethod?: string;
  createdAt: Date;
  updatedAt: Date;
  photosCollected?: boolean;
}

const OrderItemSchema = new Schema<IOrderItem>({
  name: { type: String, required: true },
  quantity: { type: Number, required: true },
  observation: { type: String },
  requiresPhotos: { type: Boolean },
  priceAtMoment: { type: Number }
}, { _id: false });

const OrderSchema = new Schema<IOrder>({
  id: { type: String, required: true, unique: true },
  clientId: { type: String, required: true, index: true },
  customerPhone: { type: String, required: true, index: true },
  customerName: { type: String },
  items: { type: [OrderItemSchema], required: true },
  total: { type: Number, required: true },
  status: {
    type: String,
    enum: ["pending", "confirmed", "delivering", "completed", "cancelled"],
    default: "pending",
    index: true
  },
  deliveryNeeded: { type: Boolean, required: true },
  address: { type: String },
  paymentMethod: { type: String },
  photosCollected: { type: Boolean },
  createdAt: { type: Date, default: Date.now, index: true },
  updatedAt: { type: Date, default: Date.now }
});

// Índice composto para buscas comuns
OrderSchema.index({ clientId: 1, status: 1 });
OrderSchema.index({ clientId: 1, createdAt: -1 });
OrderSchema.index({ clientId: 1, customerPhone: 1 });

export const OrderModel = mongoose.model<IOrder>("Order", OrderSchema);

