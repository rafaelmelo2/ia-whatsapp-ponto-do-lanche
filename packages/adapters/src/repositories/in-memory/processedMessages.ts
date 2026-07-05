// Mock in-memory da dedup por message_id — mesma semântica do Pg (PK global
// em message_id, ON CONFLICT DO NOTHING).
import type { ProcessedMessageRepository } from "@sirvase/core";

export class InMemoryProcessedMessageRepository implements ProcessedMessageRepository {
  private seen = new Map<string, string>(); // messageId → tenantId

  async markProcessed(tenantId: string, messageId: string): Promise<boolean> {
    if (this.seen.has(messageId)) return false;
    this.seen.set(messageId, tenantId);
    return true;
  }

  async unmark(tenantId: string, messageId: string): Promise<void> {
    if (this.seen.get(messageId) === tenantId) {
      this.seen.delete(messageId);
    }
  }
}
