import type { SQL } from "bun";
import type { SessionRepository, SessionRow } from "@sirvase/core";
import { sql as defaultSql } from "../client.ts";

interface SessionDbRow {
  id: string;
  tenant_id: string;
  phone_number: string;
  context: Record<string, unknown> | string;
  last_activity: Date;
  created_at: Date;
}

// jsonb pode vir parseado (objeto) ou como texto, dependendo do driver — normaliza.
function asObject(v: Record<string, unknown> | string): Record<string, unknown> {
  return typeof v === "string" ? JSON.parse(v) : v;
}

function map(r: SessionDbRow): SessionRow {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    phoneNumber: r.phone_number,
    context: asObject(r.context),
    lastActivity: r.last_activity,
    createdAt: r.created_at
  };
}

export class PgSessionRepository implements SessionRepository {
  constructor(private readonly sql: SQL = defaultSql) {}

  async getByPhone(tenantId: string, phoneNumber: string): Promise<SessionRow | null> {
    const rows = (await this.sql.unsafe(
      "SELECT * FROM sessions WHERE tenant_id = $1 AND phone_number = $2",
      [tenantId, phoneNumber]
    )) as unknown as SessionDbRow[];
    return rows[0] ? map(rows[0]) : null;
  }

  async upsert(
    tenantId: string,
    phoneNumber: string,
    context: Record<string, unknown>
  ): Promise<SessionRow> {
    const rows = (await this.sql.unsafe(
      `INSERT INTO sessions (tenant_id, phone_number, context, last_activity)
       VALUES ($1, $2, $3::jsonb, now())
       ON CONFLICT (tenant_id, phone_number)
       DO UPDATE SET context = EXCLUDED.context, last_activity = now()
       RETURNING *`,
      [tenantId, phoneNumber, JSON.stringify(context)]
    )) as unknown as SessionDbRow[];
    return map(rows[0]!);
  }
}
