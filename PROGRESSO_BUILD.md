# PROGRESSO_BUILD.md — estado vivo do build do Sirvase

> Arquivo de continuidade. Atualizar a cada bloco de trabalho. Uma nova sessão do
> Claude deve ler **este arquivo + `PLANO_EXECUCAO.md` + `claude.md`** e retomar do
> "PRÓXIMO PASSO" abaixo. Regras persistentes para qualquer agente Cursor:
> `.cursor/rules/sirvase-*.mdc`. Não commitar sem o usuário pedir.

Última atualização: 2026-06-28 (sessão 2).

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

## PRÓXIMO PASSO (começar exatamente aqui)
**Épico 0 COMPLETO (P0.1–P0.5 ✅).** Stack roda local em `http://127.0.0.1:8080`.
Pendências/notas antes do Épico 1:
- Nada commitado ainda (aguardando o usuário pedir). `git add` precisa incluir: compose/Dockerfile/.dockerignore, config/orchestration/*, config/services/proxy/*, config/app/*, scripts/*, packages/config/src/*, packages/core/test/*, services/*/src/*, eslint/prettier, package.json/bun.lock, PROGRESSO_BUILD.md.
- Porta local = **8080** (decidido pelo usuário). Outros containers docker da máquina (nexarena) foram parados p/ focar no sirvase.
- Começar **Épico 1** conforme `PLANO_EXECUCAO.md` (auth/JWT + multi-tenant).

## Como validar o Épico 0 (DoD agregado) — ✅ TUDO VERDE
- `bun install` ok · `bun run typecheck` limpo · `bun test` 4/4 · `bun run lint` 0 erros ·
- `docker compose up -d` sobe postgres+redis+api+proxy saudáveis · `curl http://127.0.0.1:8080/health` → ok · sem nenhum `cp` de config.
