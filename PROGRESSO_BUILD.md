# PROGRESSO_BUILD.md — estado vivo do build do Sirvase

> Arquivo de continuidade. Atualizar a cada bloco de trabalho. Uma nova sessão do
> Claude deve ler **este arquivo + `PLANO_EXECUCAO.md` + `claude.md`** e retomar do
> "PRÓXIMO PASSO" abaixo. Regras persistentes para qualquer agente Cursor:
> `.cursor/rules/sirvase-*.mdc`. Não commitar sem o usuário pedir.

Última atualização: 2026-07-05 (sessão 6) — Épico 2 completo (P2.1–P2.3): portas LLM/Payment/Menu, mocks de todas as portas, pipeline ponta a ponta sem rede, prompt montado do tenant do banco.

## Decisão (sessão 4, 2026-07-04): WhatsApp — Evolution ativo + Cloud API pronta
- **Motivo**: app da Meta ainda não foi aprovado, mas o usuário quer testar o fluxo ponta a
  ponta muitas vezes já. Decisão: **Evolution API self-hosted vira o provedor ativo agora**;
  **Cloud API é implementada em paralelo** (Épico 4 completo pros dois), pronta pra ligar por
  tenant quando o app aprovar. Detalhe completo em `PLANO_EXECUCAO.md` Épico 4 (P4.0–P4.6) e
  `claude.md §4`.
- **Porta `WhatsAppProvider` redesenhada**: webhook+REST (`parseWebhook`/`sendText`/
  `markAsRead`), substituindo o formato antigo em processo herdado da migração do Baileys
  (`initialize`/`onMessage`/typing). `baileys-legacy` continua só como referência, nunca
  implementa a porta nova.
- **Roteamento unificado**: `tenants.wa_number` (E.164) é a identidade universal — nova
  migration adiciona `wa_number` + `wa_provider` (`meta`|`evolution`). Instância Evolution é
  sempre criada com nome = `wa_number`. `wa_phone_number_id` (já existe) vira campo técnico
  só-Meta (exigido pela Graph API pra enviar).
- **Dev local sem VPS/túnel**: Evolution roda em container próprio, só em
  `config/orchestration/compose.local.yaml` (nunca staging/prod), reaproveitando
  Postgres/Redis do stack (banco/índice lógico dedicados). Webhook aponta pra
  `http://webhook:3001/webhook/evolution` por rede interna Docker — zero dependência de
  domínio público ou túnel Cloudflare em dev. Trocar de máquina de desenvolvimento exige
  re-escanear o QR (sessão não roda em duas instâncias Evolution ao mesmo tempo).
  **Produção**: instância Evolution nova e isolada na VPS já existente do usuário (domínio
  `sirvase.simetech.com.br`, `INGRESS_MODE=edge`) — nunca reusa a instância/número que atende
  produção real (Ponto do Lanche do pai do usuário) via n8n. Meta, quando testável, também
  precisa de reachability pública (túnel nomeado `cloudflared` ou o mesmo domínio) — não é
  bloqueante agora.
- **Autenticação do webhook Evolution**: ela não assina payload como a Meta
  (`X-Hub-Signature-256`); autentica por token na própria URL (`EVOLUTION_WEBHOOK_TOKEN`).
- **Ainda em aberto**: se esse trabalho (Épico 4) entra antes de terminar o Épico 2, ou depois
  — decidir na próxima sessão/plano de implementação. "PRÓXIMO PASSO" abaixo não mudou por
  enquanto.

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

---

## Status por fase do Épico 4

### P4.0 — Schema: identidade universal de roteamento — ✅ FEITO
- **Implementado em sessão 5**: migration `0010_add_wa_routing.sql` (commit `0fe756b`) adiciona `tenants.wa_number` (text, unique, E.164) e `tenants.wa_provider` (enum: `meta`|`evolution`). Seed do Ponto do Lanche ganhou `wa_number` + `wa_provider='evolution'`.
- **DoD atingido**: migration aplica idempotentemente; seed roda sem duplicar; schema suporta roteamento universal por `wa_number`.

### P4.1 — Porta `WhatsAppProvider` webhook+REST — ✅ FEITO
- **Implementado em sessão 5** (commit `9355306`): redesenho da porta em `packages/core/src/ports/whatsapp.ts` — `parseWebhook(payload): IncomingMessage | null`, `sendText(to, text)`, `markAsRead(to, messageId)`. Herdado do Baileys (`initialize`/`onMessage`/typing) aposentado.
- **DoD atingido**: core compila só com a porta nova; `baileys-legacy` continua como referência histórica, nunca implementa a porta.

### P4.2 — `EvolutionApiProvider implements WhatsAppProvider` — ✅ FEITO
- **Implementado em sessão 5** (commits `72898c8` + `cfd9bff`): adapter implementa a porta para Evolution API; `parseWebhook` traduz payloads da Evolution; `sendText`/`markAsRead` via REST (`EVOLUTION_API_URL`/`EVOLUTION_API_KEY`). Dev local: serviço `evolution` em `config/orchestration/compose.local.yaml` (banco/índice dedicados, volume pra persistir sessão), webhook aponta para `http://webhook:3001/webhook/evolution?token=...` via rede Docker.
- **DoD atingido**: lógica do router é unit-testada (payloads simulados, sem instância Evolution ativa); config Docker Compose para o serviço `evolution` valida (`docker compose config` sem erros). Nenhuma Evolution/WhatsApp round-trip ao vivo ocorreu ainda (pendente: número de teste real + `docker compose up -d evolution` + escaneamento de QR).

### P4.3 — `CloudApiProvider implements WhatsAppProvider` — ✅ FEITO
- **Implementado em sessão 5** (commit `7c29d8c`): adapter implementa a porta para Meta Cloud API; `parseWebhook` valida e traduz webhook real; `sendText` via Graph API; verify (GET `hub.challenge`); validação `X-Hub-Signature-256`. Pronto pra ativar por tenant quando app da Meta aprovar.
- **DoD atingido**: adapter é unit-testado contra payloads de webhook simulados (sem conta Meta ao vivo). Nenhum envio/recebimento real na Cloud API ocorreu — Meta app ainda não aprovado. Pendente: aprovação da app na Meta + credenciais reais (access token, phone_number_id).

### P4.4 — Resolução tenant + autenticação de entrada — ✅ FEITO
- **Implementado em sessão 5** (commits `2a97360` + `ad5c40d`): lookup em `tenants.wa_number` (Evolution) ou `tenants.wa_phone_number_id` (Meta) no webhook. `TenantRepository.findByWaNumber` (novo em `2a97360`). Webhook router em `services/webhook/src/router.ts` (commit `ad5c40d`) atende `GET /webhook/meta` (verify), `POST /webhook/meta` (messages), `POST /webhook/evolution` (messages); autenticação por provedor (Meta: `X-Hub-Signature-256`; Evolution: token na URL). Evolution não tem verify GET (sem handshake). Número/instância desconhecida: rejeita com log.
- **DoD atingido**: mensagem chega em `/webhook/{evolution,meta}`, tenant é resolvido corretamente, entrada não autenticada é rejeitada. Echo funciona ponta a ponta para ambos os provedores.

---

## Status por fase do Épico 2 (sessão 6, 2026-07-05)

### P2.1 — Portas no core/ports — ✅ FEITO
- `packages/core/src/ports/llm.ts` (`LlmProvider.generate(messages, options)` com tool-calling:
  `LlmToolDefinition`/`LlmToolCall`/`LlmResult`; `thought` p/ modelos com `<think>`), `ports/payment.ts`
  (`PaymentProvider.createSubscription` + `parseWebhook` → `PaymentWebhookEvent | null`, mesmo padrão
  webhook da porta WhatsApp; valores em **centavos**) e `ports/menu.ts` (`MenuSource.getMenu(tenant)`).
- **Core ficou 100% sem I/O**: `menuService.ts` (fetch+cache), `orderRepo.ts`/`orderState.ts` (fs JSON)
  e `loadTenantConfig.ts` (YAML por cliente) foram pra `_legacy/core-fs/`; `promptBase.md` virou
  `promptBase.ts` (const TS, sem `fs.readFileSync`); formatação de cardápio virou `renderMenu()` +
  `findItemPrice()` puros em `core/menu/renderMenu.ts`. Dep `js-yaml` removida do core.
- ⚠️ Única exceção que restou: `logger.ts` lê `process.env.LOG_LEVEL` (pré-existente do Épico 0;
  core não pode importar @sirvase/config pela regra de direção — resolver quando o logger for
  revisitado no Épico 10).

### P2.2 — Mocks de tudo + pipeline ponta a ponta — ✅ FEITO
- Mocks em `packages/adapters/src/`: `whatsapp/mock` (grava `sent`/`reads`), `llm/mock` (respostas
  canned roteirizadas, grava chamadas), `payment/mock` (gateway fake determinístico), `menu/mock`
  (cardápio fixo — fixture é o antigo `menu_data.ts` do core), `repositories/in-memory`
  (Tenant/Order/Session com as mesmas regras de isolamento e a UNIQUE de `idempotency_key`).
- **`core/pipeline/processIncomingMessage.ts`**: orquestração de UMA mensagem só com portas
  (markAsRead → session → menu → prompt do tenant → LLM → guard → OrderParser → cria order com
  total RECALCULADO do cardápio + `idempotency_key = message_id` → sendText → persiste histórico
  em `sessions.context.history`, cap 30 turnos). Grupo é ignorado. Dedup/lock/fila ficam pro Épico 3
  (o worker chamará esta função por job).
- Teste `packages/adapters/test/pipeline.test.ts` (7 casos): e2e sem rede/banco, prompt sem
  placeholder órfão, total recalculado (item fora do cardápio não entra), guard corrige headers,
  grupo ignorado, reprocesso da mesma mensagem não duplica pedido.
- Correções de bugs latentes no `PromptBuilder` herdado: `{{store.name}}`/`{{payments.methods}}`/
  `{{delivery.surcharge_per_sandwich}}` apareciam 2–3× no template mas só a 1ª era substituída
  (agora `replaceAll`); `{{delivery.eta_min}}` nunca era preenchido (agora é, como "N minutos").

### P2.3 — Prompt a partir do tenant do banco — ✅ FEITO
- `core/config/tenantConfigFromRow.ts`: valida `tenants.config` (jsonb) com o `ConfigSchema` (Zod)
  e aplica as colunas canônicas por cima (`store_name`, `catalog_api_url`,
  `system_prompt_personality` → `tone.style`; `store.id` = UUID do tenant). Config inválida →
  `TenantConfigError` (fail-fast). YAML por cliente aposentado de vez.
- `ExternalApiMenuSource` (adapters/menu/external-api): herda o fetch do antigo MenuService, cache
  **keyed por tenant.id** (Regra de Ouro 3), TTL 30min, fallback pro cache vencido em erro de rede.
- Testes: `packages/core/test/tenantConfigFromRow.test.ts` (unit, 4 casos) +
  `packages/db/test/promptFromTenant.test.ts` (integração: `PgTenantRepository.findById` do seed →
  `tenantConfigFromRow` → `PromptBuilder.build` → prompt completo sem `{{`; skip gracioso sem DB).

### DoD Épico 2 — ✅ TUDO VERDE (validado nesta sessão)
- `bun run typecheck` limpo · `bun test` **54/54** com DB de pé (27 novos; sem DB: 39 pass + 22 skip)
  · `bun run lint` 0 erros (1 warning pré-existente no orderParser).
- ⚠️ Descoberta da sessão: `.env` local está **sem as vars `EVOLUTION_*`** (`EVOLUTION_API_KEY`,
  `EVOLUTION_WEBHOOK_TOKEN`) — qualquer `docker compose up` falha na interpolação, mesmo pra subir só
  o postgres (contornado com dummies inline). Migration 0010 também estava pendente neste banco
  (aplicada + seed re-rodado nesta sessão). Restaurar as vars antes de retomar teste real da Evolution.

---

## PRÓXIMO PASSO (começar exatamente aqui)
**🎉 ÉPICO 2 COMPLETO (P2.1–P2.3 ✅). Próximo: ÉPICO 3 (fila + idempotência), começando por P3.1.**
O pipeline agora existe e roda ponta a ponta com mocks; falta ligá-lo ao mundo real: fila BullMQ
(P3.1) → webhook só enfileira (P3.2) → worker com dedup + lock + pipeline (P3.3, teste do fan-out)
→ estado de conversa 100% Postgres (P3.4). Era a sequência recomendada na sessão 5 (E2 antes de E3)
e o usuário confirmou na sessão 6.

**Estado agregado:**
- ✅ Épico 0: scaffolding monorepo, config, compose, persistência, proxy (51d9f4a).
- ✅ Épico 1: banco, migrations 0001–0009, auth JWT, isolamento multi-tenant (1751879–906f101).
- ✅ Épico 2: portas LLM/Payment/Menu, mocks de tudo, pipeline sem rede, prompt do tenant do banco (sessão 6).
- ✅ Épico 4 (parcial): routing schema, ambos adapters WhatsApp, webhook router echo, Evolution local (0fe756b–cfd9bff). P4.5/P4.6 pendentes.

**Antes de começar o Épico 3:**
- Restaurar `EVOLUTION_API_KEY`/`EVOLUTION_WEBHOOK_TOKEN` na `.env` (sumiram — ver ⚠️ no DoD do Épico 2).
- P3.3 vai trocar o echo do webhook router por enfileirar + worker chamando `processIncomingMessage`.
- **Testes locais**: `bun test` (54/54 com postgres de pé em 127.0.0.1:15432), typecheck/lint verdes.
