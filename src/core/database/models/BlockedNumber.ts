import mongoose, { Schema, Document } from "mongoose";

export interface IBlockedNumber extends Document {
  clientId: string; // ID do cliente
  phone: string; // Número normalizado (com @s.whatsapp.net)
  blockedAt: Date;
  blockedBy?: string; // Telefone de quem bloqueou (admin)
  reason?: string; // Motivo do bloqueio
  isActive: boolean; // Se ainda está bloqueado
  unblockedAt?: Date;
}

const BlockedNumberSchema = new Schema<IBlockedNumber>({
  clientId: { type: String, required: true, index: true },
  phone: { type: String, required: true, index: true },
  blockedAt: { type: Date, default: Date.now, index: true },
  blockedBy: { type: String },
  reason: { type: String },
  isActive: { type: Boolean, default: true, index: true },
  unblockedAt: { type: Date }
});

// Índice composto único para garantir um bloqueio ativo por cliente/número
BlockedNumberSchema.index({ clientId: 1, phone: 1, isActive: 1 }, { unique: true, partialFilterExpression: { isActive: true } });

// Índices para buscas comuns
BlockedNumberSchema.index({ clientId: 1, isActive: 1 });
BlockedNumberSchema.index({ clientId: 1, blockedAt: -1 });

export const BlockedNumberModel = mongoose.model<IBlockedNumber>("BlockedNumber", BlockedNumberSchema);

