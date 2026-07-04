import type { SQL } from "bun";
import type { TenantRepository, TenantRow } from "@sirvase/core";
import { sql as defaultSql } from "../client.ts";

interface TenantDbRow {
  id: string;
  store_name: string;
  store_type: string | null;
  catalog_api_url: string | null;
  pix_key: string | null;
  system_prompt_personality: string | null;
  config: Record<string, unknown> | string;
  active: boolean;
  wa_number: string | null;
  wa_provider: TenantRow["waProvider"];
  wa_phone_number_id: string | null;
  waba_id: string | null;
  status: TenantRow["status"];
  plan: string | null;
  cardapio_source: TenantRow["cardapioSource"];
  created_at: Date;
  updated_at: Date;
}

// jsonb pode vir parseado (objeto) ou como texto, dependendo do driver — normaliza.
function asObject(v: Record<string, unknown> | string): Record<string, unknown> {
  return typeof v === "string" ? JSON.parse(v) : v;
}

function map(r: TenantDbRow): TenantRow {
  return {
    id: r.id,
    storeName: r.store_name,
    storeType: r.store_type,
    catalogApiUrl: r.catalog_api_url,
    pixKey: r.pix_key,
    systemPromptPersonality: r.system_prompt_personality,
    config: asObject(r.config),
    active: r.active,
    waNumber: r.wa_number,
    waProvider: r.wa_provider,
    waPhoneNumberId: r.wa_phone_number_id,
    wabaId: r.waba_id,
    status: r.status,
    plan: r.plan,
    cardapioSource: r.cardapio_source,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  };
}

export class PgTenantRepository implements TenantRepository {
  constructor(private readonly sql: SQL = defaultSql) {}

  async findById(id: string): Promise<TenantRow | null> {
    const rows = (await this.sql.unsafe("SELECT * FROM tenants WHERE id = $1", [
      id
    ])) as unknown as TenantDbRow[];
    return rows[0] ? map(rows[0]) : null;
  }

  async findByPhoneNumberId(waPhoneNumberId: string): Promise<TenantRow | null> {
    const rows = (await this.sql.unsafe(
      "SELECT * FROM tenants WHERE wa_phone_number_id = $1",
      [waPhoneNumberId]
    )) as unknown as TenantDbRow[];
    return rows[0] ? map(rows[0]) : null;
  }

  async findByWaNumber(waNumber: string): Promise<TenantRow | null> {
    const rows = (await this.sql.unsafe(
      "SELECT * FROM tenants WHERE wa_number = $1",
      [waNumber]
    )) as unknown as TenantDbRow[];
    return rows[0] ? map(rows[0]) : null;
  }
}
