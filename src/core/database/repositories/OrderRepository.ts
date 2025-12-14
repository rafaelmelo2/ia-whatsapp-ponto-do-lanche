import { logger } from "../../utils/logger.js";
import { OrderModel, IOrder } from "../models/Order.js";
import { Order } from "../../workflows/modular/commerce/types.js";

export class MongoDBOrderRepository {
  private clientId: string;

  constructor(clientId: string) {
    this.clientId = clientId;
  }

  async save(order: Order): Promise<void> {
    try {
      // Converte Order para IOrder
      const orderData = {
        id: order.id,
        clientId: this.clientId,
        customerPhone: order.customerPhone,
        customerName: order.customerName,
        items: order.items.map(item => ({
          name: item.name,
          quantity: item.quantity,
          observation: item.observation,
          requiresPhotos: item.requiresPhotos,
          priceAtMoment: (item as any).priceAtMoment
        })),
        total: order.total,
        status: order.status,
        deliveryNeeded: order.deliveryNeeded,
        address: order.address,
        paymentMethod: order.paymentMethod,
        createdAt: new Date(order.createdAt),
        photosCollected: order.photosCollected
      };

      await OrderModel.findOneAndUpdate(
        { id: order.id, clientId: this.clientId },
        { ...orderData, updatedAt: new Date() },
        { upsert: true, new: true }
      );

      logger.info(`[${this.clientId}] Pedido salvo no MongoDB: ${order.id}`);
    } catch (error) {
      logger.error(`[${this.clientId}] Erro ao salvar pedido ${order.id} no MongoDB`, error);
      throw error;
    }
  }

  async getById(id: string): Promise<Order | null> {
    try {
      const doc = await OrderModel.findOne({ id, clientId: this.clientId });
      if (!doc) return null;

      return this.convertToOrder(doc);
    } catch (error) {
      logger.error(`[${this.clientId}] Erro ao ler pedido ${id} do MongoDB`, error);
      return null;
    }
  }

  async getAll(filters?: {
    status?: string;
    customerPhone?: string;
    startDate?: Date;
    endDate?: Date;
  }): Promise<Order[]> {
    try {
      const query: any = { clientId: this.clientId };

      if (filters?.status) {
        query.status = filters.status;
      }

      if (filters?.customerPhone) {
        query.customerPhone = filters.customerPhone;
      }

      if (filters?.startDate || filters?.endDate) {
        query.createdAt = {};
        if (filters.startDate) query.createdAt.$gte = filters.startDate;
        if (filters.endDate) query.createdAt.$lte = filters.endDate;
      }

      const docs = await OrderModel.find(query).sort({ createdAt: -1 });
      return docs.map(doc => this.convertToOrder(doc));
    } catch (error) {
      logger.error(`[${this.clientId}] Erro ao buscar pedidos do MongoDB`, error);
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

      return await OrderModel.countDocuments(query);
    } catch (error) {
      logger.error(`[${this.clientId}] Erro ao contar pedidos no MongoDB`, error);
      return 0;
    }
  }

  private convertToOrder(doc: IOrder): Order {
    return {
      id: doc.id,
      customerPhone: doc.customerPhone,
      customerName: doc.customerName,
      items: doc.items.map(item => ({
        name: item.name,
        quantity: item.quantity,
        observation: item.observation,
        requiresPhotos: item.requiresPhotos,
        priceAtMoment: item.priceAtMoment
      })),
      total: doc.total,
      status: doc.status,
      deliveryNeeded: doc.deliveryNeeded,
      address: doc.address,
      paymentMethod: doc.paymentMethod,
      createdAt: doc.createdAt.toISOString(),
      photosCollected: doc.photosCollected
    };
  }
}

