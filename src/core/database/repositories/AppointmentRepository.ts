import { logger } from "../../utils/logger.js";
import { AppointmentModel, IAppointment } from "../models/Appointment.js";
import { Appointment } from "../../workflows/modular/appointment/types.js";

export class MongoDBAppointmentRepository {
  private clientId: string;

  constructor(clientId: string) {
    this.clientId = clientId;
  }

  async save(appointment: Appointment): Promise<void> {
    try {
      const appointmentData = {
        id: appointment.id,
        clientId: this.clientId,
        customerPhone: appointment.customerPhone,
        customerName: appointment.customerName,
        services: appointment.services.map(service => ({
          name: service.name,
          observation: service.observation
        })),
        dateTime: appointment.dateTime,
        observation: appointment.observation,
        status: appointment.status,
        createdAt: new Date(appointment.createdAt)
      };

      await AppointmentModel.findOneAndUpdate(
        { id: appointment.id, clientId: this.clientId },
        { ...appointmentData, updatedAt: new Date() },
        { upsert: true, new: true }
      );

      logger.info(`[${this.clientId}] Agendamento salvo no MongoDB: ${appointment.id}`);
    } catch (error) {
      logger.error(`[${this.clientId}] Erro ao salvar agendamento ${appointment.id} no MongoDB`, error);
      throw error;
    }
  }

  async getById(id: string): Promise<Appointment | null> {
    try {
      const doc = await AppointmentModel.findOne({ id, clientId: this.clientId });
      if (!doc) return null;

      return this.convertToAppointment(doc);
    } catch (error) {
      logger.error(`[${this.clientId}] Erro ao ler agendamento ${id} do MongoDB`, error);
      return null;
    }
  }

  async getAll(filters?: {
    status?: string;
    customerPhone?: string;
    startDate?: Date;
    endDate?: Date;
  }): Promise<Appointment[]> {
    try {
      const query: any = { clientId: this.clientId };

      if (filters?.status) {
        query.status = filters.status;
      }

      if (filters?.customerPhone) {
        query.customerPhone = filters.customerPhone;
      }

      if (filters?.startDate || filters?.endDate) {
        query.dateTime = {};
        if (filters.startDate) query.dateTime.$gte = filters.startDate.toISOString();
        if (filters.endDate) query.dateTime.$lte = filters.endDate.toISOString();
      }

      const docs = await AppointmentModel.find(query).sort({ createdAt: -1 });
      return docs.map(doc => this.convertToAppointment(doc));
    } catch (error) {
      logger.error(`[${this.clientId}] Erro ao buscar agendamentos do MongoDB`, error);
      return [];
    }
  }

  async count(filters?: { status?: string; startDate?: Date; endDate?: Date }): Promise<number> {
    try {
      const query: any = { clientId: this.clientId };

      if (filters?.status) {
        query.status = filters.status;
      }

      if (filters?.startDate || filters?.endDate) {
        query.createdAt = {};
        if (filters.startDate) query.createdAt.$gte = filters.startDate;
        if (filters.endDate) query.createdAt.$lte = filters.endDate;
      }

      return await AppointmentModel.countDocuments(query);
    } catch (error) {
      logger.error(`[${this.clientId}] Erro ao contar agendamentos no MongoDB`, error);
      return 0;
    }
  }

  private convertToAppointment(doc: IAppointment): Appointment {
    return {
      id: doc.id,
      customerPhone: doc.customerPhone,
      customerName: doc.customerName,
      services: doc.services.map(service => ({
        name: service.name,
        observation: service.observation
      })),
      dateTime: doc.dateTime,
      observation: doc.observation,
      status: doc.status,
      createdAt: doc.createdAt.toISOString()
    };
  }
}

