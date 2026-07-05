// Repositórios in-memory — mocks das ports de persistência pra rodar o pipeline
// sem Postgres. Mesmas regras de isolamento dos Pg*Repository: métodos escopados
// recebem tenantId como 1º argumento e nunca cruzam tenants; espelham também a
// UNIQUE de orders.idempotency_key (por tenant) pra dedup ficar testável.
import type {
  CreateOrderInput,
  OrderRepository,
  OrderRow,
  SessionRepository,
  SessionRow,
  TenantRepository,
  TenantRow
} from "@sirvase/core";

export class InMemoryTenantRepository implements TenantRepository {
  private tenants: TenantRow[];

  constructor(tenants: TenantRow[] = []) {
    this.tenants = [...tenants];
  }

  async findById(id: string): Promise<TenantRow | null> {
    return this.tenants.find((t) => t.id === id) ?? null;
  }

  async findByPhoneNumberId(waPhoneNumberId: string): Promise<TenantRow | null> {
    return this.tenants.find((t) => t.waPhoneNumberId === waPhoneNumberId) ?? null;
  }

  async findByWaNumber(waNumber: string): Promise<TenantRow | null> {
    return this.tenants.find((t) => t.waNumber === waNumber) ?? null;
  }
}

export class InMemoryOrderRepository implements OrderRepository {
  private orders: OrderRow[] = [];
  private seq = 0;

  async create(tenantId: string, input: CreateOrderInput): Promise<OrderRow> {
    if (
      input.idempotencyKey &&
      this.orders.some((o) => o.tenantId === tenantId && o.idempotencyKey === input.idempotencyKey)
    ) {
      // Espelha a UNIQUE (tenant_id, idempotency_key) do Postgres.
      throw new Error(`Pedido duplicado: idempotency_key ${input.idempotencyKey} já existe no tenant`);
    }
    this.seq += 1;
    const now = new Date();
    const order: OrderRow = {
      id: `order-${this.seq}`,
      tenantId,
      customerPhone: input.customerPhone,
      items: input.items,
      total: input.total,
      status: input.status ?? "pending",
      deliveryNeeded: input.deliveryNeeded ?? false,
      address: input.address ?? null,
      paymentMethod: input.paymentMethod ?? null,
      source: input.source ?? "bot",
      idempotencyKey: input.idempotencyKey ?? null,
      createdAt: now,
      updatedAt: now
    };
    this.orders.push(order);
    return order;
  }

  async findById(tenantId: string, id: string): Promise<OrderRow | null> {
    return this.orders.find((o) => o.tenantId === tenantId && o.id === id) ?? null;
  }

  async listByTenant(tenantId: string, limit = 50): Promise<OrderRow[]> {
    return this.orders
      .filter((o) => o.tenantId === tenantId)
      .slice(-limit)
      .reverse();
  }

  async updateStatus(tenantId: string, id: string, status: OrderRow["status"]): Promise<OrderRow | null> {
    const order = await this.findById(tenantId, id);
    if (!order) return null;
    order.status = status;
    order.updatedAt = new Date();
    return order;
  }
}

export class InMemorySessionRepository implements SessionRepository {
  private sessions: SessionRow[] = [];
  private seq = 0;

  async getByPhone(tenantId: string, phoneNumber: string): Promise<SessionRow | null> {
    return this.sessions.find((s) => s.tenantId === tenantId && s.phoneNumber === phoneNumber) ?? null;
  }

  async upsert(
    tenantId: string,
    phoneNumber: string,
    context: Record<string, unknown>
  ): Promise<SessionRow> {
    const existing = await this.getByPhone(tenantId, phoneNumber);
    if (existing) {
      existing.context = context;
      existing.lastActivity = new Date();
      return existing;
    }
    this.seq += 1;
    const now = new Date();
    const session: SessionRow = {
      id: `session-${this.seq}`,
      tenantId,
      phoneNumber,
      context,
      lastActivity: now,
      createdAt: now
    };
    this.sessions.push(session);
    return session;
  }
}
