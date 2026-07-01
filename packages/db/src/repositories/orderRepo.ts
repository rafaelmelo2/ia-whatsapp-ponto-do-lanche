import type { SQL } from "bun";
import type { CreateOrderInput, OrderRepository, OrderRow } from "@sirvase/core";
import { sql as defaultSql } from "../client.ts";

interface OrderDbRow {
  id: string;
  tenant_id: string;
  customer_phone: string;
  items: unknown;
  total: string; // numeric vem como string no driver
  status: OrderRow["status"];
  delivery_needed: boolean;
  address: string | null;
  payment_method: string | null;
  source: OrderRow["source"];
  idempotency_key: string | null;
  created_at: Date;
  updated_at: Date;
}

// jsonb pode vir parseado ou como texto, dependendo do driver — normaliza.
function parseJson(v: unknown): unknown {
  return typeof v === "string" ? JSON.parse(v) : v;
}

function map(r: OrderDbRow): OrderRow {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    customerPhone: r.customer_phone,
    items: parseJson(r.items),
    total: Number(r.total),
    status: r.status,
    deliveryNeeded: r.delivery_needed,
    address: r.address,
    paymentMethod: r.payment_method,
    source: r.source,
    idempotencyKey: r.idempotency_key,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  };
}

export class PgOrderRepository implements OrderRepository {
  constructor(private readonly sql: SQL = defaultSql) {}

  async create(tenantId: string, input: CreateOrderInput): Promise<OrderRow> {
    const rows = (await this.sql.unsafe(
      `INSERT INTO orders
         (tenant_id, customer_phone, items, total, status, delivery_needed,
          address, payment_method, source, idempotency_key)
       VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        tenantId,
        input.customerPhone,
        JSON.stringify(input.items),
        input.total,
        input.status ?? "pending",
        input.deliveryNeeded ?? false,
        input.address ?? null,
        input.paymentMethod ?? null,
        input.source ?? "bot",
        input.idempotencyKey ?? null
      ]
    )) as unknown as OrderDbRow[];
    return map(rows[0]!);
  }

  async findById(tenantId: string, id: string): Promise<OrderRow | null> {
    const rows = (await this.sql.unsafe(
      "SELECT * FROM orders WHERE tenant_id = $1 AND id = $2",
      [tenantId, id]
    )) as unknown as OrderDbRow[];
    return rows[0] ? map(rows[0]) : null;
  }

  async listByTenant(tenantId: string, limit = 50): Promise<OrderRow[]> {
    const rows = (await this.sql.unsafe(
      "SELECT * FROM orders WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT $2",
      [tenantId, limit]
    )) as unknown as OrderDbRow[];
    return rows.map(map);
  }

  async updateStatus(
    tenantId: string,
    id: string,
    status: OrderRow["status"]
  ): Promise<OrderRow | null> {
    const rows = (await this.sql.unsafe(
      `UPDATE orders SET status = $3, updated_at = now()
       WHERE tenant_id = $1 AND id = $2
       RETURNING *`,
      [tenantId, id, status]
    )) as unknown as OrderDbRow[];
    return rows[0] ? map(rows[0]) : null;
  }
}
