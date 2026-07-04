# Sirvase — Plano de Execução Mestre (0 → 1ª venda)

> Nome de trabalho: **Sirvase**. É um único find-replace se você mudar de ideia
> (minha sugestão original era *Pedível*). Decida antes do `git init` da org.

> **Como usar este documento:** é o roteiro que o Claude Desktop vai executar dentro
> do repo. Cada fase tem **objetivo**, **entregas**, **pronto quando** (definition of done)
> e **depende de**. Construa em ordem dentro de cada épico. 🔴 = caminho crítico para a
> venda. `[YAGNI]` = não construir agora. Nunca pule o "pronto quando" — ele é o que
> impede o Claude de seguir em cima de fundação quebrada.

---

## Princípios inegociáveis (valem para TODAS as fases)

1. **Modularização por porta/adaptador.** Toda integração externa (WhatsApp, LLM,
   pagamento, fonte de cardápio) é uma **interface** (`port`) com pelo menos duas
   implementações: a real e um **mock**. Trocar um provedor = trocar uma linha de
   wiring, nunca refatorar o pipeline. Se uma feature não puder ser substituída sem
   tocar no core, está errada.
2. **`.env` central única** (padrão `env-centralidade.md`): uma `.env` na raiz, config
   não-secreta versionada em `config/`, seleção por `ENVIRONMENT` + `INGRESS_MODE`,
   zero `cp` de arquivo. App, worker, webhook e compose leem a mesma fonte.
3. **Tudo em Docker.** Monorepo, um `compose.yaml` base + includes dirigidos pela `.env`.
   Postgres e Redis sobem como serviços. Dev em host puro também suportado (mesma `.env`).
4. **n8n é a rede de segurança.** Continua em produção até a versão nova provar-se.
   Nenhuma fase depende de desligar o n8n antes do shadow mode passar.
5. **Fail-fast.** Settings carregados no boot. Secret faltando ou config inválida = crash
   imediato, nunca sobe meio configurado.
6. **`tenant_id` (= `store_id`) em tudo.** Toda query, todo log, todo job carrega o tenant.
   Isolamento é responsabilidade do repositório, não opcional.
7. **Idempotência sempre.** Toda mensagem entrante é dedupada por `message_id` da Meta
   antes de qualquer efeito colateral.

---

## Arquitetura-alvo (monorepo)

```
sirvase/
├── .env                         # gitignored — secrets + ENVIRONMENT + INGRESS_MODE
├── .env.example                 # versionado — único artefato de bootstrap
├── compose.yaml                 # base: postgres, redis, webhook, worker, api, panel, proxy
├── CLAUDE.md                    # rules do agente de build
├── config/
│   ├── app/{local,staging,prod}.yaml          # CORS, pools, URLs, flags (não-secreto)
│   ├── orchestration/compose.{env}.yaml       # overrides de infra por ambiente
│   └── orchestration/ingress.{loopback,gateway,edge}.yaml
│   └── services/{db,cache,proxy}/...
├── packages/
│   ├── core/                    # domínio puro, agnóstico de framework e de I/O
│   │   ├── ports/               # INTERFACES: WhatsAppProvider, LlmProvider,
│   │   │                        #   PaymentProvider, MenuSource, *Repository
│   │   ├── pipeline/            # orquestração de uma mensagem (era o index.ts)
│   │   ├── llm/                 # promptBuilder, guard, tool-calling
│   │   ├── orders/              # domínio de pedido + schema Zod (reaproveitado)
│   │   ├── menu/                # formatação + cache (porta MenuSource)
│   │   └── tenants/             # resolução wa_number/phone_number_id → tenant
│   ├── adapters/                # IMPLEMENTAÇÕES das portas (substituíveis)
│   │   ├── whatsapp/{evolution,cloud-api,baileys-legacy,mock}/
│   │   ├── llm/{openrouter,mock}/
│   │   ├── payment/{asaas,mock}/
│   │   ├── menu/{internal-crud,external-api,mock}/
│   │   └── db/                  # repos Postgres (implementam *Repository)
│   └── config/                  # loader fail-fast da .env + config/app/{env}
├── services/
│   ├── webhook/                 # 🔴 recebe webhook Evolution/Meta → valida → SÓ enfileira → 200<5s
│   ├── worker/                  # 🔴 consome fila → pipeline → responde
│   └── api/                     # REST + JWT para o painel
├── apps/
│   ├── panel/                   # painel do tenant (Vite + React + shadcn)
│   └── site/                    # landing + página de captação [YAGNI no MVP]
└── db/
    └── migrations/              # SQL versionado (sem ORM pesado)
```

**Fluxo-alvo de uma mensagem:**
```
WhatsApp → Evolution ou Meta → POST /webhook/evolution ou /webhook/meta (services/webhook)
  → autentica (token da Evolution ou X-Hub-Signature-256 da Meta)
  → parseWebhook (adapter do provedor) extrai wa_number/phone_number_id, message_id, from, payload
  → enfileira {tenant_id?, message_id, from, payload} no Redis (BullMQ)
  → responde 200 (sempre <5s)
[assíncrono]
services/worker consome job
  → dedup por message_id (INSERT processed_messages ON CONFLICT DO NOTHING)
  → resolve tenant por wa_number (Evolution) ou wa_phone_number_id (Meta)
  → adquire lock por (tenant_id, from)   # serializa a conversa, mata o fan-out
  → carrega estado (sessions) + menu (MenuSource do tenant)
  → PromptBuilder → LlmProvider (tool-calling) → PromptGuard
  → tools: get_menu, calc_frete, criar_pedido(...)  → persiste orders (tenant_id)
  → entrega confiável ao lojista (painel + notificação, com reenvio)
  → WhatsAppProvider.sendText(resposta)  # EvolutionApiProvider ou CloudApiProvider, conforme tenants.wa_provider
  → grava estado + libera lock
```

---

# ÉPICO 0 — Fundação: monorepo, Docker, `.env` central 🔴

**P0.1 — Scaffolding do monorepo + workspaces**
- Entregas: estrutura de pastas acima; pnpm/npm workspaces; TS base config compartilhado;
  ESLint/Prettier; `.gitignore` (inclui `.env`, `ssl/`, `src/data/*.json`).
- Pronto quando: `npm install` resolve todos os workspaces; build vazio compila.
- Depende de: —

**P0.2 — Loader de config fail-fast (`packages/config`)**
- Entregas: módulo que lê `.env` + `config/app/${ENVIRONMENT}.yaml`, valida com Zod,
  e **explode no boot** se faltar secret obrigatório ou config inválida. Expõe um objeto
  `settings` tipado. Dois eixos: `ENVIRONMENT`, `INGRESS_MODE`.
- Pronto quando: subir sem `LLM_API_KEY` (ex.) crasha com mensagem clara; com tudo, expõe settings.
- Depende de: P0.1

**P0.3 — Compose base + includes dirigidos pela `.env`**
- Entregas: `compose.yaml` com `include` de `config/orchestration/compose.${ENVIRONMENT}.yaml`
  e `ingress.${INGRESS_MODE:-loopback}.yaml`; serviços postgres + redis com healthcheck;
  `.env.example` espelhando exatamente as vars.
- Pronto quando: `docker compose up -d` sobe postgres + redis saudáveis em `local`/`loopback`,
  sem nenhum `cp` de config.
- Depende de: P0.2

**P0.4 — Postgres + Redis em container, persistência e backup local**
- Entregas: volumes nomeados; script de dump/restore; Redis com password via `.env`.
- Pronto quando: dado sobrevive a `down`/`up`; `pg_dump` roda via script.
- Depende de: P0.3

**P0.5 — Proxy/ingress (Caddy ou nginx) com os três modos**
- Entregas: `loopback` (127.0.0.1, HTTP), `gateway`, `edge` (443 + TLS). Para o webhook
  da Meta você vai precisar de HTTPS público — documentar uso de túnel (cloudflared) em dev.
- Pronto quando: `/health` responde atrás do proxy nos três modos.
- Depende de: P0.3

---

# ÉPICO 1 — Banco, migrations e auth próprio (JWT) 🔴

> Você abriu mão do Supabase Auth. `profiles` (que referenciava `auth.users`) vira `users`
> com auth própria. `saas_stores` vira a base de `tenants`. Roteamento muda de
> `instance_name` (Evolution) para `wa_phone_number_id` (Cloud API).

**P1.1 — Ferramenta de migrations (sem ORM pesado)**
- Entregas: runner de migrations SQL (node-pg-migrate ou Drizzle-kit só para migration);
  `db/migrations/` versionado; comando `migrate up/down` no compose.
- Pronto quando: migration de exemplo aplica e reverte limpa.
- Depende de: P0.4

**P1.2 — Schema base evoluído do atual**
- Entregas (migrations):
  - `tenants` (evolui `saas_stores`): adiciona `wa_phone_number_id` (unique, **nova chave de
    roteamento**), `waba_id`, `status` (`trial|active|past_due|suspended`), `plan`,
    `cardapio_source` (`internal|external`). Mantém `store_name`, `store_type`,
    `catalog_api_url`, `pix_key`, `system_prompt_personality`, `config jsonb`, `active`.
  - `users` (substitui `profiles`): `id`, `email` unique, `password_hash`, `role`
    (`admin|client`), `tenant_id` FK, timestamps.
  - `orders`: mantém o schema atual (`store_id`→ trata como `tenant_id`, `items jsonb`,
    `total`, `status` enum, etc.). Adiciona `source` (`bot|painel`) e `idempotency_key`.
  - `sessions`: mantém (`context jsonb`, `last_activity`); chave de lookup passa a
    `(tenant_id, phone_number)`.
  - **Novas:** `processed_messages(message_id PK, tenant_id, received_at)` — dedup;
    `tenant_secrets(tenant_id, key, value_encrypted)` — token Cloud API por tenant cifrado;
    `subscriptions(tenant_id, plan, status, trial_ends_at, gateway_id, ...)`;
    `menu_items(tenant_id, ...)` — só se `cardapio_source = internal`.
  - `leads` e `n8n_chat_histories`: mantidos (compat n8n durante a coexistência).
- Pronto quando: `migrate up` cria tudo; seed insere o tenant **Ponto do Lanche**.
- Depende de: P1.1

**P1.3 — Isolamento por tenant na camada de repositório**
- Entregas: todo repositório recebe `tenant_id` obrigatório e injeta na query. RLS de
  Postgres **opcional** (self-hosted): se ligar, usar role de app não-privilegiada + `SET
  app.tenant_id` por transação; se não, a barreira é disciplina de repo (testada). Decisão
  registrada no `CLAUDE.md`.
- Pronto quando: teste prova que repo de um tenant nunca lê linha de outro.
- Depende de: P1.2

**P1.4 — Auth JWT própria**
- Entregas: signup/login de `users`, hash com argon2/bcrypt, JWT assinado com `JWT_SECRET`
  da `.env`, middleware de auth + escopo por `tenant_id`. Role `admin` (você) vê tudo;
  `client` vê só o próprio tenant.
- Pronto quando: login devolve JWT; rota protegida rejeita sem token e filtra por tenant.
- Depende de: P1.3

---

# ÉPICO 2 — Core modular: portas e adaptadores 🔴

**P2.1 — Definir as portas (interfaces) no `core/ports`**
- Entregas: `WhatsAppProvider` (`parseWebhook`, `sendText`, `markAsRead` — formato
  webhook+REST, não o modelo antigo em processo com `initialize`/`onMessage`), `LlmProvider`
  (generate + tool-calling), `PaymentProvider` (createSubscription, handleWebhook),
  `MenuSource` (getMenu), e os `*Repository`. Tudo com tipos, sem implementação.
- Pronto quando: core compila dependendo só de interfaces; nenhum import de SDK no core.
- Depende de: P1.4

**P2.2 — Adaptadores mock de tudo**
- Entregas: `mock` de cada porta (WhatsApp echo, LLM canned, Payment fake, Menu fixo).
- Pronto quando: pipeline roda ponta a ponta só com mocks, sem rede.
- Depende de: P2.1

**P2.3 — Migrar promptBuilder + guard + schema de pedido (reaproveitar)**
- Entregas: portar `promptBase.md`, `promptBuilder.ts`, `guard.ts` e o **schema Zod** de
  pedido para `core/`. Variáveis do prompt passam a vir do tenant (banco), não do YAML.
- Pronto quando: prompt monta a partir de um `tenant` carregado do banco.
- Depende de: P2.1

---

# ÉPICO 3 — Pipeline desacoplado: fila + idempotência 🔴

> Aqui você mata o fan-out **antes** de tocar no transporte. Ainda dá pra rodar com o
> adaptador mock/baileys — o objetivo é a refatoração do pipeline, não o Cloud API.

**P3.1 — Fila Redis + BullMQ**
- Entregas: fila `incoming-messages`; produtor e consumidor; retry com backoff + dead-letter.
- Pronto quando: job entra e é consumido; falha vai pra DLQ.
- Depende de: P0.4, P2.2

**P3.2 — `services/webhook`: só valida e enfileira**
- Entregas: endpoint que recebe payload (mock por enquanto), extrai
  `{message_id, from, payload}`, enfileira, responde 200 **sempre <5s**. Nenhum efeito
  colateral aqui.
- Pronto quando: webhook responde 200 rápido e o job aparece na fila.
- Depende de: P3.1

**P3.3 — `services/worker`: dedup + lock + pipeline**
- Entregas: worker consome; **dedup por `message_id`** (`processed_messages` ON CONFLICT);
  **lock por `(tenant_id, from)`** (Redis SETNX + TTL) para serializar a conversa; chama o
  pipeline do core; grava estado em `sessions` (Postgres).
- Pronto quando: **o teste do fan-out passa verde** — duas mensagens simultâneas do mesmo
  cliente geram UMA resposta, sem pedido duplicado.
- Depende de: P3.2, P2.3

**P3.4 — Estado de conversa: JSON → Postgres**
- Entregas: `sessions.context` como verdade; Redis só lock/efêmero. Aposenta os `*.json`.
- Pronto quando: reiniciar o worker não perde contexto de conversa.
- Depende de: P3.3

---

# ÉPICO 4 — WhatsApp: Evolution (ativo) + Cloud API (pronta, aguardando Meta) 🔴

> App da Meta ainda não foi aprovado. Decisão: **Evolution API self-hosted vira o provedor
> ativo agora** (instância nova e isolada, tanto local em dev quanto na VPS onde já roda a
> Evolution de produção real do usuário — nunca reusa a instância que atende produção via
> n8n). **Cloud API é implementada em paralelo** e fica pronta pra ativar por tenant assim
> que o app aprovar. Os dois implementam a mesma porta `WhatsAppProvider` (webhook+REST);
> trocar/adicionar provedor é **rota fixa** (`/webhook/evolution` vs `/webhook/meta`), nunca
> env var de seleção global — o pipeline/worker não sabe nem precisa saber qual originou a
> mensagem.

**P4.0 — Schema: identidade universal de roteamento**
- Entregas: migration adiciona `tenants.wa_number` (text, unique, E.164 sem "+") e
  `tenants.wa_provider` (`meta`|`evolution`, not null). `wa_phone_number_id` (já existe)
  passa a ser explicitamente "só usado quando `wa_provider='meta'`", como chave técnica
  pra montar a URL de envio da Graph API — não é mais a única forma de rotear.
- Pronto quando: migration aplica; seed do tenant Ponto do Lanche (teste) ganha `wa_number`
  + `wa_provider='evolution'`.
- Depende de: P1.2
- **Status: ✅ FEITO (sessão 5)** — echo ponta a ponta, sem fila/LLM ainda.

**P4.1 — Porta `WhatsAppProvider` webhook+REST**
- Entregas: redesenha a porta em `core/ports/whatsapp.ts` — `parseWebhook(payload):
  IncomingMessage | null`, `sendText(to, text)`, `markAsRead(to, messageId)`. Remove o
  formato antigo em processo (`initialize`/`onMessage`/typing) herdado da migração do
  Baileys. `baileys-legacy` fica só como referência histórica, não implementa a porta nova.
- Pronto quando: core compila só com a porta nova; nenhum adapter novo depende do formato
  antigo.
- Depende de: P4.0
- **Status: ✅ FEITO (sessão 5)** — echo ponta a ponta, sem fila/LLM ainda.

**P4.2 — `EvolutionApiProvider implements WhatsAppProvider` (ativo)**
- Entregas: `parseWebhook` traduz o payload da Evolution; `sendText`/`markAsRead` via REST
  dela (`EVOLUTION_API_URL`/`EVOLUTION_API_KEY`). **Dev local**: instância própria em
  `config/orchestration/compose.local.yaml` (nunca staging/prod), reaproveitando
  Postgres/Redis do stack (banco/índice lógico dedicados — não é dado multi-tenant nosso),
  volume nomeado pra persistir a sessão, webhook configurado por env var pra
  `http://webhook:3001/webhook/evolution?token=...` (rede interna Docker, sem túnel).
  **Produção**: instância nova e isolada na Evolution já existente na VPS do usuário.
- Pronto quando: mensagem de teste via Evolution local (Docker) chega no worker e o eco
  volta pelo WhatsApp real.
- Depende de: P4.1, P3.2 (webhook só enfileira)
- **Status: ✅ FEITO (sessão 5)** — echo ponta a ponta, sem fila/LLM ainda.

**P4.3 — `CloudApiProvider implements WhatsAppProvider` (pronta, não ativa)**
- Entregas: envio de texto/template via Graph API; parse do webhook real; verify (GET
  `hub.challenge`); validação `X-Hub-Signature-256`. Substitui a casca atual do
  `services/webhook` (eco direto, sem fila) por implementação real da porta. Remove
  heurística anti-ban (delay/typing/spoof) — não existe mais, nem aqui nem na Evolution.
- Pronto quando: envia e recebe numa conta de teste Meta — **mas nenhum tenant real usa
  esse provider até o app aprovar**.
- Depende de: P4.1
- **Status: ✅ FEITO (sessão 5)** — echo ponta a ponta, sem fila/LLM ainda.

**P4.4 — Resolução tenant (`wa_number` / `wa_phone_number_id`) + autenticação de entrada**
- Entregas: lookup em `tenants.wa_number` (Evolution — nome da instância) ou
  `tenants.wa_phone_number_id` (Meta) no webhook/worker. Autenticação por provedor: Meta via
  `X-Hub-Signature-256`; Evolution via token na própria URL do webhook
  (`EVOLUTION_WEBHOOK_TOKEN`, já que ela não assina payload). Número/instância desconhecida:
  descarta com log, não processa.
- Pronto quando: mensagem chega em qualquer um dos dois `/webhook/*` e o tenant correto é
  resolvido; entrada não autenticada é rejeitada; número/instância não cadastrado é
  descartado com log.
- Depende de: P4.2, P4.3
- **Status: ✅ FEITO (sessão 5)** — echo ponta a ponta, sem fila/LLM ainda.

**P4.5 — Janela de 24h + templates (só Meta)**
- Entregas: lógica que decide resposta livre (dentro da janela) vs **template aprovado**
  (fora); registrar templates de "pedido pronto"/"saiu pra entrega". Regra é exclusiva do
  Cloud API — Evolution/WhatsApp pessoal não tem essa restrição.
- Pronto quando: mensagem fora da janela usa template; dentro, texto livre.
- Depende de: P4.3

**P4.6 — Shadow mode contra o n8n (UM tenant, número de teste via Evolution)**
- Entregas: rodar o tenant da hamburgueria num **número de teste na Evolution** (nunca o
  número de produção real do n8n), em paralelo, comparando respostas. n8n segue sendo a
  produção real.
- Pronto quando: número de teste responde ponta a ponta com qualidade ≥ n8n por X dias,
  zero incidente. **Só então** considerar migrar o número real (Épico 9) — decide-se ali
  se o provedor final é Evolution ou Meta (se já aprovado).
- Depende de: P4.4, P4.5

---

# ÉPICO 5 — Tool-calling substitui o parser

> Paralelizável: melhora qualidade, não bloqueia a venda.

**P5.1 — Migrar extração de pedido para tool-calling**
- Entregas: tools `get_menu`, `calc_frete`, `criar_pedido(itens, pagamento, entrega)`;
  saída estruturada validada pelo schema Zod (reaproveitado). Aposenta `<<<JSON>>>`.
- Pronto quando: pedido sai de tool-call validada, não de regex em texto livre.
- Depende de: P3.3

**P5.2 — Preço por ID de item, não por nome**
- Entregas: `criar_pedido` referencia `item_id`; total nunca quebra por acento/grafia.
- Pronto quando: pedido com grafia errada do nome ainda fecha o total certo.
- Depende de: P5.1

**P5.3 — Frete por distância como tool**
- Entregas: portar a lógica de Haversine (a que você já tem no n8n) como `calc_frete`.
- Pronto quando: frete calculado por distância dentro do fluxo.
- Depende de: P5.1

---

# ÉPICO 6 — Multi-tenant hardening 🔴

**P6.1 — Secrets por tenant (token Cloud API cifrado)**
- Entregas: `tenant_secrets` com cifra (AES via chave da `.env`); provider lê o token do
  tenant, não do env global.
- Pronto quando: dois tenants enviam com tokens distintos; nada sensível em env global.
- Depende de: P4.2, P1.2

**P6.2 — Cache de menu por tenant**
- Entregas: cache keyed por `tenant_id`; suporta `MenuSource` interno e externo.
- Pronto quando: cardápio de um tenant nunca aparece para outro.
- Depende de: P2.x

**P6.3 — Entrega confiável do pedido ao lojista**
- Entregas: substitui "manda no grupo" por: persiste pedido + publica no painel (realtime)
  + notificação com **reenvio** se não confirmado. Pior churn é "perdi pedido".
- Pronto quando: pedido nunca se perde mesmo com falha transitória; há reentrega.
- Depende de: P3.4

**P6.4 — Handoff humano**
- Entregas: flag por conversa (`sessions.context.bot_paused`); lojista pausa o bot e assume;
  retoma depois. Requisito de confiança nº 1.
- Pronto quando: lojista pausa numa conversa, responde manual, retoma — sem o bot atropelar.
- Depende de: P6.3, Épico 7 (toggle no painel)

---

# ÉPICO 7 — Painel do tenant (Vite + React + shadcn) 🔴

> "Simples e bonito." shadcn/ui. No mesmo monorepo (`apps/panel`), consumindo `services/api`.

**P7.1 — Shell do painel + auth**
- Entregas: login (JWT da P1.4), layout shadcn (sidebar + topbar), tema; guard de rota.
- Pronto quando: login entra; rota protegida; client vê só o próprio tenant.
- Depende de: P1.4

**P7.2 — Pedidos em tempo real**
- Entregas: lista de pedidos com status (`pending→...→delivered`), atualização realtime
  (SSE/websocket), filtro por status, detalhe do pedido. **É o "ver quantos pedidos no
  WhatsApp".**
- Pronto quando: pedido criado pelo bot aparece no painel em segundos.
- Depende de: P6.3

**P7.3 — Toggle de handoff + ações de status**
- Entregas: botão pausar/retomar bot por conversa; mudar status do pedido (dispara template
  "saiu pra entrega" etc.).
- Pronto quando: pausar no painel reflete no worker; mudar status notifica o cliente.
- Depende de: P6.4, P4.3

**P7.4 — CRUD de cardápio (quando `cardapio_source = internal`)**
- Entregas: gerenciar `menu_items` (nome, preço, categoria, disponível); quando `external`,
  só mostra o `catalog_api_url`.
- Pronto quando: lojista edita cardápio e o bot reflete na próxima conversa.
- Depende de: P6.2

**P7.5 — Métricas simples [enxuto]**
- Entregas: cards de pedidos/dia, ticket médio, conversas. Nada de BI pesado.
- Pronto quando: números do dia aparecem corretos.
- Depende de: P7.2

---

# ÉPICO 8 — Billing (Asaas, mensalidade fixa, trial 14d) 🔴

**P8.1 — `PaymentProvider` Asaas**
- Entregas: criar assinatura recorrente (Pix/boleto), webhook de pagamento, status.
- Pronto quando: assinatura de teste cria e o webhook atualiza `subscriptions`.
- Depende de: P2.1

**P8.2 — Estados de tenant + gate**
- Entregas: `tenants.status`/`plan`; worker recusa/responde fallback se `suspended`;
  `trial` com `trial_ends_at` e expiração automática.
- Pronto quando: tenant suspenso não é atendido pelo bot; trial expira sozinho.
- Depende de: P8.1, P3.3

**P8.3 — Tela de assinatura no painel**
- Entregas: ver plano, status, próxima cobrança; link de pagamento.
- Pronto quando: lojista vê e regulariza pagamento pelo painel.
- Depende de: P7.1, P8.1

---

# ÉPICO 9 — Onboarding assistido + go-live (hamburgueria) 🔴

**P9.1 — Checklist de onboarding assistido (você no comando)**
- Entregas: roteiro + tela admin para você cadastrar tenant, conectar número Cloud API,
  importar cardápio, setar horário/taxa/Pix/personalidade, ativar trial.
- Pronto quando: você onboarda um tenant fim-a-fim em < 30 min sem mexer em terminal.
- Depende de: P7.x, P8.2

**P9.2 — Go-live do Ponto do Lanche em shadow → cutover**
- Entregas: rodar a hamburgueria no Sirvase em paralelo ao n8n; comparar; quando estável,
  apontar o número real e **desligar o n8n só para ela**.
- Pronto quando: opera 1 semana, nenhum pedido perdido, qualidade ≥ n8n.
- Depende de: P4.4, P6.x, P7.x

**P9.3 — Primeiro pagante NÃO-família**
- Entregas: 1 design-partner pagante onboardado pelo P9.1; suporte na primeira semana.
- Pronto quando: opera uma semana, **paga**, nenhum pedido perdido. ✅ **1ª VENDA.**
- Depende de: P9.1, P8.2, Go-to-market (doc à parte)

---

# ÉPICO 10 — Observabilidade e operação (paralelo, contínuo)

**P10.1 — Logs estruturados com `tenant_id`** (Winston/pino) — já adaptando o logger atual.
**P10.2 — Healthchecks + restart automático** de webhook/worker/api no compose.
**P10.3 — Métricas Prometheus + Grafana** [parcial — você já tem Grafana]. `[YAGNI]` afinar agora.
**P10.4 — Backup automático do Postgres** (cron de `pg_dump` + retenção). **Não-negociável antes de pagante.**
**P10.5 — Alertas básicos** (fila travada, DLQ crescendo, worker caído).

---

## Caminho crítico (a linha que leva ao dinheiro)

```
E0 → E1 → E2 → E3 → E4(shadow) → E6 → E7 → E8 → E9(venda)
```
- **E5 (tool-calling)** roda em paralelo: melhora qualidade, não bloqueia a venda.
- **E10** é contínuo, mas **P10.4 (backup)** é obrigatório antes do P9.3.

## `[YAGNI]` — não construa agora
Embedded Signup/BSP · multi-número por loja · RBAC multi-usuário · auto-scaling horizontal ·
áudio/imagem no pedido · A/B de prompt · i18n · BI/analytics rico · `apps/site` completo
(uma landing simples basta para o go-to-market).

## Decisões já travadas (não reabrir)
1. Postgres no Docker + **auth JWT própria** (sem Supabase Auth).
2. **Evolution API self-hosted é o provedor ativo agora** (app da Meta ainda não aprovado);
   **Cloud API é implementada em paralelo**, pronta pra ativar por tenant quando aprovar.
   Signup/BSP/Embedded Signup adiado nos dois casos. Você conecta o número do 1º cliente
   na mão.
3. Cardápio: **interno (CRUD) com opção externa** (`cardapio_source`).
4. **Mensalidade fixa, Asaas (Pix/boleto), trial 14 dias.**
5. **Painel shadcn** simples no MVP (pedidos realtime + handoff + cardápio).
6. **LLM via OpenRouter** (já trocou no n8n).
7. **Dois provedores de WhatsApp atrás da mesma porta** (`WhatsAppProvider`, webhook+REST),
   roteados por `tenants.wa_number`/`wa_provider` — troca/adição de provedor é rota fixa
   (`/webhook/evolution`, `/webhook/meta`), nunca env var de seleção global.
8. Mira: **food service primeiro**, 1º teste na **hamburgueria**; arquitetura genérica para outros nichos.
