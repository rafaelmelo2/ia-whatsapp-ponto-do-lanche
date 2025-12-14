import { logger } from "../../../utils/logger.js";
import { Order } from "./types.js";
import { MongoDBOrderRepository } from "../../../database/repositories/OrderRepository.js";

/**
 * OrderRepository - Usa MongoDB para persistência
 * Mantém interface compatível com código existente
 */
export class OrderRepository {
    private mongoRepo: MongoDBOrderRepository;

    constructor(clientId: string) {
        this.mongoRepo = new MongoDBOrderRepository(clientId);
    }

    async save(order: Order): Promise<void> {
        return this.mongoRepo.save(order);
    }

    async getById(id: string): Promise<Order | null> {
        return this.mongoRepo.getById(id);
    }
}

