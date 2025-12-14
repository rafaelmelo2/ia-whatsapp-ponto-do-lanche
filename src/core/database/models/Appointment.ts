import mongoose, { Schema, Document } from "mongoose";

export interface IAppointmentService {
  name: string;
  observation?: string;
}

export interface IAppointment extends Document {
  id: string;
  clientId: string; // ID do cliente
  customerPhone: string;
  customerName?: string;
  services: IAppointmentService[];
  dateTime: string; // ISO 8601 ou formato legível
  observation?: string;
  status: "pending" | "confirmed" | "cancelled" | "completed";
  createdAt: Date;
  updatedAt: Date;
}

const AppointmentServiceSchema = new Schema<IAppointmentService>({
  name: { type: String, required: true },
  observation: { type: String }
}, { _id: false });

const AppointmentSchema = new Schema<IAppointment>({
  id: { type: String, required: true, unique: true },
  clientId: { type: String, required: true, index: true },
  customerPhone: { type: String, required: true, index: true },
  customerName: { type: String },
  services: { type: [AppointmentServiceSchema], required: true },
  dateTime: { type: String, required: true, index: true },
  observation: { type: String },
  status: {
    type: String,
    enum: ["pending", "confirmed", "cancelled", "completed"],
    default: "pending",
    index: true
  },
  createdAt: { type: Date, default: Date.now, index: true },
  updatedAt: { type: Date, default: Date.now }
});

// Índices para buscas comuns
AppointmentSchema.index({ clientId: 1, status: 1 });
AppointmentSchema.index({ clientId: 1, dateTime: 1 });
AppointmentSchema.index({ clientId: 1, createdAt: -1 });

export const AppointmentModel = mongoose.model<IAppointment>("Appointment", AppointmentSchema);

