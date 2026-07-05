// Ports de persistência (interfaces). Implementados em @sirvase/db (adapters Postgres).
// REGRA DE ISOLAMENTO (P1.3): todo método que toca uma tabela filha de `tenants`
// recebe `tenantId` como PRIMEIRO argumento e injeta `WHERE tenant_id = $1` na query.
// Nenhum repo escopado expõe um caminho que leia/escreva sem o tenant. A barreira é
// disciplina de repositório, provada por teste (RLS de Postgres fica opcional).

// ── Tenant (raiz — NÃO é escopado por tenant_id; é a própria chave de tenancy) ──
export interface TenantRow {
  id: string;
  storeName: string;
  storeType: string | null;
  catalogApiUrl: string | null;
  pixKey: string | null;
  systemPromptPersonality: string | null;
  config: Record<string, unknown>;
  active: boolean;
  waNumber: string | null;
  waProvider: "meta" | "evolution";
  waPhoneNumberId: string | null;
  wabaId: string | null;
  status: "trial" | "active" | "past_due" | "suspended";
  plan: string | null;
  cardapioSource: "internal" | "external";
  createdAt: Date;
  updatedAt: Date;
}

export interface TenantRepository {
  findById(id: string): Promise<TenantRow | null>;
  /** Roteamento de entrada: resolve o tenant pelo phone_number_id da Cloud API. */
  findByPhoneNumberId(waPhoneNumberId: string): Promise<TenantRow | null>;
  /** Roteamento de entrada: resolve o tenant por wa_number (nome da instância Evolution, ou número normalizado). */
  findByWaNumber(waNumber: string): Promise<TenantRow | null>;
}

// ── Order (escopado por tenant_id) ─────────────────────────────────────────
export interface OrderRow {
  id: string;
  tenantId: string;
  customerPhone: string;
  items: unknown;
  total: number;
  status: "pending" | "confirmed" | "preparing" | "delivering" | "completed" | "cancelled";
  deliveryNeeded: boolean;
  address: string | null;
  paymentMethod: string | null;
  source: "bot" | "painel";
  idempotencyKey: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateOrderInput {
  customerPhone: string;
  items: unknown;
  total: number;
  status?: OrderRow["status"];
  deliveryNeeded?: boolean;
  address?: string | null;
  paymentMethod?: string | null;
  source?: OrderRow["source"];
  idempotencyKey?: string | null;
}

export interface OrderRepository {
  create(tenantId: string, input: CreateOrderInput): Promise<OrderRow>;
  findById(tenantId: string, id: string): Promise<OrderRow | null>;
  listByTenant(tenantId: string, limit?: number): Promise<OrderRow[]>;
  updateStatus(tenantId: string, id: string, status: OrderRow["status"]): Promise<OrderRow | null>;
}

// ── User (auth). findByEmail NÃO é escopado: o login acha o user antes de saber o
//    tenant; o tenant_id vem no próprio row. Hash de senha é responsabilidade do
//    serviço de auth (o repo recebe/entrega o hash pronto, nunca a senha em claro). ──
export interface UserRow {
  id: string;
  email: string;
  name: string;
  role: "admin" | "client";
  tenantId: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Como UserRow, mas carrega o hash — só usado internamente pela verificação de login. */
export interface UserWithSecret extends UserRow {
  passwordHash: string;
}

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  name: string;
  role?: UserRow["role"];
  tenantId: string;
}

export interface UserRepository {
  findByEmail(email: string): Promise<UserWithSecret | null>;
  findById(id: string): Promise<UserRow | null>;
  create(input: CreateUserInput): Promise<UserRow>;
}

// ── ProcessedMessage (dedup por message_id — Regra de Ouro 4: idempotência
//    ANTES de qualquer efeito colateral). message_id é PK global (id do provedor
//    já é único no mundo); tenant_id acompanha pra auditoria/limpeza. ──
export interface ProcessedMessageRepository {
  /** Tenta registrar a mensagem como processada (INSERT ON CONFLICT DO NOTHING).
   *  `true` = primeira vez (pode processar); `false` = duplicata (descartar). */
  markProcessed(tenantId: string, messageId: string): Promise<boolean>;
  /** Compensação: desfaz o registro quando o processamento falhou DEPOIS do mark,
   *  pra retry do job não ser engolido pela dedup. */
  unmark(tenantId: string, messageId: string): Promise<void>;
}

// ── Session (escopado por tenant_id; chave natural (tenant_id, phone_number)) ──
export interface SessionRow {
  id: string;
  tenantId: string;
  phoneNumber: string;
  context: Record<string, unknown>;
  lastActivity: Date;
  createdAt: Date;
}

export interface SessionRepository {
  getByPhone(tenantId: string, phoneNumber: string): Promise<SessionRow | null>;
  /** Upsert por (tenant_id, phone_number); atualiza context e last_activity. */
  upsert(
    tenantId: string,
    phoneNumber: string,
    context: Record<string, unknown>
  ): Promise<SessionRow>;
}
