# PROGRESSO_BUILD.md — estado vivo do build do Sirvase

> Arquivo de continuidade. Atualizar a cada bloco de trabalho. Uma nova sessão do
> Claude deve ler **este arquivo + `PLANO_EXECUCAO.md` + `claude.md`** e retomar do
> "PRÓXIMO PASSO" abaixo. Regras persistentes para qualquer agente Cursor:
> `.cursor/rules/sirvase-*.mdc`. Não commitar sem o usuário pedir.

Última atualização: 2026-06-28 (sessão 1).

## Decisões travadas (não reabrir)
- **Runtime/workspaces: Bun** (1.3.9). NÃO npm/pnpm. Workspaces: `["packages/*","services/*"]` (apps/* entram no Épico 7).
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

### P0.1 — Scaffolding monorepo + Bun workspaces — 🚧 QUASE
Feito:
- Estrutura de pastas (packages/services/apps/config/db/scripts/_legacy).
- `package.json` raiz (workspaces, scripts: typecheck/test/lint/format/dev:*/up/down/db:*).
- `tsconfig.base.json` + `tsconfig.json` (inclui packages/services, exclui `_legacy`).
- `package.json` de cada workspace (core, config, adapters, db, api, webhook, worker).
- Barrels: `packages/core/src/index.ts`, `packages/adapters/src/index.ts`.
- `.gitignore` e `.env.example` reescritos para o monorepo.

FALTA (fazer primeiro na próxima sessão):
1. `bun install` na raiz (gera `bun.lock`, linka workspaces). **Ainda não rodado.**
2. `bun run typecheck` e corrigir erros residuais (provável: `noUncheckedIndexedAccess` no código legado de menu/orders; resolver pontualmente).
3. ESLint flat config (`eslint.config.js`) + `.prettierrc` — ainda NÃO criados (scripts já referenciam).
4. Converter os 2 testes legados para `bun:test` em `packages/core/test/` (hoje ainda em `tests/` como scripts console: `orderParser.test.ts`, `promptGuard.test.ts`). Imports apontam para `../src/core/...` (caminho velho) — precisam apontar para `../src/...` do core.
5. Stubs mínimos de entrypoint em services/{api,webhook,worker}/src/index.ts (git não versiona dir vazio).
- DoD: `bun install` resolve workspaces; `bun run typecheck` passa limpo.

### P0.2 — Loader de config fail-fast (packages/config) — ⬜ NÃO INICIADO
Plano de implementação:
- `packages/config/src/settings.ts`: dois Zod schemas —
  (a) **env** (secrets + ENVIRONMENT/INGRESS_MODE): obrigatórios `POSTGRES_PASSWORD`, `REDIS_PASSWORD`, `JWT_SECRET` (min 32), `LLM_API_KEY`; demais opcionais com default.
  (b) **file** lido de `config/app/${ENVIRONMENT}.yaml` (não-secreto: cors, pools, llm.model/temp/maxTokens, queue).
- Mescla em objeto `settings` tipado e congelado. **Explode no boot** (process.exit/throw com mensagem clara) se faltar obrigatório ou yaml inválido. Único lugar que lê `process.env`.
- `packages/config/src/index.ts` exporta `settings` e os tipos.
- Criar `config/app/{local,staging,prod}.yaml`.
- DoD: subir sem `LLM_API_KEY` crasha com msg clara; com tudo, expõe settings.

### P0.3 — Compose base + includes — ⬜ NÃO INICIADO
- `compose.yaml` (name: sirvase) com `include:` de `config/orchestration/compose.${ENVIRONMENT:-local}.yaml` e `ingress.${INGRESS_MODE:-loopback}.yaml`. Define postgres + redis (healthcheck) + api.
- `config/orchestration/compose.{local,staging,prod}.yaml` (os 3 PRECISAM existir senão include falha).
- `Dockerfile` único (base `oven/bun:1.3`), arg `SERVICE_ENTRY` p/ escolher o serviço.
- `.env.example` já espelha as vars. DoD: `docker compose up -d` sobe pg+redis saudáveis em local/loopback sem `cp`.

### P0.4 — Persistência + backup — ⬜
- Volumes nomeados (pg + redis); Redis com `--requirepass ${REDIS_PASSWORD}`.
- `scripts/db-dump.sh` e `scripts/db-restore.sh` (pg_dump/psql via `docker compose exec`).
- DoD: dado sobrevive a down/up; pg_dump roda via script.

### P0.5 — Proxy/ingress Caddy (3 modos) — ⬜
- `config/orchestration/ingress.{loopback,gateway,edge}.yaml` (os 3 existem). Serviço `proxy` (caddy).
- `config/services/proxy/Caddyfile.{loopback,gateway,edge}`: loopback→127.0.0.1:80 HTTP; gateway; edge→443+TLS.
- `/health` (servido pelo services/api) responde atrás do proxy nos 3 modos.
- Documentar túnel `cloudflared` p/ expor webhook Meta em dev (HTTPS público).

---

## PRÓXIMO PASSO (começar exatamente aqui)
1. `cd /home/rafael/code/sirvase && bun install`
2. Criar `eslint.config.js` + `.prettierrc`; converter os 2 testes para `bun:test`; criar stubs `services/*/src/index.ts`.
3. `bun run typecheck` → zerar erros. Fecha **P0.1**.
4. Seguir P0.2 → P0.5 conforme planos acima.

## Como validar o Épico 0 (DoD agregado)
- `bun install` ok · `bun run typecheck` limpo · `bun test` verde ·
- `docker compose up -d` sobe postgres+redis+api+proxy saudáveis · `curl http://127.0.0.1/health` → ok · sem nenhum `cp` de config.
