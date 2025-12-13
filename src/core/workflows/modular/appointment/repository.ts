import fs from "fs";
import path from "path";
import { logger } from "../../../utils/logger.js";
import { Appointment } from "./types.js";

export class AppointmentRepository {
    private dataDir: string;
    private clientId: string;

    constructor(clientId: string) {
        this.clientId = clientId;
        this.dataDir = path.resolve(process.cwd(), "src", "data", clientId, "appointments");
        if (!fs.existsSync(this.dataDir)) {
            fs.mkdirSync(this.dataDir, { recursive: true });
        }
    }

    async save(appointment: Appointment): Promise<void> {
        const filePath = path.join(this.dataDir, `${appointment.id}.json`);
        try {
            await fs.promises.writeFile(filePath, JSON.stringify(appointment, null, 2));
            logger.info(`[${this.clientId}] Agendamento salvo: ${appointment.id}`);
        } catch (error) {
            logger.error(`[${this.clientId}] Erro ao salvar agendamento ${appointment.id}`, error);
            throw error;
        }
    }

    async getById(id: string): Promise<Appointment | null> {
        const filePath = path.join(this.dataDir, `${id}.json`);
        if (!fs.existsSync(filePath)) return null;

        try {
            const data = await fs.promises.readFile(filePath, "utf8");
            return JSON.parse(data) as Appointment;
        } catch (error) {
            logger.error(`[${this.clientId}] Erro ao ler agendamento ${id}`, error);
            return null;
        }
    }
}

