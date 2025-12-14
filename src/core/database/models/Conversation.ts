import mongoose, { Schema, Document } from "mongoose";

export interface IMessage {
  role: "user" | "assistant" | "system";
  content: string;
  thought?: string;
  timestamp: number;
}

export interface IConversation extends Document {
  clientId: string; // ID do cliente
  phone: string; // Número do WhatsApp (com @s.whatsapp.net)
  history: IMessage[];
  lastInteraction: Date;
  currentOrderId?: string;
  isArchived: boolean; // Se está arquivada
  archivedAt?: Date;
}

const MessageSchema = new Schema<IMessage>({
  role: {
    type: String,
    enum: ["user", "assistant", "system"],
    required: true
  },
  content: { type: String, required: true },
  thought: { type: String },
  timestamp: { type: Number, required: true }
}, { _id: false });

const ConversationSchema = new Schema<IConversation>({
  clientId: { type: String, required: true, index: true },
  phone: { type: String, required: true, index: true },
  history: { type: [MessageSchema], default: [] },
  lastInteraction: { type: Date, default: Date.now, index: true },
  currentOrderId: { type: String },
  isArchived: { type: Boolean, default: false, index: true },
  archivedAt: { type: Date }
});

// Índice composto único para garantir uma conversa ativa por cliente/número
ConversationSchema.index({ clientId: 1, phone: 1, isArchived: 1 }, { unique: true, partialFilterExpression: { isArchived: false } });

// Índices para buscas comuns
ConversationSchema.index({ clientId: 1, lastInteraction: -1 });
ConversationSchema.index({ clientId: 1, isArchived: 1 });

export const ConversationModel = mongoose.model<IConversation>("Conversation", ConversationSchema);

