# PROGRESSO_BUILD.md — estado vivo do build do Sirvase

> Arquivo de continuidade. Atualizar a cada bloco de trabalho. Uma nova sessão do
> Claude deve ler **este arquivo + `PLANO_EXECUCAO.md` + `claude.md`** e retomar do
> "PRÓXIMO PASSO" abaixo. Regras persistentes para qualquer agente Cursor:
> `.cursor/rules/sirvase-*.mdc`. Não commitar sem o usuário pedir.

Última atualização: 2026-07-01 (sessão 3) — Épico 1 completo.

## Decisões travadas (não reabrir)
- **Runtime/workspaces: Bun** (1.3.9). NÃO npm/pnpm. Workspaces: `["packages/*","services/*"]` (apps/* entram no Épico 7).
- **Override `libsignal` → npm** no `package.json` raiz (`"overrides": { "libsignal": "npm:libsignal@6.0.0" }`). Motivo: o bun é instalado via **snap** (confinado) e não consegue clonar a dep git `libsignal` do Baileys (erro `FileNotFound` no `git clone`). Baileys-legacy é só referência (não roda), então a versão npm basta p/ install+typecheck. Sai quando o Baileys for removido (Épico 4). `package-lock.json` (npm) apagado — fonte de verdade agora é `bun.lock`.
- **Migrar `src/` legado agora**: feito via `git mv`. Código de orquestração que será reescrito foi para `_legacy/` (fora do typecheck).
- Packages: `@sirvase/core` (domínio+ports), `@sirvase/config` (loader env fail-fast), `@sirvase/adapters` (SDKs), `@sirvase/db` (migrations/repos, vazio).
- Toolchain TS: `moduleResolution: bundler`, `allowImportingTsExtensions`, `noEmit` (typecheck só). Paths `@sirvase/*` no `tsconfig.base.json`. Bun resolve workspaces em runtime.
- Imports entre pacotes: SEMPRE bare specifier `@sirvase/core` etc. Dentro do pacote: caminho relativo com `.js` (Bun/bundler resolvem para `.ts`).

## Mapa da migração `src/` → monorepo (já movido)
| Antes (src/) | Agora |
|---|---|
| core/orders/{orderTypes,orderParser,orderRepo,orderState}.ts | packages/core/src/orders/ |
| core/menu/{menuTypes,menuService,menu_data}.ts | packages/core/src/menu/ |
| core/llm/{promptBuilder,guard}.ts + promptBase.md | packages/core/src/llm/ |
| core/llm/model.ts | packages/adapters/src/llm/openrouter/legacyChutesModel.ts |
| core/config/schema.ts | packages/core/src/config/**tenantConfigSchema.ts** |
| core/config/loadConfig.ts | packages/core/src/config/**loadTenantConfig.ts** |
| core/utils/logger.ts | packages/core/src/observability/logger.ts (reescrito: console-only JSON, sem I/O em disco) |
| core/whatsapp/provider.ts | packages/core/src/ports/whatsapp.ts (é um PORT) |
| core/whatsapp/baileys.ts | packages/adapters/src/whatsapp/baileys-legacy/index.ts |
| index.ts, server.ts | _legacy/ (referência; reescritos nos Épicos 3-4) |
| clients/ponto-do-lanche/config.yaml | _legacy/ponto-do-lanche.config.yaml |

Imports dos arquivos movidos já corrigidos (logger→observability, schema→tenantConfigSchema, adapters→`@sirvase/core`).
`src/data/*` (PII) permanece, gitignored — será aposentado ao migrar para Postgres (Épico 3.4).

---

## Status por fase do Épico 0

### P0.1 — Scaffolding monorepo + Bun workspaces — ✅ FEITO
Feito:
- Estrutura de pastas (packages/services/apps/config/db/scripts/_legacy).
- `package.json` raiz (workspaces, scripts) + `overrides.libsignal` (ver decisões).
- `tsconfig.base.json` + `tsconfig.json` (inclui packages/services, exclui `_legacy`).
- `package.json` de cada workspace; barrels core/adapters.
- `bun install` ok → `bun.lock` gerado, workspaces linkados (488 pkgs).
- Fixes de typecheck: `legacyChutesModel.ts` (`thinkMatch[1]?.trim()`); `@hapi/boom` add nas deps do adapters (import do baileys-legacy).
- `eslint.config.js` (flat, ESLint 9 + typescript-eslint, ignora `_legacy` e `src`) + `.prettierrc` + `.prettierignore`. Add `@eslint/js` nas devDeps raiz.
- 2 testes migrados p/ `bun:test` em `packages/core/test/` (`orderParser`, `promptGuard`). `tests/` raiz removido. Nota: corrigida asserção do orderParser — `extract` NÃO expande por quantidade (1 item c/ quantity:2, não 2 itens; teste legado estava aspiracional).
- Stubs `services/{api,webhook,worker}/src/index.ts` (api serve `/health` via `Bun.serve`).
- **DoD atingido**: `bun install` ok · `bun run typecheck` limpo · `bun test` 4/4 verde · `bun run lint` 0 erros (só warnings em legado).

### P0.2 — Loader de config fail-fast (packages/config) — ✅ FEITO
- `packages/config/src/settings.ts`: dois Zod schemas — (a) **env** (`envSchema`: secrets + ENVIRONMENT/INGRESS_MODE; coerce de portas; obrigatórios POSTGRES_PASSWORD/REDIS_PASSWORD/JWT_SECRET≥32/LLM_API_KEY); (b) **file** (`fileSchema`: cors.origins, pools.{postgres,redis}.max, llm.{model,temperature,maxTokens}, queue.{name,concurrency}).
- `build()` mescla env+yaml num `settings` **congelado** (Object.freeze aninhado). `die()` faz `console.error` + `process.exit(1)` com mensagem clara. YAML lido de `CONFIG_DIR ?? cwd/config/app/${ENVIRONMENT}.yaml`.
- `packages/config/src/index.ts` exporta `settings` e tipo `Settings`.
- `config/app/{local,staging,prod}.yaml` criados (pools/concurrency crescem por ambiente).
- **DoD atingido** (validado via `bun -e`): sem LLM_API_KEY → exit 1 + msg; CONFIG_DIR inválido → exit 1 "não encontrado"; happy-path → settings congelado mesclando env+yaml. typecheck/test/lint seguem verdes.
- ⚠️ Único lugar que lê `process.env`. Próximos serviços DEVEM importar de `@sirvase/config`, nunca ler env direto.

### P0.3 — Compose base + includes — ✅ FEITO
- `compose.yaml` (name: sirvase) com `include:` de `compose.${ENVIRONMENT:-local}.yaml` + `ingress.${INGRESS_MODE:-loopback}.yaml`. Define postgres (16-alpine, healthcheck `pg_isready`) + redis (7-alpine, `--requirepass`/`--appendonly`, healthcheck `redis-cli ping`) + api (build do Dockerfile, depends_on healthy).
- `Dockerfile` único (`oven/bun:1.3`, arg `SERVICE_ENTRY`, manifests→`bun install --frozen-lockfile`→código; CMD shell-form). `.dockerignore` criado.
- `config/orchestration/compose.{local,staging,prod}.yaml` criados.
- **DoD atingido**: `docker compose up -d` sobe pg+redis saudáveis + api; os 9 combos (env×ingress) passam no `docker compose config`; nenhum `cp`.

### P0.4 — Persistência + backup — ✅ FEITO
- Volumes nomeados `pgdata`/`redisdata` (+ `caddydata`/`caddyconfig` no edge). Redis com `--requirepass ${REDIS_PASSWORD}`.
- `scripts/db-dump.sh` (pg_dump | gzip → `backups/`) e `scripts/db-restore.sh` (psql, aceita `.sql`/`.sql.gz`), ambos `chmod +x`, carregam `.env`. `backups/` no gitignore.
- **DoD atingido** (validado): linha sobrevive a `down`/`up`; dump gera `.sql.gz` com os dados; restore recupera após DROP.
- ⚠️ Rodar os scripts com **`bash scripts/db-dump.sh`** direto, NÃO `bun run db:dump` — o bun-via-snap não enxerga o binário `docker` (`command not found`).

### P0.5 — Proxy/ingress Caddy (3 modos) — ✅ FEITO
- `config/orchestration/ingress.{loopback,gateway,edge}.yaml` (serviço `proxy` caddy:2-alpine). loopback→`127.0.0.1:8080` HTTP; gateway→`:80`; edge→`80`+`443` ACME (`DOMAIN` no .env, volumes de cert).
- `config/services/proxy/Caddyfile.{loopback,gateway,edge}` (`reverse_proxy api:3000`). ⚠️ paths de volume nos ingress são `../services/proxy/...` (relativos ao dir do include).
- **DoD atingido**: `/health` responde via proxy em `http://127.0.0.1:8080/health` → `{"status":"ok","service":"api"}`. Modos gateway/edge validados no `docker compose config`.
- Doc do túnel `cloudflared` + visão geral dos modos em `config/orchestration/README.md`.

---

## Antecipação parcial do Épico 4 (a pedido do usuário, p/ testar c/ a Meta)
- `services/webhook/src/index.ts` implementado (Bun.serve :3001): GET de verificação (ecoa `hub.challenge` se `hub.verify_token` == `settings.whatsapp.verifyToken`) + POST que loga a mensagem e responde com ECO via Graph API (`/{phoneNumberId}/messages`).
- `settings.whatsapp` ganhou `accessToken`/`phoneNumberId`/`graphVersion` (env opcionais; `.env.example` atualizado).
- `compose.yaml` agora tem o service `webhook`; os 3 Caddyfiles roteiam `/webhook*` → `webhook:3001`, resto → `api:3000`.
- Validado local: GET token certo→challenge; token errado→403; POST simulado→200+log. Falta só credencial real da Meta (`WHATSAPP_ACCESS_TOKEN`+`WHATSAPP_PHONE_NUMBER_ID`) + túnel p/ eco real.
- ⚠️ Ainda FALTA do Épico 4 completo: validação `X-Hub-Signature-256` (TODO no código), fila/idempotência, LLM, persistência. Isto é só a casca de teste.

## Como validar o Épico 0 (DoD agregado) — ✅ TUDO VERDE
- `bun install` ok · `bun run typecheck` limpo · `bun test` 4/4 · `bun run lint` 0 erros ·
- `docker compose up -d` sobe postgres+redis+api+proxy saudáveis · `curl http://127.0.0.1:8080/health` → ok · sem nenhum `cp` de config.
- **Commitado em `51d9f4a`** (branch `feat/biggest-refatoration`, já no origin): "feat: completa Épico 0 …".

---

## Status por fase do Épico 1

### ⚠️ Incidente de recuperação (sessão 3, 2026-07-01)
O trabalho de P1.1+P1.2 tinha sido feito na sessão 2 mas **não commitado**; o working
tree foi limpo (voltou a `51d9f4a`) e os arquivos-fonte (`packages/db/src/`,
`db/migrations/`, `db/seed.ts`, scripts no root) se perderam. **O banco sobreviveu**
(volume Docker `pgdata`): as 9 migrations seguem aplicadas em `schema_migrations` e o
seed intacto. Reconstruí os arquivos **fiéis ao banco** (fonte da verdade) e **provei
por diff** que `migrate up` do zero gera schema byte-a-byte idêntico ao `pg_dump` da
base real. Lição: commitar ao fim de cada fase (o usuário já autorizou commits nesta linha).

### P1.1 — Runner de migrations SQL — ✅ FEITO
- **`Bun.SQL` nativo** (driver Postgres embutido no Bun), sem `pg`/ORM. `sql.begin(tx=>...)` transação; `sql.unsafe(q, params)` com `$1`; `sql.close()`.
- `packages/db/src/client.ts` (pool via `@sirvase/config`), `migrate.ts` (CLI `up|down|status`), `index.ts` (barrel). `packages/db/package.json` ganhou dep `@sirvase/config`.
- Convenção: `db/migrations/NNNN_nome.up.sql` + `.down.sql`. Tabela `schema_migrations(id,name unique,applied_at)` auto-criada. `up` aplica pendentes (cada uma em transação); `down` reverte só a última; `status` lista ✓/·.
- Scripts root: `db:migrate:{up,down,status}` + `db:seed`.
- ⚠️ Do **host** (fora do container), `.env` tem `POSTGRES_HOST=postgres` (só resolve na rede do compose). Rodar com override: `POSTGRES_HOST=127.0.0.1 POSTGRES_PORT=15432 bun run db:migrate:up`.

### P1.2 — Schema base evoluído do atual — ✅ FEITO
- 9 migrations em `db/migrations/` (todas aplicadas no pg local): `0001_create_tenants`, `0002_create_users`, `0003_create_orders`, `0004_create_sessions`, `0005_create_processed_messages`, `0006_create_tenant_secrets`, `0007_create_subscriptions`, `0008_create_menu_items`, `0009_create_legacy_tables` (leads + n8n_chat_histories).
- Design real (mais rico que o stub original): FKs `tenant_id … ON DELETE CASCADE` em tudo; índices por tenant (`idx_*`); CHECKs de enum (status/role/source/cardapio_source); `orders` tem `customer_phone`/`delivery_needed`/`address`/`payment_method`/`idempotency_key UNIQUE`; `sessions` UNIQUE `(tenant_id,phone_number)`; `tenant_secrets` UNIQUE `(tenant_id,key)`; `subscriptions` UNIQUE por tenant + campos de gateway.
- `db/seed.ts` idempotente (`ON CONFLICT DO NOTHING`): tenant **Ponto do Lanche** (UUID fixo `a278e80f-…`, hamburgueria, `cardapio_source=external`, `config jsonb` completo herdado do `_legacy/ponto-do-lanche.config.yaml`) + user **admin@pontodolanche.com** (role admin, hash argon2id via `Bun.password`; senha dev `admin123`, override por `SEED_ADMIN_PASSWORD`).
- **DoD atingido + verificado**: `db:migrate:status` mostra 9/9 aplicadas; `db:seed` roda sem duplicar (tenants=1, users=1); **diff de `pg_dump --schema-only` da base real vs. banco recriado do zero = IDÊNTICOS**. typecheck limpo, test 4/4, lint 0 erros.

### P1.3 — Isolamento por tenant na camada de repositório — ✅ FEITO
- **Ports em `packages/core/src/ports/repositories.ts`** (exportados no barrel do core): `TenantRepository` (raiz, NÃO escopado — `findById`/`findByPhoneNumberId` p/ roteamento), `OrderRepository` e `SessionRepository` (escopados: `tenantId` é sempre o 1º arg). Row types com camelCase.
- **Impl. Postgres em `packages/db/src/repositories/`** (`Pg{Tenant,Order,Session}Repository`), NÃO em adapters — segue a decisão "@sirvase/db = migrations/repos". `sql` **injetável no construtor** (default = pool compartilhado) → testável sem mexer no global. Repos escopados injetam `WHERE tenant_id = $1` em toda query. Mapeamento snake→camel + `parseJson`/`asObject` (jsonb volta como **texto** no driver Bun.SQL, precisa `JSON.parse`).
- **RLS DESLIGADO** por ora (decisão registrada no `claude.md §3`): barreira = disciplina de repo, provada por teste. Reavaliar no Épico 6.
- **Teste `packages/db/test/tenantIsolation.test.ts`** (integração, conecta no loopback `127.0.0.1:15432`; `describe.skipIf(!dbUp)` pula gracioso se pg inacessível → `bun test` fica verde sem DB). Prova: `listByTenant` só devolve do próprio tenant; `findById`/`updateStatus` cross-tenant → `null`/0 linhas; sessions com MESMO phone em tenants diferentes ficam isoladas. Cria 2 tenants descartáveis (`randomUUIDv7`) e limpa no `afterAll` (FK CASCADE).
- **DoD atingido**: `bun test` 9/9 (4 antigos + 5 isolamento); typecheck limpo; lint 0 erros; base fica intacta (1 tenant/0 orders/0 sessions) após o teste.
- ⚠️ Se um run do teste falhar no meio, o `afterAll` pode não rodar e deixar tenants "Tenant A/B Teste" órfãos — limpar com `DELETE FROM tenants WHERE store_name LIKE '%Teste%'`.

### P1.4 — Auth JWT própria — ✅ FEITO
- **JWT hand-rolled HS256** em `services/api/src/auth/jwt.ts` com Web Crypto (`crypto.subtle`) — **sem dep nova** (decisão: respeita regra do claude.md de evitar lib não-trivial; verificação HMAC é constant-time; `alg` FIXO em HS256 e checado na verify → fecha alg-confusion/`none`). `signToken` (TTL 7d, claims sub/tenantId/role) + `verifyToken` (retorna payload ou null; valida assinatura E expiração).
- **`UserRepository` port** (core) + **`PgUserRepository`** (db): `findByEmail` (NÃO escopado — login acha o user antes do tenant; devolve `UserWithSecret` c/ hash só p/ verificação interna), `findById`, `create`. Hash NUNCA vaza p/ fora do serviço.
- **`AuthService`** (`services/api/src/auth/service.ts`): `signup`/`login` com `Bun.password.hash/verify` (argon2id, = seed). `AuthError(status,msg)`. Login com senha errada/user inexistente → 401 genérico.
- **`authenticate(req)`** (middleware): extrai Bearer, valida, devolve `{userId,tenantId,role}` ou null.
- **`createRouter(deps)`** (`router.ts`): handler puro `(req)=>Response` com deps injetadas (testável sem subir servidor). Rotas: `GET /health` (público), `POST /auth/login` (público), `POST /auth/signup` (protegido, **só admin** provisiona), `GET /me` (protegido), `GET /orders` (protegido, **escopado ao tenant do token**). `index.ts` faz o wiring real (repos Pg sobre pool compartilhado, porta `settings.app.port`). Api ganhou dep `@sirvase/db`.
- **Teste `services/api/test/auth.test.ts`** (integração, skip sem DB): login→JWT (3 partes, sem hash no user); senha errada→401; rota protegida sem token→401; token inválido→401; `/me`→contexto do tenant; `/orders`→só o tenant do token; signup com token client→403.
- **DoD atingido + verificado**: `bun test` 16/16 (4+5+7); typecheck limpo; lint 0 erros. **Smoke E2E real** (api local :3999 sobre pg loopback): `/orders` sem token→401; login do admin do seed (`admin@pontodolanche.com`/`admin123`)→JWT; `/me`→tenantId do Ponto do Lanche + role admin; `/orders` com token→filtrado.
- ⚠️ `admin` "vê tudo" (cross-tenant) fica p/ o painel (Épico 7); hoje `/orders` sempre escopa ao tenant do token (TODO marcado no router). Signup público não existe de propósito (só admin cria users).
- ⚠️ Container `api` em execução ainda tem o stub do Épico 0 — **rebuildar** (`docker compose up -d --build api`) p/ subir o código de auth no Docker.

## PRÓXIMO PASSO (começar exatamente aqui)
**🎉 ÉPICO 1 COMPLETO (P1.1–P1.4 ✅).** Banco + migrations + auth JWT + isolamento multi-tenant prontos e testados (16/16). Próximo é o **Épico 2 — Core modular: portas e adaptadores** (ver `PLANO_EXECUCAO.md` linha ~184).
- **Commit P1.4 pendente** (só quando o usuário pedir; ele faz o push). Inclui: `packages/core/src/ports/repositories.ts` (UserRepository), `packages/db/src/repositories/userRepo.ts` + barrel, `services/api/src/{index,router,auth/*}.ts`, `services/api/test/auth.test.ts`, `services/api/package.json`, `bun.lock`, PROGRESSO.
- **Antes de seguir p/ Épico 2**: rebuildar o container api p/ subir o código de auth (`docker compose up -d --build api`). Opcional agora — os testes já provam o código.
- Stack local de pé (`docker compose ps`). Postgres loopback `127.0.0.1:15432`. Testes de integração do host: `bun test` (auto-skip se pg off). Login de dev do seed: `admin@pontodolanche.com` / `admin123`.
- Épico 2 (resumo do plano): extrair o pipeline de uma mensagem para `packages/core/pipeline/`, formalizar ports `LlmProvider`/`MenuSource`/`PaymentProvider` com impl real + **mock** cada, wiring trocável por 1 linha. Reaproveitar orderParser/promptBuilder/guard já em core.
