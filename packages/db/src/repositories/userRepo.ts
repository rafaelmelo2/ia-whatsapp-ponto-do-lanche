import type { SQL } from "bun";
import type { CreateUserInput, UserRepository, UserRow, UserWithSecret } from "@sirvase/core";
import { sql as defaultSql } from "../client.ts";

interface UserDbRow {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  role: UserRow["role"];
  tenant_id: string;
  created_at: Date;
  updated_at: Date;
}

function mapPublic(r: UserDbRow): UserRow {
  return {
    id: r.id,
    email: r.email,
    name: r.name,
    role: r.role,
    tenantId: r.tenant_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  };
}

function mapWithSecret(r: UserDbRow): UserWithSecret {
  return { ...mapPublic(r), passwordHash: r.password_hash };
}

export class PgUserRepository implements UserRepository {
  constructor(private readonly sql: SQL = defaultSql) {}

  async findByEmail(email: string): Promise<UserWithSecret | null> {
    const rows = (await this.sql.unsafe("SELECT * FROM users WHERE email = $1", [
      email
    ])) as unknown as UserDbRow[];
    return rows[0] ? mapWithSecret(rows[0]) : null;
  }

  async findById(id: string): Promise<UserRow | null> {
    const rows = (await this.sql.unsafe("SELECT * FROM users WHERE id = $1", [
      id
    ])) as unknown as UserDbRow[];
    return rows[0] ? mapPublic(rows[0]) : null;
  }

  async create(input: CreateUserInput): Promise<UserRow> {
    const rows = (await this.sql.unsafe(
      `INSERT INTO users (email, password_hash, name, role, tenant_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [input.email, input.passwordHash, input.name, input.role ?? "client", input.tenantId]
    )) as unknown as UserDbRow[];
    return mapPublic(rows[0]!);
  }
}
