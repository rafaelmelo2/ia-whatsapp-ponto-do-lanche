// Porta do lock de conversa — serializa o processamento por (tenant_id, from).
// É o que mata o fan-out (claude.md §6): duas mensagens simultâneas do mesmo
// cliente nunca rodam o pipeline ao mesmo tempo. Implementações em
// @sirvase/adapters: Redis (SET NX PX) e in-memory (testes).
export interface ConversationLock {
  /** Tenta adquirir o lock. `true` = adquirido; `false` = já está com alguém.
   *  TTL evita deadlock se o worker morrer segurando o lock. */
  acquire(tenantId: string, from: string, ttlMs: number): Promise<boolean>;
  release(tenantId: string, from: string): Promise<void>;
}
