# WhatsApp Dual-Provider (Evolution + Cloud API) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Sirvase a working WhatsApp transport layer with two interchangeable providers — Evolution API (self-hosted, active now) and Meta Cloud API (built in parallel, ready to activate per-tenant once Meta approves the app) — routed by a single `tenants.wa_number` identity, with an echo-level pipeline (no queue/LLM yet — that's Épico 2/3/5).

**Architecture:** `WhatsAppProvider` (core port) is redesigned to a webhook+REST shape (`parseWebhook`/`sendText`/`markAsRead`), replacing the old in-process Baileys-shaped port. Two adapters implement it (`EvolutionApiProvider`, `CloudApiProvider`); `services/webhook` gets two fixed routes (`/webhook/evolution`, `/webhook/meta`) that resolve the tenant via `wa_number` or `wa_phone_number_id`, build the right provider instance for that tenant, and echo the message back. Evolution runs in a dev-only Docker container so testing needs no VPS/domain/tunnel.

**Tech Stack:** Bun (workspaces, `bun:test`, `Bun.SQL`, `Bun.serve`), TypeScript strict, Zod, Postgres, Docker Compose.

## Global Constraints

- Runtime is **Bun**, not npm/pnpm — every command below is `bun run ...` / `bun test` / `bun install`.
- Imports between packages: bare specifier (`@sirvase/core`), never relative into another package. Inside a package: relative path with `.ts`/`.js` extension per existing files.
- `core` never imports SDKs or `adapters`; adapters are the only place with external SDKs/`fetch` to third parties.
- Every scoped repository method takes `tenantId`/routing key as documented in `packages/core/src/ports/repositories.ts` — this plan does not change that rule, only extends `TenantRepository`.
- `PROGRESSO_BUILD.md` normally says "não commitar sem o usuário pedir" — for **this** subagent-driven execution the user explicitly authorized one commit per task (2026-07-04), so each task below ends with a real `git commit`. Never push, never touch `main` — everything lands on `feat/biggest-refatoration` only. Do not amend/squash without being asked; each task's commit stands on its own for later review.
- No new npm dependencies for crypto — mirror `services/api/src/auth/jwt.ts`'s Web Crypto (`crypto.subtle`) pattern for the Meta HMAC signature check.
- `bun run typecheck`, `bun test`, and `bun run lint` must all be green before moving to the next task (same bar as every prior Épico in this repo).

---

### Task 1: Schema — `tenants.wa_number` + `wa_provider` (routing identity)

**Files:**
- Create: `db/migrations/0010_add_wa_routing.up.sql`
- Create: `db/migrations/0010_add_wa_routing.down.sql`
- Modify: `db/seed.ts`

**Interfaces:**
- Produces: DB columns `tenants.wa_number` (text, unique, nullable) and `tenants.wa_provider` (text, not null, default `'evolution'`, check `IN ('meta','evolution')`). Later tasks (2, 6) read/write these by exact name.

- [ ] **Step 1: Write the migration**

`db/migrations/0010_add_wa_routing.up.sql`:
```sql
-- Identidade universal de roteamento multi-provedor (Evolution + Meta Cloud API).
-- wa_number é a chave em comum: nome da instância na Evolution, número normalizado
-- (E.164 sem "+") nos dois casos. wa_phone_number_id (já existe) vira campo técnico
-- exclusivo da Meta (exigido pela Graph API pra montar a URL de envio).
ALTER TABLE tenants ADD COLUMN wa_number text UNIQUE;
ALTER TABLE tenants ADD COLUMN wa_provider text NOT NULL DEFAULT 'evolution'
  CHECK (wa_provider IN ('meta', 'evolution'));
```

`db/migrations/0010_add_wa_routing.down.sql`:
```sql
ALTER TABLE tenants DROP COLUMN wa_provider;
ALTER TABLE tenants DROP COLUMN wa_number;
```

- [ ] **Step 2: Apply and verify the migration**

Run (from repo root, stack up via `bun run up` if not already):
```bash
bun run db:migrate:status
bun run db:migrate:up
bun run db:migrate:status
```
Expected: `0010_add_wa_routing` listed as pending before, applied (✓) after.

- [ ] **Step 3: Verify down/up cycle is clean**

```bash
bun run db:migrate:down
bun run db:migrate:status   # 0010 shows as pending again
bun run db:migrate:up
bun run db:migrate:status   # 0010 shows as applied again
```

- [ ] **Step 4: Update the seed to set `wa_number`/`wa_provider` for the test tenant**

In `db/seed.ts`, replace the tenant insert:

```ts
  await sql.unsafe(
    `INSERT INTO tenants (id, store_name, store_type, catalog_api_url, pix_key,
        status, plan, cardapio_source, active, config, wa_number, wa_provider)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, $9::jsonb, $10, $11)
     ON CONFLICT (id) DO UPDATE SET wa_number = EXCLUDED.wa_number, wa_provider = EXCLUDED.wa_provider`,
    [
      PONTO_DO_LANCHE_ID,
      "Ponto do Lanche",
      "hamburgueria",
      "http://129.153.92.154/api/menu/items",
      "pix@pontodolanche.com",
      "trial",
      "mensalidade_fixa",
      "external",
      JSON.stringify(config),
      "5511999999999", // placeholder — troca quando o chip de teste real for provisionado
      "evolution"
    ]
  );
```

Note: `ON CONFLICT (id) DO UPDATE SET wa_number = ..., wa_provider = ...` (not `DO NOTHING`) — the tenant row from prior sessions already exists, so a plain `DO NOTHING` would silently skip setting these new columns on rerun. This upsert only touches the two new fields, leaving everything else on the existing row untouched.

- [ ] **Step 5: Run the seed and verify**

```bash
bun run db:seed
```
Expected output: `✓ seed ok — tenant "Ponto do Lanche" + admin admin@pontodolanche.com` (no error). Then verify the columns landed:
```bash
PGPASSWORD=$POSTGRES_PASSWORD psql -h 127.0.0.1 -p 15432 -U sirvase -d sirvase \
  -c "SELECT store_name, wa_number, wa_provider FROM tenants WHERE id = 'a278e80f-399d-47d9-b4db-9b3f6798d147';"
```
Expected: one row, `wa_number = 5511999999999`, `wa_provider = evolution`.

- [ ] **Step 6: Commit**

```bash
git add db/migrations/0010_add_wa_routing.up.sql db/migrations/0010_add_wa_routing.down.sql db/seed.ts
git commit -m "feat: wa_number/wa_provider como identidade universal de roteamento (P4.0)"
```

---

### Task 2: `TenantRepository.findByWaNumber`

**Files:**
- Modify: `packages/core/src/ports/repositories.ts`
- Modify: `packages/db/src/repositories/tenantRepo.ts`
- Create: `packages/db/test/tenantRouting.test.ts`

**Interfaces:**
- Consumes: `tenants.wa_number`/`wa_provider` columns from Task 1.
- Produces: `TenantRow.waNumber: string | null`, `TenantRow.waProvider: "meta" | "evolution"`, `TenantRepository.findByWaNumber(waNumber: string): Promise<TenantRow | null>` — Task 6's webhook router calls this exact method.

- [ ] **Step 1: Write the failing test**

`packages/db/test/tenantRouting.test.ts`:
```ts
// Prova do P4.0/P4.2: tenants.wa_number roteia mensagens da Evolution do mesmo jeito
// que wa_phone_number_id roteia a Meta. Integração — conecta no Postgres local
// (loopback 127.0.0.1:15432); pula gracioso se o banco estiver inacessível.
import { SQL, randomUUIDv7 } from "bun";
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { PgTenantRepository } from "../src/index.ts";

const testSql = new SQL({
  hostname: process.env.TEST_POSTGRES_HOST ?? "127.0.0.1",
  port: Number(process.env.TEST_POSTGRES_PORT ?? 15432),
  database: process.env.POSTGRES_DB ?? "sirvase",
  username: process.env.POSTGRES_USER ?? "sirvase",
  password: process.env.POSTGRES_PASSWORD ?? "",
  max: 2
});

let dbUp = true;
try {
  await testSql.unsafe("SELECT 1");
} catch {
  dbUp = false;
  console.warn("[tenantRouting] Postgres inacessível — pulando testes de roteamento.");
}

const tenantId = randomUUIDv7();
const WA_NUMBER = "5511900000001";
const tenants = new PgTenantRepository(testSql);

describe.skipIf(!dbUp)("roteamento por wa_number (P4.0)", () => {
  beforeAll(async () => {
    await testSql.unsafe(
      "INSERT INTO tenants (id, store_name, wa_number, wa_provider) VALUES ($1, 'Tenant Evolution Teste', $2, 'evolution')",
      [tenantId, WA_NUMBER]
    );
  });

  afterAll(async () => {
    await testSql.unsafe("DELETE FROM tenants WHERE id = $1", [tenantId]);
    await testSql.close();
  });

  it("resolve tenant pelo wa_number", async () => {
    const found = await tenants.findByWaNumber(WA_NUMBER);
    expect(found?.id).toBe(tenantId);
    expect(found?.waProvider).toBe("evolution");
  });

  it("wa_number desconhecido retorna null", async () => {
    const found = await tenants.findByWaNumber("0000000000000");
    expect(found).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
bun test packages/db/test/tenantRouting.test.ts
```
Expected: FAIL — `findByWaNumber is not a function` (method doesn't exist yet).

- [ ] **Step 3: Add the field + method to the port**

In `packages/core/src/ports/repositories.ts`, update `TenantRow` and `TenantRepository`:
```ts
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
```

- [ ] **Step 4: Implement in `PgTenantRepository`**

In `packages/db/src/repositories/tenantRepo.ts`, update `TenantDbRow`, `map`, and add the method:
```ts
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
```
(Keep the existing `import type { SQL } from "bun";`, `import type { TenantRepository, TenantRow } from "@sirvase/core";`, and `import { sql as defaultSql } from "../client.ts";` at the top of the file — unchanged.)

- [ ] **Step 5: Run the test to verify it passes**

```bash
bun test packages/db/test/tenantRouting.test.ts
```
Expected: PASS (2/2). If it prints "Postgres inacessível" and skips, run `bun run up` first (stack must be up for this integration test).

- [ ] **Step 6: Run the full suite + typecheck**

```bash
bun run typecheck
bun test
```
Expected: both green, including the existing `tenantIsolation.test.ts` (unaffected — it inserts bare tenants and relies on the new column's `DEFAULT`).

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/ports/repositories.ts packages/db/src/repositories/tenantRepo.ts packages/db/test/tenantRouting.test.ts
git commit -m "feat: TenantRepository.findByWaNumber (roteamento por wa_number)"
```

---

### Task 3: Redesign `WhatsAppProvider` port + retire `baileys-legacy`

**Files:**
- Modify: `packages/core/src/ports/whatsapp.ts`
- Delete: `packages/adapters/src/whatsapp/baileys-legacy/index.ts` (and the now-empty `baileys-legacy/` directory)
- Modify: `packages/adapters/src/index.ts`
- Modify: `packages/adapters/package.json`
- Modify: `package.json` (root)

**Interfaces:**
- Produces: `IncomingMessage { from: string; body: string; pushName?: string; isGroup: boolean; messageId: string }` and `WhatsAppProvider { parseWebhook(payload: unknown): IncomingMessage | null; sendText(to: string, text: string): Promise<void>; markAsRead(to: string, messageId: string): Promise<void> }` — Tasks 4, 5, 6 implement/consume this exact shape.

- [ ] **Step 1: Rewrite the port**

`packages/core/src/ports/whatsapp.ts`:
```ts
// Porta de WhatsApp — webhook + REST (Evolution, Cloud API). Nenhum SDK aqui;
// implementações reais em @sirvase/adapters. Não é mais o formato antigo em
// processo (initialize/onMessage/typing) herdado da migração do Baileys — esse
// modelo morreu com o Baileys (ver claude.md §4).
export interface IncomingMessage {
  from: string; // número do cliente, E.164 sem "+"
  body: string;
  pushName?: string;
  isGroup: boolean;
  messageId: string;
}

export interface WhatsAppProvider {
  /** Traduz o payload cru do webhook do provedor. `null` se não é mensagem de texto processável. */
  parseWebhook(payload: unknown): IncomingMessage | null;
  sendText(to: string, text: string): Promise<void>;
  markAsRead(to: string, messageId: string): Promise<void>;
}
```

- [ ] **Step 2: Run typecheck to verify it now fails (proves `baileys-legacy` depended on the old shape)**

```bash
bun run typecheck
```
Expected: FAIL — errors in `packages/adapters/src/whatsapp/baileys-legacy/index.ts` (e.g. `Class 'BaileysProvider' incorrectly implements interface 'WhatsAppProvider'`, missing `parseWebhook`/`sendText`/`markAsRead`, extra `initialize`/`onMessage`).

- [ ] **Step 3: Delete the legacy adapter**

```bash
rm -rf packages/adapters/src/whatsapp/baileys-legacy
```

- [ ] **Step 4: Remove its export from the adapters barrel**

In `packages/adapters/src/index.ts`, remove the `BaileysProvider` export line. The file becomes:
```ts
// Barrel de @sirvase/adapters — implementações das ports do core.
export { LLMModel } from "./llm/openrouter/legacyChutesModel.js";
```
(Tasks 4 and 5 add the new WhatsApp exports here.)

- [ ] **Step 5: Drop the now-unused Baileys deps**

In `packages/adapters/package.json`, remove `@whiskeysockets/baileys`, `@hapi/boom`, `qrcode-terminal`, and `pino` from `dependencies` (all four were only used by `baileys-legacy` — confirmed `legacyChutesModel.ts` uses `@sirvase/core`'s logger, not `pino`), and drop the `devDependencies` key entirely (only had `@types/qrcode-terminal`, now unused). Resulting file:
```json
{
  "name": "@sirvase/adapters",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "module": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./*": "./src/*"
  },
  "dependencies": {
    "@sirvase/core": "workspace:*",
    "openai": "^4.73.0"
  }
}
```

- [ ] **Step 6: Remove the now-unnecessary `libsignal` override**

In root `package.json`, remove the entire `overrides` block (it existed only to work around installing Baileys' `libsignal` git dependency via the snap-confined Bun — see `PROGRESSO_BUILD.md`'s own note: "Sai quando o Baileys for removido (Épico 4)"):
```json
{
  "name": "sirvase",
  "version": "0.1.0",
  "private": true,
  "description": "Sirvase — SaaS multi-tenant de atendimento e pedidos via WhatsApp (monorepo)",
  "type": "module",
  "workspaces": [
    "packages/*",
    "services/*"
  ],
  "engines": {
    "bun": ">=1.3.0"
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "bun test",
    "lint": "eslint .",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "dev:api": "bun run --hot services/api/src/index.ts",
    "dev:webhook": "bun run --hot services/webhook/src/index.ts",
    "dev:worker": "bun run --hot services/worker/src/index.ts",
    "up": "docker compose up -d",
    "down": "docker compose down",
    "logs": "docker compose logs -f",
    "db:dump": "bash scripts/db-dump.sh",
    "db:restore": "bash scripts/db-restore.sh",
    "db:migrate:up": "bun run packages/db/src/migrate.ts up",
    "db:migrate:down": "bun run packages/db/src/migrate.ts down",
    "db:migrate:status": "bun run packages/db/src/migrate.ts status",
    "db:seed": "bun run db/seed.ts"
  },
  "devDependencies": {
    "@types/bun": "^1.3.0",
    "@eslint/js": "^9.13.0",
    "typescript": "^5.6.3",
    "prettier": "^3.3.3",
    "eslint": "^9.13.0",
    "typescript-eslint": "^8.12.0"
  }
}
```

- [ ] **Step 7: Reinstall and verify green**

```bash
bun install
bun run typecheck
bun test
bun run lint
```
Expected: all green — `bun.lock` updated (Baileys/hapi/pino/qrcode-terminal/libsignal-override gone), no leftover references.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/ports/whatsapp.ts packages/adapters/src/index.ts packages/adapters/package.json package.json bun.lock
git add -u packages/adapters/src/whatsapp  # registra a remoção do diretório
git commit -m "refactor: WhatsAppProvider vira webhook+REST; aposenta baileys-legacy"
```

---

### Task 4: `EvolutionApiProvider implements WhatsAppProvider`

**Files:**
- Create: `packages/adapters/src/whatsapp/evolution/index.ts`
- Create: `packages/adapters/test/evolution.test.ts`
- Modify: `packages/adapters/src/index.ts`

**Interfaces:**
- Consumes: `IncomingMessage`, `WhatsAppProvider` from Task 3.
- Produces: `extractInstanceName(payload: unknown): string | null`, `parseEvolutionWebhook(payload: unknown): IncomingMessage | null`, `class EvolutionApiProvider(apiUrl: string, apiKey: string, instanceName: string) implements WhatsAppProvider` — Task 6's router calls `extractInstanceName` for routing and constructs `EvolutionApiProvider` per-tenant.

- [ ] **Step 1: Write the failing tests**

`packages/adapters/test/evolution.test.ts`:
```ts
import { describe, expect, test } from "bun:test";
import { extractInstanceName, parseEvolutionWebhook } from "../src/whatsapp/evolution/index.ts";

const TEXT_PAYLOAD = {
  event: "messages.upsert",
  instance: "5511999990001",
  data: {
    key: { remoteJid: "5511888887777@s.whatsapp.net", fromMe: false, id: "3EB0C767D097E9ECFE" },
    pushName: "Cliente Teste",
    message: { conversation: "Oi, quero um lanche" },
    messageType: "conversation"
  }
};

describe("EvolutionApiProvider — parseWebhook", () => {
  test("extrai mensagem de texto simples", () => {
    const msg = parseEvolutionWebhook(TEXT_PAYLOAD);
    expect(msg).toEqual({
      from: "5511888887777",
      body: "Oi, quero um lanche",
      pushName: "Cliente Teste",
      isGroup: false,
      messageId: "3EB0C767D097E9ECFE"
    });
  });

  test("ignora eco do próprio bot (fromMe: true)", () => {
    const payload = {
      ...TEXT_PAYLOAD,
      data: { ...TEXT_PAYLOAD.data, key: { ...TEXT_PAYLOAD.data.key, fromMe: true } }
    };
    expect(parseEvolutionWebhook(payload)).toBeNull();
  });

  test("identifica mensagem de grupo pelo sufixo @g.us", () => {
    const payload = {
      ...TEXT_PAYLOAD,
      data: {
        ...TEXT_PAYLOAD.data,
        key: { ...TEXT_PAYLOAD.data.key, remoteJid: "120363000000@g.us" }
      }
    };
    expect(parseEvolutionWebhook(payload)?.isGroup).toBe(true);
  });

  test("ignora evento que não é messages.upsert", () => {
    expect(parseEvolutionWebhook({ ...TEXT_PAYLOAD, event: "connection.update" })).toBeNull();
  });

  test("ignora mensagem sem corpo de texto (ex: mídia)", () => {
    const payload = { ...TEXT_PAYLOAD, data: { ...TEXT_PAYLOAD.data, message: {} } };
    expect(parseEvolutionWebhook(payload)).toBeNull();
  });
});

describe("EvolutionApiProvider — extractInstanceName", () => {
  test("extrai o nome da instância (= wa_number do tenant)", () => {
    expect(extractInstanceName(TEXT_PAYLOAD)).toBe("5511999990001");
  });

  test("payload inválido retorna null", () => {
    expect(extractInstanceName(null)).toBeNull();
    expect(extractInstanceName("string qualquer")).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
bun test packages/adapters/test/evolution.test.ts
```
Expected: FAIL — module `../src/whatsapp/evolution/index.ts` doesn't exist.

- [ ] **Step 3: Implement the adapter**

`packages/adapters/src/whatsapp/evolution/index.ts`:
```ts
// Adapter Evolution API — self-hosted, webhook+REST. Nome da instância = tenants.wa_number
// (decisão registrada em claude.md §4): resolve tenant é sempre "instance === wa_number".
import type { IncomingMessage, WhatsAppProvider } from "@sirvase/core";

interface EvolutionKey {
  remoteJid?: string;
  fromMe?: boolean;
  id?: string;
}

interface EvolutionMessageContent {
  conversation?: string;
  extendedTextMessage?: { text?: string };
}

interface EvolutionWebhookPayload {
  event?: string;
  instance?: string;
  data?: {
    key?: EvolutionKey;
    pushName?: string;
    message?: EvolutionMessageContent;
    messageType?: string;
  };
}

function isEvolutionPayload(payload: unknown): payload is EvolutionWebhookPayload {
  return typeof payload === "object" && payload !== null;
}

/** Extrai o número do remoteJid ("5511...@s.whatsapp.net" ou "...@g.us"), sem o sufixo. */
function stripJidSuffix(jid: string): string {
  return jid.split("@")[0] ?? jid;
}

/** Nome da instância = wa_number do tenant (decisão de roteamento única pros 2 provedores). */
export function extractInstanceName(payload: unknown): string | null {
  if (!isEvolutionPayload(payload)) return null;
  return payload.instance ?? null;
}

export function parseEvolutionWebhook(payload: unknown): IncomingMessage | null {
  if (!isEvolutionPayload(payload)) return null;
  if (payload.event !== "messages.upsert") return null;

  const key = payload.data?.key;
  if (!key?.remoteJid || !key.id) return null;
  if (key.fromMe) return null; // eco do próprio bot, não é mensagem de cliente

  const message = payload.data?.message;
  const body = message?.conversation ?? message?.extendedTextMessage?.text;
  if (!body) return null; // mídia/áudio/outros tipos: fora de escopo (YAGNI)

  return {
    from: stripJidSuffix(key.remoteJid),
    body,
    pushName: payload.data?.pushName,
    isGroup: key.remoteJid.endsWith("@g.us"),
    messageId: key.id
  };
}

export class EvolutionApiProvider implements WhatsAppProvider {
  constructor(
    private readonly apiUrl: string,
    private readonly apiKey: string,
    private readonly instanceName: string
  ) {}

  parseWebhook(payload: unknown): IncomingMessage | null {
    return parseEvolutionWebhook(payload);
  }

  async sendText(to: string, text: string): Promise<void> {
    const res = await fetch(`${this.apiUrl}/message/sendText/${this.instanceName}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: this.apiKey },
      body: JSON.stringify({ number: to, text })
    });
    if (!res.ok) {
      throw new Error(`Evolution sendText falhou (${res.status}): ${await res.text()}`);
    }
  }

  async markAsRead(to: string, messageId: string): Promise<void> {
    const res = await fetch(`${this.apiUrl}/chat/markMessageAsRead/${this.instanceName}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: this.apiKey },
      body: JSON.stringify({
        readMessages: [{ remoteJid: `${to}@s.whatsapp.net`, id: messageId, fromMe: false }]
      })
    });
    if (!res.ok) {
      throw new Error(`Evolution markAsRead falhou (${res.status}): ${await res.text()}`);
    }
  }
}
```

> Nota pra quem for testar contra a Evolution real: os paths `/message/sendText/{instance}` e `/chat/markMessageAsRead/{instance}` são os da Evolution API v2. Se a versão da instância na VPS divergir, confira o Swagger em `{EVOLUTION_API_URL}/docs` e ajuste os paths/corpo aqui.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
bun test packages/adapters/test/evolution.test.ts
```
Expected: PASS (7/7).

- [ ] **Step 5: Export from the adapters barrel**

In `packages/adapters/src/index.ts`, add:
```ts
export { LLMModel } from "./llm/openrouter/legacyChutesModel.js";
export {
  EvolutionApiProvider,
  extractInstanceName,
  parseEvolutionWebhook
} from "./whatsapp/evolution/index.js";
```

- [ ] **Step 6: Full suite + typecheck**

```bash
bun run typecheck
bun test
```
Expected: green.

- [ ] **Step 7: Commit**

```bash
git add packages/adapters/src/whatsapp/evolution/index.ts packages/adapters/test/evolution.test.ts packages/adapters/src/index.ts
git commit -m "feat: EvolutionApiProvider implements WhatsAppProvider"
```

---

### Task 5: `CloudApiProvider implements WhatsAppProvider`

**Files:**
- Create: `packages/adapters/src/whatsapp/cloud-api/index.ts`
- Create: `packages/adapters/test/cloudApi.test.ts`
- Modify: `packages/adapters/src/index.ts`

**Interfaces:**
- Consumes: `IncomingMessage`, `WhatsAppProvider` from Task 3.
- Produces: `extractPhoneNumberId(payload: unknown): string | null`, `parseCloudApiWebhook(payload: unknown): IncomingMessage | null`, `verifyMetaSignature(rawBody: string, signatureHeader: string | null, appSecret: string): Promise<boolean>`, `class CloudApiProvider(accessToken: string, phoneNumberId: string, graphVersion: string) implements WhatsAppProvider` — Task 6's router uses all four exactly as named here.

- [ ] **Step 1: Write the failing tests**

`packages/adapters/test/cloudApi.test.ts`:
```ts
import { describe, expect, test } from "bun:test";
import {
  extractPhoneNumberId,
  parseCloudApiWebhook,
  verifyMetaSignature
} from "../src/whatsapp/cloud-api/index.ts";

const TEXT_PAYLOAD = {
  entry: [
    {
      changes: [
        {
          value: {
            metadata: { phone_number_id: "123456789012345", display_phone_number: "5511999999999" },
            contacts: [{ profile: { name: "Cliente Teste" } }],
            messages: [
              {
                from: "5511888887777",
                id: "wamid.ABC123",
                type: "text",
                text: { body: "Oi, quero um lanche" }
              }
            ]
          }
        }
      ]
    }
  ]
};

describe("CloudApiProvider — parseWebhook", () => {
  test("extrai mensagem de texto", () => {
    expect(parseCloudApiWebhook(TEXT_PAYLOAD)).toEqual({
      from: "5511888887777",
      body: "Oi, quero um lanche",
      pushName: "Cliente Teste",
      isGroup: false,
      messageId: "wamid.ABC123"
    });
  });

  test("ignora mensagem que não é texto (ex: imagem)", () => {
    const payload = {
      entry: [
        { changes: [{ value: { messages: [{ from: "5511888887777", id: "x", type: "image" }] } }] }
      ]
    };
    expect(parseCloudApiWebhook(payload)).toBeNull();
  });

  test("payload sem mensagens (ex: status update) retorna null", () => {
    expect(parseCloudApiWebhook({ entry: [{ changes: [{ value: {} }] }] })).toBeNull();
  });
});

describe("CloudApiProvider — extractPhoneNumberId", () => {
  test("extrai o phone_number_id", () => {
    expect(extractPhoneNumberId(TEXT_PAYLOAD)).toBe("123456789012345");
  });

  test("payload inválido retorna null", () => {
    expect(extractPhoneNumberId(null)).toBeNull();
  });
});

describe("CloudApiProvider — verifyMetaSignature", () => {
  const APP_SECRET = "segredo-de-teste";

  test("aceita assinatura válida", async () => {
    const body = JSON.stringify({ hello: "world" });
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(APP_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const sigBytes = new Uint8Array(
      await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body))
    );
    const hex = Array.from(sigBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    expect(await verifyMetaSignature(body, `sha256=${hex}`, APP_SECRET)).toBe(true);
  });

  test("rejeita assinatura errada", async () => {
    expect(await verifyMetaSignature("{}", "sha256=deadbeef", APP_SECRET)).toBe(false);
  });

  test("rejeita header ausente", async () => {
    expect(await verifyMetaSignature("{}", null, APP_SECRET)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
bun test packages/adapters/test/cloudApi.test.ts
```
Expected: FAIL — module `../src/whatsapp/cloud-api/index.ts` doesn't exist.

- [ ] **Step 3: Implement the adapter**

`packages/adapters/src/whatsapp/cloud-api/index.ts`:
```ts
// Adapter Meta Cloud API — webhook+REST via Graph API. Pronto, mas não ativo até o
// app da Meta aprovar (ver claude.md §4 / PLANO_EXECUCAO.md Épico 4).
import type { IncomingMessage, WhatsAppProvider } from "@sirvase/core";

interface CloudApiMessage {
  from?: string;
  id?: string;
  type?: string;
  text?: { body?: string };
}

interface CloudApiPayload {
  entry?: Array<{
    changes?: Array<{
      value?: {
        metadata?: { phone_number_id?: string; display_phone_number?: string };
        contacts?: Array<{ profile?: { name?: string } }>;
        messages?: CloudApiMessage[];
      };
    }>;
  }>;
}

function isCloudApiPayload(payload: unknown): payload is CloudApiPayload {
  return typeof payload === "object" && payload !== null;
}

/** phone_number_id — chave técnica exigida pela Graph API; usada aqui como chave de rota. */
export function extractPhoneNumberId(payload: unknown): string | null {
  if (!isCloudApiPayload(payload)) return null;
  return payload.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id ?? null;
}

export function parseCloudApiWebhook(payload: unknown): IncomingMessage | null {
  if (!isCloudApiPayload(payload)) return null;
  const value = payload.entry?.[0]?.changes?.[0]?.value;
  const msg = value?.messages?.[0];
  if (!msg || msg.type !== "text" || !msg.from || !msg.id || !msg.text?.body) return null;

  return {
    from: msg.from,
    body: msg.text.body,
    pushName: value?.contacts?.[0]?.profile?.name,
    isGroup: false, // Cloud API não expõe conversas de grupo pro bot
    messageId: msg.id
  };
}

const encoder = new TextEncoder();

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(Math.floor(hex.length / 2));
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/** Valida X-Hub-Signature-256 (HMAC-SHA256 do corpo cru, comparação constant-time). */
export async function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string
): Promise<boolean> {
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const signatureBytes = hexToBytes(signatureHeader.slice("sha256=".length));
  return crypto.subtle.verify("HMAC", key, signatureBytes, encoder.encode(rawBody));
}

export class CloudApiProvider implements WhatsAppProvider {
  constructor(
    private readonly accessToken: string,
    private readonly phoneNumberId: string,
    private readonly graphVersion: string
  ) {}

  parseWebhook(payload: unknown): IncomingMessage | null {
    return parseCloudApiWebhook(payload);
  }

  async sendText(to: string, text: string): Promise<void> {
    const res = await fetch(
      `https://graph.facebook.com/${this.graphVersion}/${this.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: { body: text }
        })
      }
    );
    if (!res.ok) {
      throw new Error(`Graph API sendText falhou (${res.status}): ${await res.text()}`);
    }
  }

  async markAsRead(_to: string, messageId: string): Promise<void> {
    const res = await fetch(
      `https://graph.facebook.com/${this.graphVersion}/${this.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          status: "read",
          message_id: messageId
        })
      }
    );
    if (!res.ok) {
      throw new Error(`Graph API markAsRead falhou (${res.status}): ${await res.text()}`);
    }
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
bun test packages/adapters/test/cloudApi.test.ts
```
Expected: PASS (8/8).

- [ ] **Step 5: Export from the adapters barrel**

`packages/adapters/src/index.ts` becomes:
```ts
export { LLMModel } from "./llm/openrouter/legacyChutesModel.js";
export {
  EvolutionApiProvider,
  extractInstanceName,
  parseEvolutionWebhook
} from "./whatsapp/evolution/index.js";
export {
  CloudApiProvider,
  extractPhoneNumberId,
  parseCloudApiWebhook,
  verifyMetaSignature
} from "./whatsapp/cloud-api/index.js";
```

- [ ] **Step 6: Full suite + typecheck**

```bash
bun run typecheck
bun test
```
Expected: green.

- [ ] **Step 7: Commit**

```bash
git add packages/adapters/src/whatsapp/cloud-api/index.ts packages/adapters/test/cloudApi.test.ts packages/adapters/src/index.ts
git commit -m "feat: CloudApiProvider implements WhatsAppProvider (pronto, não ativo)"
```

---

### Task 6: `services/webhook` — two routes, real routing, echo

**Files:**
- Create: `services/webhook/src/router.ts`
- Modify: `services/webhook/src/index.ts` (full rewrite)
- Modify: `services/webhook/package.json`
- Create: `services/webhook/test/router.test.ts`

**Interfaces:**
- Consumes: `TenantRepository`/`WhatsAppProvider`/`IncomingMessage`/`TenantRow` (`@sirvase/core`), `extractInstanceName`/`extractPhoneNumberId`/`verifyMetaSignature`/`EvolutionApiProvider`/`CloudApiProvider` (`@sirvase/adapters`), `PgTenantRepository` (`@sirvase/db`).
- Produces: `createRouter(deps: RouterDeps): (req: Request) => Promise<Response>` with `RouterDeps { tenants: TenantRepository; makeEvolutionProvider: (instanceName: string) => WhatsAppProvider; makeCloudApiProvider: (phoneNumberId: string) => WhatsAppProvider; metaVerifyToken?: string; metaAppSecret?: string; evolutionWebhookToken?: string }`.

- [ ] **Step 1: Write the failing tests**

`services/webhook/test/router.test.ts`:
```ts
import { describe, expect, test } from "bun:test";
import type { IncomingMessage, TenantRepository, TenantRow, WhatsAppProvider } from "@sirvase/core";
import { createRouter } from "../src/router.ts";

function fakeTenant(overrides: Partial<TenantRow> = {}): TenantRow {
  return {
    id: "tenant-1",
    storeName: "Loja Teste",
    storeType: null,
    catalogApiUrl: null,
    pixKey: null,
    systemPromptPersonality: null,
    config: {},
    active: true,
    waNumber: "5511999990001",
    waProvider: "evolution",
    waPhoneNumberId: null,
    wabaId: null,
    status: "trial",
    plan: null,
    cardapioSource: "internal",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  };
}

class FakeTenantRepository implements TenantRepository {
  constructor(private readonly tenant: TenantRow | null) {}
  async findById(): Promise<TenantRow | null> {
    return this.tenant;
  }
  async findByPhoneNumberId(id: string): Promise<TenantRow | null> {
    return this.tenant?.waPhoneNumberId === id ? this.tenant : null;
  }
  async findByWaNumber(waNumber: string): Promise<TenantRow | null> {
    return this.tenant?.waNumber === waNumber ? this.tenant : null;
  }
}

class FakeProvider implements WhatsAppProvider {
  public sent: Array<{ to: string; text: string }> = [];
  constructor(private readonly fixedMessage: IncomingMessage | null) {}
  parseWebhook(): IncomingMessage | null {
    return this.fixedMessage;
  }
  async sendText(to: string, text: string): Promise<void> {
    this.sent.push({ to, text });
  }
  async markAsRead(): Promise<void> {}
}

const INCOMING: IncomingMessage = {
  from: "5511888887777",
  body: "Oi, quero um lanche",
  isGroup: false,
  messageId: "msg-1"
};

describe("webhook router — Evolution", () => {
  test("token correto + instância conhecida: eco enviado", async () => {
    const provider = new FakeProvider(INCOMING);
    const handle = createRouter({
      tenants: new FakeTenantRepository(fakeTenant()),
      makeEvolutionProvider: () => provider,
      makeCloudApiProvider: () => new FakeProvider(null),
      evolutionWebhookToken: "token-secreto"
    });

    const res = await handle(
      new Request("http://webhook.test/webhook/evolution?token=token-secreto", {
        method: "POST",
        body: JSON.stringify({ event: "messages.upsert", instance: "5511999990001" })
      })
    );

    expect(res.status).toBe(200);
    expect(provider.sent).toEqual([{ to: "5511888887777", text: "eco: Oi, quero um lanche" }]);
  });

  test("token errado: 401 e nada enviado", async () => {
    const provider = new FakeProvider(INCOMING);
    const handle = createRouter({
      tenants: new FakeTenantRepository(fakeTenant()),
      makeEvolutionProvider: () => provider,
      makeCloudApiProvider: () => new FakeProvider(null),
      evolutionWebhookToken: "token-secreto"
    });

    const res = await handle(
      new Request("http://webhook.test/webhook/evolution?token=errado", {
        method: "POST",
        body: JSON.stringify({ event: "messages.upsert", instance: "5511999990001" })
      })
    );

    expect(res.status).toBe(401);
    expect(provider.sent).toEqual([]);
  });

  test("instância desconhecida: 200 (evita retry) mas nada enviado", async () => {
    const provider = new FakeProvider(INCOMING);
    const handle = createRouter({
      tenants: new FakeTenantRepository(null),
      makeEvolutionProvider: () => provider,
      makeCloudApiProvider: () => new FakeProvider(null),
      evolutionWebhookToken: "token-secreto"
    });

    const res = await handle(
      new Request("http://webhook.test/webhook/evolution?token=token-secreto", {
        method: "POST",
        body: JSON.stringify({ event: "messages.upsert", instance: "instancia-desconhecida" })
      })
    );

    expect(res.status).toBe(200);
    expect(provider.sent).toEqual([]);
  });
});

describe("webhook router — Meta", () => {
  test("GET verify: token certo devolve o challenge", async () => {
    const handle = createRouter({
      tenants: new FakeTenantRepository(null),
      makeEvolutionProvider: () => new FakeProvider(null),
      makeCloudApiProvider: () => new FakeProvider(null),
      metaVerifyToken: "verify-123"
    });

    const res = await handle(
      new Request(
        "http://webhook.test/webhook/meta?hub.mode=subscribe&hub.verify_token=verify-123&hub.challenge=abc"
      )
    );

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("abc");
  });

  test("GET verify: token errado devolve 403", async () => {
    const handle = createRouter({
      tenants: new FakeTenantRepository(null),
      makeEvolutionProvider: () => new FakeProvider(null),
      makeCloudApiProvider: () => new FakeProvider(null),
      metaVerifyToken: "verify-123"
    });

    const res = await handle(
      new Request(
        "http://webhook.test/webhook/meta?hub.mode=subscribe&hub.verify_token=errado&hub.challenge=abc"
      )
    );

    expect(res.status).toBe(403);
  });

  test("POST sem assinatura válida: 403 e nada enviado", async () => {
    const provider = new FakeProvider(INCOMING);
    const handle = createRouter({
      tenants: new FakeTenantRepository(fakeTenant({ waPhoneNumberId: "123456789012345" })),
      makeEvolutionProvider: () => new FakeProvider(null),
      makeCloudApiProvider: () => provider,
      metaAppSecret: "app-secret-teste"
    });

    const res = await handle(
      new Request("http://webhook.test/webhook/meta", {
        method: "POST",
        headers: { "X-Hub-Signature-256": "sha256=deadbeef" },
        body: JSON.stringify({
          entry: [{ changes: [{ value: { metadata: { phone_number_id: "123456789012345" } } }] }]
        })
      })
    );

    expect(res.status).toBe(403);
    expect(provider.sent).toEqual([]);
  });

  test("POST com assinatura válida + tenant conhecido: eco enviado", async () => {
    const provider = new FakeProvider(INCOMING);
    const appSecret = "app-secret-teste";
    const body = JSON.stringify({
      entry: [{ changes: [{ value: { metadata: { phone_number_id: "123456789012345" } } }] }]
    });
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(appSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const sigBytes = new Uint8Array(
      await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body))
    );
    const hex = Array.from(sigBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const handle = createRouter({
      tenants: new FakeTenantRepository(fakeTenant({ waPhoneNumberId: "123456789012345" })),
      makeEvolutionProvider: () => new FakeProvider(null),
      makeCloudApiProvider: () => provider,
      metaAppSecret: appSecret
    });

    const res = await handle(
      new Request("http://webhook.test/webhook/meta", {
        method: "POST",
        headers: { "X-Hub-Signature-256": `sha256=${hex}` },
        body
      })
    );

    expect(res.status).toBe(200);
    expect(provider.sent).toEqual([{ to: "5511888887777", text: "eco: Oi, quero um lanche" }]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
bun test services/webhook/test/router.test.ts
```
Expected: FAIL — `../src/router.ts` doesn't exist yet.

- [ ] **Step 3: Write the router**

`services/webhook/src/router.ts`:
```ts
// Router HTTP do webhook. Handler puro `(req) => Response` com deps injetadas — mesmo
// padrão do services/api/src/router.ts. Duas rotas fixas, uma por provedor; o pipeline
// real (fila/dedup/LLM) chega nos Épicos 2/3/5 — por ora, eco de volta (mesma casca que
// já existia só pra Meta, estendida pros dois provedores).
import type { TenantRepository, WhatsAppProvider } from "@sirvase/core";
import { logger } from "@sirvase/core";
import { extractInstanceName, extractPhoneNumberId, verifyMetaSignature } from "@sirvase/adapters";

export interface RouterDeps {
  tenants: TenantRepository;
  makeEvolutionProvider: (instanceName: string) => WhatsAppProvider;
  makeCloudApiProvider: (phoneNumberId: string) => WhatsAppProvider;
  metaVerifyToken?: string;
  metaAppSecret?: string;
  evolutionWebhookToken?: string;
}

function text(body: string, status = 200): Response {
  return new Response(body, { status });
}

export function createRouter(deps: RouterDeps) {
  return async function handle(req: Request): Promise<Response> {
    const url = new URL(req.url);

    if (req.method === "GET" && url.pathname === "/webhook/meta") {
      return handleMetaVerify(url, deps);
    }
    if (req.method === "POST" && url.pathname === "/webhook/meta") {
      return handleMetaMessage(req, deps);
    }
    if (req.method === "POST" && url.pathname === "/webhook/evolution") {
      return handleEvolutionMessage(req, url, deps);
    }

    return text("Not Found", 404);
  };
}

function handleMetaVerify(url: URL, deps: RouterDeps): Response {
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  if (mode === "subscribe" && token && token === deps.metaVerifyToken) {
    logger.info("webhook: verificação Meta OK");
    return text(challenge ?? "");
  }
  logger.warn("webhook: verificação Meta recusada (token não confere)");
  return text("Forbidden", 403);
}

async function handleMetaMessage(req: Request, deps: RouterDeps): Promise<Response> {
  const raw = await req.text();
  const signature = req.headers.get("X-Hub-Signature-256");
  if (!deps.metaAppSecret || !(await verifyMetaSignature(raw, signature, deps.metaAppSecret))) {
    logger.warn("webhook: assinatura Meta inválida");
    return text("Forbidden", 403);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return text("Bad Request", 400);
  }

  const phoneNumberId = extractPhoneNumberId(payload);
  if (!phoneNumberId) {
    logger.warn("webhook: payload Meta sem phone_number_id");
    return text("EVENT_RECEIVED"); // sempre 200 p/ Meta não reentregar
  }

  const tenant = await deps.tenants.findByPhoneNumberId(phoneNumberId);
  if (!tenant) {
    logger.warn("webhook: phone_number_id desconhecido, descartado", { phoneNumberId });
    return text("EVENT_RECEIVED");
  }

  const provider = deps.makeCloudApiProvider(phoneNumberId);
  const msg = provider.parseWebhook(payload);
  if (msg) {
    logger.info("webhook: mensagem Meta recebida", { tenantId: tenant.id, from: msg.from });
    await provider.sendText(msg.from, `eco: ${msg.body}`);
  }

  return text("EVENT_RECEIVED");
}

async function handleEvolutionMessage(req: Request, url: URL, deps: RouterDeps): Promise<Response> {
  const token = url.searchParams.get("token");
  if (!deps.evolutionWebhookToken || token !== deps.evolutionWebhookToken) {
    logger.warn("webhook: token Evolution inválido");
    return text("Unauthorized", 401);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(await req.text());
  } catch {
    return text("Bad Request", 400);
  }

  const instanceName = extractInstanceName(payload);
  if (!instanceName) {
    logger.warn("webhook: payload Evolution sem instance");
    return text("EVENT_RECEIVED");
  }

  const tenant = await deps.tenants.findByWaNumber(instanceName);
  if (!tenant) {
    logger.warn("webhook: instância Evolution desconhecida, descartada", { instanceName });
    return text("EVENT_RECEIVED");
  }

  const provider = deps.makeEvolutionProvider(instanceName);
  const msg = provider.parseWebhook(payload);
  if (msg) {
    logger.info("webhook: mensagem Evolution recebida", { tenantId: tenant.id, from: msg.from });
    await provider.sendText(msg.from, `eco: ${msg.body}`);
  }

  return text("EVENT_RECEIVED");
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
bun test services/webhook/test/router.test.ts
```
Expected: PASS (7/7).

- [ ] **Step 5: Add the missing workspace deps**

In `services/webhook/package.json`, add `@sirvase/adapters` and `@sirvase/db`:
```json
{
  "name": "@sirvase/webhook",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "bun run src/index.ts",
    "dev": "bun run --hot src/index.ts"
  },
  "dependencies": {
    "@sirvase/config": "workspace:*",
    "@sirvase/core": "workspace:*",
    "@sirvase/adapters": "workspace:*",
    "@sirvase/db": "workspace:*"
  }
}
```

- [ ] **Step 6: Rewrite the entrypoint wiring**

`services/webhook/src/index.ts` (full replace):
```ts
// Entrypoint do serviço Webhook. Duas rotas fixas — Evolution ativa, Cloud API pronta —
// ver claude.md §4 e PLANO_EXECUCAO.md Épico 4. Wiring real: repo Postgres + adapters
// reais. Ainda casca de eco (sem fila/LLM) — pipeline completo chega nos Épicos 2/3/5.
import { settings } from "@sirvase/config";
import { logger } from "@sirvase/core";
import { CloudApiProvider, EvolutionApiProvider } from "@sirvase/adapters";
import { PgTenantRepository } from "@sirvase/db";
import { createRouter } from "./router.ts";

const PORT = 3001;

if (!settings.evolution.apiUrl || !settings.evolution.apiKey) {
  logger.warn(
    "webhook: EVOLUTION_API_URL/EVOLUTION_API_KEY ausentes — sendText da Evolution vai falhar"
  );
}
if (!settings.whatsapp.accessToken) {
  logger.warn(
    "webhook: WHATSAPP_ACCESS_TOKEN ausente — sendText da Meta vai falhar (esperado até o app aprovar)"
  );
}

const handle = createRouter({
  tenants: new PgTenantRepository(),
  makeEvolutionProvider: (instanceName) =>
    new EvolutionApiProvider(
      settings.evolution.apiUrl ?? "",
      settings.evolution.apiKey ?? "",
      instanceName
    ),
  makeCloudApiProvider: (phoneNumberId) =>
    new CloudApiProvider(
      settings.whatsapp.accessToken ?? "",
      phoneNumberId,
      settings.whatsapp.graphVersion
    ),
  metaVerifyToken: settings.whatsapp.verifyToken,
  metaAppSecret: settings.whatsapp.appSecret,
  evolutionWebhookToken: settings.evolution.webhookToken
});

const server = Bun.serve({ port: PORT, fetch: handle });

logger.info(`webhook ouvindo em http://localhost:${server.port}`);
```
(This references `settings.evolution.*` — added in Task 7. Typecheck for this task passes once Task 7's settings change lands; if running Task 6 in isolation, `bun run typecheck` will show `Property 'evolution' does not exist on type 'Settings'` until Task 7 is done. Do Task 7 immediately after this one, or reorder if executing out of sequence.)

- [ ] **Step 7: Install + full verification**

```bash
bun install
bun run typecheck    # will fail until Task 7 adds settings.evolution — see note above
bun test
```

- [ ] **Step 8: Commit**

```bash
git add services/webhook/src/router.ts services/webhook/src/index.ts services/webhook/package.json services/webhook/test/router.test.ts bun.lock
git commit -m "feat: webhook router com rotas /webhook/evolution e /webhook/meta"
```

---

### Task 7: Evolution API — local Docker container + config wiring

**Files:**
- Modify: `.env.example`
- Modify: `packages/config/src/settings.ts`
- Modify: `config/orchestration/compose.local.yaml`
- Modify: `config/orchestration/README.md`

**Interfaces:**
- Produces: `settings.evolution.{apiUrl, apiKey, webhookToken}` — consumed by Task 6's `services/webhook/src/index.ts`.

- [ ] **Step 1: Add env vars to `.env.example`**

Append after the `WHATSAPP_GRAPH_VERSION` line:
```
# --- Evolution API (Épico 4 — provedor ativo agora) ------------------------
EVOLUTION_API_URL=http://evolution:8080     # local: nome do serviço Docker; produção: URL da Evolution na VPS
EVOLUTION_API_KEY=                          # OBRIGATÓRIO p/ rodar Evolution local (AUTHENTICATION_API_KEY dela) e p/ chamar a REST dela
EVOLUTION_WEBHOOK_TOKEN=                     # OBRIGATÓRIO — valida POST /webhook/evolution (ela não assina payload como a Meta)
```

- [ ] **Step 2: Add the settings fields**

In `packages/config/src/settings.ts`, add to `envSchema` (right after `WHATSAPP_GRAPH_VERSION`):
```ts
  WHATSAPP_GRAPH_VERSION: z.string().default("v22.0"),
  EVOLUTION_API_URL: z.string().url().optional(),
  EVOLUTION_API_KEY: z.string().optional(),
  EVOLUTION_WEBHOOK_TOKEN: z.string().optional(),
  ASAAS_API_KEY: z.string().optional()
```
And add to the returned object in `build()`, right after the `whatsapp` block:
```ts
    whatsapp: Object.freeze({
      verifyToken: env.WHATSAPP_VERIFY_TOKEN,
      appSecret: env.WHATSAPP_APP_SECRET,
      accessToken: env.WHATSAPP_ACCESS_TOKEN,
      phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID,
      graphVersion: env.WHATSAPP_GRAPH_VERSION
    }),

    evolution: Object.freeze({
      apiUrl: env.EVOLUTION_API_URL,
      apiKey: env.EVOLUTION_API_KEY,
      webhookToken: env.EVOLUTION_WEBHOOK_TOKEN
    }),
```

- [ ] **Step 3: Verify config loads**

```bash
bun run typecheck
bun -e "import { settings } from '@sirvase/config'; console.log(settings.evolution)"
```
Expected: typecheck green (this resolves Task 6's pending `settings.evolution` reference); the one-liner prints `{ apiUrl: undefined, apiKey: undefined, webhookToken: undefined }` when unset in your shell env (matches the optional/fail-soft pattern already used for `WHATSAPP_*`).

- [ ] **Step 4: Add the local-only Evolution service to compose**

In `config/orchestration/compose.local.yaml`:
```yaml
# Overrides do ambiente LOCAL. Expõe pg/redis no loopback do host p/ debug
# (psql/redis-cli direto). Portas altas p/ não colidir com serviços nativos do
# host (ex.: um Postgres em 5432). Nunca expor assim em staging/prod.
#
# `evolution`: Evolution API self-hosted SÓ em dev (nunca staging/prod — produção usa
# a instância já existente na VPS do usuário). Reaproveita o Postgres/Redis do stack
# (banco `evolution` dedicado, índice Redis /1 — dado dela, não é multi-tenant nosso).
# Webhook já sai configurado pra rede interna Docker (http://webhook:3001/...) — sem
# domínio público nem túnel. Passo único antes do primeiro `up`: criar o banco
# `evolution` no Postgres (ver config/orchestration/README.md).
services:
  postgres:
    ports:
      - "127.0.0.1:15432:5432"
  redis:
    ports:
      - "127.0.0.1:16379:6379"
  api:
    environment:
      LOG_LEVEL: debug
  evolution:
    image: atendai/evolution-api:v2.2.3
    environment:
      AUTHENTICATION_API_KEY: ${EVOLUTION_API_KEY:?EVOLUTION_API_KEY é obrigatório pra subir a Evolution local}
      DATABASE_ENABLED: "true"
      DATABASE_PROVIDER: postgresql
      DATABASE_CONNECTION_URI: postgresql://${POSTGRES_USER:-sirvase}:${POSTGRES_PASSWORD}@postgres:5432/evolution
      CACHE_REDIS_ENABLED: "true"
      CACHE_REDIS_URI: redis://:${REDIS_PASSWORD}@redis:6379/1
      CACHE_REDIS_PREFIX_KEY: evolution
      WEBHOOK_GLOBAL_ENABLED: "true"
      WEBHOOK_GLOBAL_URL: http://webhook:3001/webhook/evolution?token=${EVOLUTION_WEBHOOK_TOKEN}
      WEBHOOK_EVENTS_MESSAGES_UPSERT: "true"
    ports:
      - "127.0.0.1:8081:8080"
    volumes:
      - evolutiondata:/evolution/instances
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped

volumes:
  evolutiondata:
```

- [ ] **Step 5: Document the one-time DB creation step + local flow**

In `config/orchestration/README.md`, add a new section after "Expor o webhook do Meta em dev (cloudflared)":
```markdown

## Evolution API local (dev) — sem túnel, sem VPS
`ENVIRONMENT=local` sobe um container `evolution` (self-hosted) na mesma rede Docker do
`webhook` — o webhook dela já sai configurado por env var pra
`http://webhook:3001/webhook/evolution?token=$EVOLUTION_WEBHOOK_TOKEN`, sem precisar de
domínio público nem túnel. Reaproveita o Postgres/Redis do stack (banco `evolution`
dedicado, índice Redis `/1`) — não é dado multi-tenant nosso.

**Passo único** (banco `evolution` não existe ainda no volume `pgdata`):
```bash
docker compose exec postgres psql -U ${POSTGRES_USER:-sirvase} -d ${POSTGRES_DB:-sirvase} \
  -c "CREATE DATABASE evolution;"
```

Depois `docker compose up -d evolution`, abra `http://127.0.0.1:8081` (manager), crie uma
instância com nome **igual ao `wa_number` do tenant de teste** (ver `db/seed.ts`), e
escaneie o QR com o número de teste. Trocar de máquina de desenvolvimento exige repetir
o QR — a sessão não roda em duas instâncias Evolution ao mesmo tempo.

Produção real usa a Evolution já existente na VPS do usuário — instância nova e isolada,
nunca a que atende produção via n8n. Decisão completa em `claude.md §4` e
`PLANO_EXECUCAO.md` Épico 4.
```

- [ ] **Step 6: Verify the compose merges cleanly**

```bash
ENVIRONMENT=local INGRESS_MODE=loopback docker compose config --quiet
ENVIRONMENT=local INGRESS_MODE=loopback docker compose config | grep -A5 "^  evolution:"
```
Expected: no error from `--quiet` (exit code 0); the second command shows the merged `evolution` service with the `atendai/evolution-api:v2.2.3` image and resolved env vars. (Live QR pairing against a real WhatsApp number is a manual step done once the test chip is provisioned — not part of this task's automated verification.)

- [ ] **Step 7: Commit**

```bash
git add .env.example packages/config/src/settings.ts config/orchestration/compose.local.yaml config/orchestration/README.md
git commit -m "feat: Evolution API local em compose.local.yaml + config"
```

---

### Task 8: Update the living plan docs

**Files:**
- Modify: `PLANO_EXECUCAO.md`
- Modify: `PROGRESSO_BUILD.md`

**Interfaces:** none — documentation only.

- [ ] **Step 1: Mark P4.0–P4.4 groundwork done in `PLANO_EXECUCAO.md`**

Append a status line to each of P4.0 through P4.4 in the Épico 4 section: `- **Status: ✅ FEITO (sessão N)** — echo ponta a ponta, sem fila/LLM ainda.` P4.5 (janela 24h) and P4.6 (shadow mode) stay without a status line — they depend on Épico 3 (fila) and remain open.

- [ ] **Step 2: Update `PROGRESSO_BUILD.md`**

Update the "Última atualização" line at the top to the current session, and add a "Status por fase do Épico 4" section (mirroring the existing Épico 0/1 sections) summarizing: migration 0010 applied, port redesigned, baileys-legacy retired, both adapters implemented and unit-tested, webhook router serving both routes with echo, local Evolution container available. Update "PRÓXIMO PASSO" to note that the WhatsApp transport is ready end-to-end (echo-level) for both providers, and the next real milestone is either resuming Épico 2 (core pipeline/ports for LLM+menu+payment) or wiring the queue (Épico 3) so Evolution/Meta messages stop being echoed and start reaching the real pipeline — decide which with the user before starting.

- [ ] **Step 3: Commit**

```bash
git add PLANO_EXECUCAO.md PROGRESSO_BUILD.md
git commit -m "docs: marca P4.0-P4.4 feitos, atualiza PRÓXIMO PASSO"
```

---

## Self-Review Notes

- **Spec coverage:** P4.0 (Task 1), P4.1 (Task 3), P4.2 (Tasks 4, 6, 7), P4.3 (Tasks 5, 6), P4.4 (Task 6) all have a task. P4.5 (janela 24h) and P4.6 (shadow mode) are explicitly left open in Task 8 — they depend on Épico 3's queue, out of scope for this plan.
- **Type consistency checked:** `IncomingMessage`/`WhatsAppProvider` (Task 3) shape is used identically in Tasks 4, 5, 6. `TenantRow.waNumber`/`waProvider` (Task 2) match the columns from Task 1 and the usage in Task 6's router. `RouterDeps` field names (`makeEvolutionProvider`, `makeCloudApiProvider`, `metaVerifyToken`, `metaAppSecret`, `evolutionWebhookToken`) are consistent between Task 6's test and implementation, and between Task 6 and Task 7's `settings.evolution` fields (`apiUrl`, `apiKey`, `webhookToken`).
- **No placeholders:** every step has runnable commands or complete code; no "add error handling" or "similar to Task N" shortcuts.
