// Lock de conversa em Redis — SET NX PX (token aleatório por aquisição) e
// release atômico via EVAL (só apaga se o token ainda é meu, não derruba lock
// alheio depois do meu TTL expirar). Client Redis NATIVO do Bun: zero dep nova.
import { RedisClient } from "bun";
import type { ConversationLock } from "@sirvase/core";

const RELEASE_SCRIPT =
  'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end';

export class RedisConversationLock implements ConversationLock {
  private client: RedisClient;
  /** Token da aquisição vigente por chave — só este processo pode soltar o que pegou. */
  private held = new Map<string, string>();

  constructor(url: string) {
    this.client = new RedisClient(url);
  }

  private key(tenantId: string, from: string): string {
    return `lock:conversation:${tenantId}:${from}`;
  }

  async acquire(tenantId: string, from: string, ttlMs: number): Promise<boolean> {
    const key = this.key(tenantId, from);
    const token = crypto.randomUUID();
    const result = await this.client.send("SET", [key, token, "NX", "PX", String(ttlMs)]);
    if (result === "OK") {
      this.held.set(key, token);
      return true;
    }
    return false;
  }

  async release(tenantId: string, from: string): Promise<void> {
    const key = this.key(tenantId, from);
    const token = this.held.get(key);
    if (!token) return;
    this.held.delete(key);
    await this.client.send("EVAL", [RELEASE_SCRIPT, "1", key, token]);
  }

  close(): void {
    this.client.close();
  }
}
