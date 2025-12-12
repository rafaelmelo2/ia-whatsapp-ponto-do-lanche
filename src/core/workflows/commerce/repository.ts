import fs from "fs";
import path from "path";
import { logger } from "../../../utils/logger.js";
import { Order } from "./types.js";

export class OrderRepository {
    private dataDir: string;
    private clientId: string;

    constructor(clientId: string) {
        this.clientId = clientId;
        // Ajuste para rodar tanto em src quanto dist
        this.dataDir = path.resolve(process.cwd(), "src", "data", clientId, "orders");
        if (!fs.existsSync(this.dataDir)) {
            fs.mkdirSync(this.dataDir, { recursive: true });
        }
    }

    async save(order: Order): Promise<void> {
        const filePath = path.join(this.dataDir, `${order.id}.json`);
        try {
            await fs.promises.writeFile(filePath, JSON.stringify(order, null, 2));
            logger.info(`[${this.clientId}] Pedido salvo: ${order.id}`);
        } catch (error) {
            logger.error(`[${this.clientId}] Erro ao salvar pedido ${order.id}`, error);
            throw error;
        }
    }

    async getById(id: string): Promise<Order | null> {
        const filePath = path.join(this.dataDir, `${id}.json`);
        if (!fs.existsSync(filePath)) return null;

        try {
            const data = await fs.promises.readFile(filePath, "utf8");
            return JSON.parse(data) as Order;
        } catch (error) {
            logger.error(`[${this.clientId}] Erro ao ler pedido ${id}`, error);
            return null;
        }
    }
}

