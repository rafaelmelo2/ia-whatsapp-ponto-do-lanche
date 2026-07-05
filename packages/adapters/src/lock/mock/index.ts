// Mock in-memory do lock de conversa — mesma semântica do Redis (NX + TTL),
// suficiente pro teste de fan-out serializar de verdade dentro de um processo.
import type { ConversationLock } from "@sirvase/core";

export class InMemoryConversationLock implements ConversationLock {
  private locks = new Map<string, number>(); // chave → expiração (epoch ms)

  private key(tenantId: string, from: string): string {
    return `${tenantId}:${from}`;
  }

  async acquire(tenantId: string, from: string, ttlMs: number): Promise<boolean> {
    const key = this.key(tenantId, from);
    const expiresAt = this.locks.get(key);
    if (expiresAt !== undefined && expiresAt > Date.now()) {
      return false;
    }
    this.locks.set(key, Date.now() + ttlMs);
    return true;
  }

  async release(tenantId: string, from: string): Promise<void> {
    this.locks.delete(this.key(tenantId, from));
  }
}
