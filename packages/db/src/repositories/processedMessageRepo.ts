import type { SQL } from "bun";
import type { ProcessedMessageRepository } from "@sirvase/core";
import { sql as defaultSql } from "../client.ts";

// Dedup durável por message_id (Regra de Ouro 4): INSERT ON CONFLICT DO NOTHING
// devolve 0 linhas quando a mensagem já foi vista — é a barreira de idempotência
// que sobrevive a restart de worker e de fila.
export class PgProcessedMessageRepository implements ProcessedMessageRepository {
  constructor(private readonly sql: SQL = defaultSql) {}

  async markProcessed(tenantId: string, messageId: string): Promise<boolean> {
    const rows = (await this.sql.unsafe(
      `INSERT INTO processed_messages (message_id, tenant_id)
       VALUES ($1, $2)
       ON CONFLICT (message_id) DO NOTHING
       RETURNING message_id`,
      [messageId, tenantId]
    )) as unknown as { message_id: string }[];
    return rows.length > 0;
  }

  async unmark(tenantId: string, messageId: string): Promise<void> {
    // tenant_id no WHERE por disciplina de escopo (mesmo message_id sendo PK global).
    await this.sql.unsafe(
      "DELETE FROM processed_messages WHERE message_id = $1 AND tenant_id = $2",
      [messageId, tenantId]
    );
  }
}
