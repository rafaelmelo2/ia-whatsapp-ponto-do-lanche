import { logger } from "../../../utils/logger.js";
import { Appointment } from "./types.js";
import { MongoDBAppointmentRepository } from "../../../database/repositories/AppointmentRepository.js";

/**
 * AppointmentRepository - Usa MongoDB para persistência
 * Mantém interface compatível com código existente
 */
export class AppointmentRepository {
    private mongoRepo: MongoDBAppointmentRepository;

    constructor(clientId: string) {
        this.mongoRepo = new MongoDBAppointmentRepository(clientId);
    }

    async save(appointment: Appointment): Promise<void> {
        return this.mongoRepo.save(appointment);
    }

    async getById(id: string): Promise<Appointment | null> {
        return this.mongoRepo.getById(id);
    }
}

