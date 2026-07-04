# CLAUDE.md — Rules de build do Sirvase

Você (Claude) está construindo o **Sirvase**: um SaaS multi-tenant de atendimento e pedidos
via WhatsApp para food service, em **TypeScript/Node**, **Docker**, **Postgres** e **Redis**.
Siga `PLANO_EXECUCAO.md` fase a fase. Este arquivo define COMO construir. Em conflito entre
um pedido pontual e estas rules, **pare e pergunte** — não quebre a arquitetura no improviso.

---

## 0. Regras de ouro (quebrar = refazer)

1. **Porta/adaptador sempre.** Nenhum SDK externo (Meta, OpenRouter, Asaas) é importado fora
   de `packages/adapters`. O `core` depende só de interfaces em `core/ports`. Se você precisa
   importar um SDK no core, está errado — crie/expanda uma porta.
2. **Toda porta tem um mock.** Antes do adaptador real, exista o mock. O pipeline tem que
   rodar ponta a ponta só com mocks, sem rede.
3. **`tenant_id` é obrigatório** em toda query, job, log e cache key. Nunca há query sem
   tenant. Repositório que não recebe `tenant_id` é bug.
4. **Idempotência antes de efeito colateral.** Toda mensagem entrante é dedupada por
   `message_id` antes de chamar LLM, gravar pedido ou responder.
5. **`.env` central única.** Secrets só na `.env` da raiz. Config não-secreta em
   `config/app/{env}`. Zero `.env` em subpasta. Zero `cp` de config. Seleção por
   `ENVIRONMENT` + `INGRESS_MODE`.
6. **Fail-fast.** Config carregada no boot; secret/obrigatório faltando = crash com mensagem
   clara. Nunca suba meio configurado nem use `process.env` espalhado (só via `packages/config`).
7. **n8n é a produção real.** Nada que você construir pode pressupor desligar o n8n. Shadow
   mode primeiro, cutover por tenant depois.

---

## 1. Estrutura e fronteiras

- `packages/core` — domínio puro. Sem I/O, sem rede, sem SDK, sem `process.env`. Testável isolado.
- `packages/adapters` — implementações das portas. Único lugar com SDKs.
- `packages/config` — loader fail-fast da `.env` + `config/app/{env}`. **Única** fonte de settings.
- `packages/db` — migrations + repositórios (implementam `*Repository` do core).
- `services/webhook` — recebe Meta, valida assinatura, **só enfileira**, responde 200 <5s.
- `services/worker` — consome fila, dedup, lock, pipeline.
- `services/api` — REST + JWT para o painel.
- `apps/panel` — Vite + React + **shadcn/ui**. Consome `services/api`. Sem lógica de domínio.

**Regra de import:** `apps`/`services` → `core` + `adapters` + `config`. `core` não importa
`adapters` nem `services`. Dependência aponta sempre para dentro (hexagonal).

---

## 2. Convenções de código

- TypeScript estrito (`strict: true`). Sem `any` implícito. Erros tipados.
- **Zod** valida toda entrada externa (webhook, body de API, config, saída de tool-call).
- Validação de pedido reusa o **schema Zod existente** — não reinvente.
- Async sempre com tratamento de erro; nunca engula exceção silenciosa.
- Log estruturado (pino/winston) com `tenant_id`, `message_id`, `from` como campos. Nunca logue
  segredo nem PII além do necessário (telefone mascarado quando der).
- Nomes em inglês no código; comentários podem ser PT-BR. Mensagens ao usuário final em PT-BR.

---

## 3. Banco e migrations

- Toda mudança de schema é uma **migration versionada** em `db/migrations`. Nunca altere o banco
  fora de migration.
- `tenant_id` (= `store_id`) em toda tabela de dados. Índices por `(tenant_id, ...)`.
- Isolamento: repositório injeta `tenant_id` em toda query. **Se ligar RLS**, use role de app
  não-privilegiada + `SET app.tenant_id` por transação; **se a app usar role privilegiada, RLS
  não protege** — nesse caso o isolamento é disciplina de repositório, e isso precisa de teste.
- **Decisão (P1.3): RLS DESLIGADO por ora.** A barreira é disciplina de repositório: todo repo
  escopado recebe `tenantId` como 1º argumento e injeta `WHERE tenant_id = $1` (ports em
  `@sirvase/core/ports/repositories`, impl. `Pg*Repository` em `@sirvase/db`). Provado por
  `packages/db/test/tenantIsolation.test.ts` (leitura/escrita cross-tenant → null/0 linhas).
  Reavaliar RLS no Épico 6 (hardening). Ao ligar, criar role app não-privilegiada nas migrations.
- PII (telefone, pedido) **nunca** versionada no git. `src/data/*.json` legado não entra no novo repo.

---

## 4. WhatsApp — dois provedores atrás da mesma porta (Evolution + Cloud API)

- Porta `WhatsAppProvider` (core) é **webhook + REST**, não em processo: `parseWebhook(payload):
  IncomingMessage | null`, `sendText(to, text)`, `markAsRead(to, messageId)`. Sem `initialize`/
  `onMessage`/typing — isso era o modelo antigo (Baileys em processo). `baileys-legacy` fica só
  como referência histórica, nunca implementa a porta nova.
- Dois adapters reais convivem por **rota fixa**, nunca por env var de seleção: `POST
  /webhook/evolution` sempre usa `EvolutionApiProvider`; `GET/POST /webhook/meta` sempre usa
  `CloudApiProvider`. O worker/pipeline não sabe nem se importa qual originou a mensagem.
- **Evolution é o provedor ativo agora** (app da Meta ainda não aprovado); Cloud API fica
  implementada e testável em paralelo, ativada por tenant quando aprovar.
- Webhook: responde 200 **sempre** e **<5s**. Qualquer trabalho pesado vai para a fila. 200
  atrasado faz a Meta reentregar e duplicar (regra vale pros dois provedores, por consistência).
- Roteamento de tenant é único pros dois: `tenants.wa_number` (E.164, sem "+") é a identidade
  universal. Instância Evolution é **sempre criada com nome = `wa_number`** do tenant — resolve
  tenant é `WHERE wa_number = instance`. Na Meta, `wa_phone_number_id` continua como chave
  técnica exigida pela Graph API pra enviar (o `display_phone_number` do payload normalizado
  bate com `wa_number`, mas o envio exige o ID — não tem como fugir disso). Número/instância
  desconhecida: descarta com log, não processa.
- Autenticação de entrada por provedor: Meta valida `X-Hub-Signature-256`; Evolution não assina
  payload, então autentica por **token na própria URL do webhook**
  (`/webhook/evolution?token=...`, de `EVOLUTION_WEBHOOK_TOKEN`), validado antes de processar.
  Nunca deixar esse POST público sem autenticação.
- Janela de 24h (resposta livre vs. template aprovado) é regra exclusiva da Meta — Evolution/
  WhatsApp pessoal não tem essa restrição.
- Dev local: Evolution roda em container próprio só em `config/orchestration/compose.local.yaml`
  (nunca staging/prod), reaproveitando Postgres/Redis do stack (banco/índice lógico dedicados —
  não é dado multi-tenant nosso). Sessão persistida em volume; trocar de máquina de
  desenvolvimento exige novo QR (a mesma sessão não roda em duas instâncias Evolution
  simultâneas). Produção real aponta pra Evolution já existente na VPS do usuário, numa
  **instância nova e isolada** — nunca reusa a instância/número que atende produção real via n8n.
- Não recrie heurística anti-ban (delay/typing/spoof) em nenhum dos dois — é Baileys por baixo
  dos dois, mesma lição de antes: morreu na migração.

---

## 5. LLM (OpenRouter) e tool-calling

- Acesso a modelo só via porta `LlmProvider` (adaptador OpenRouter). Modelo e parâmetros vêm de
  config/tenant, nunca hardcoded.
- Fluxo de pedido é **tool-calling**, não regex em texto livre. Tools: `get_menu`, `calc_frete`,
  `criar_pedido`. Saída validada por Zod. Preço por **`item_id`**, nunca por nome.
- Prompt montado pelo `promptBuilder` a partir do `tenant` (personalidade, horário, taxa, Pix).
  Mantenha o `PromptGuard` (validação barata anti-injection/header).
- Controle de custo: sem reasoning desnecessário para fluxo linear; registre tokens por conversa.

---

## 6. Fila, idempotência e concorrência

- Fila Redis (BullMQ) com retry + backoff + **dead-letter**.
- Dedup por `message_id` (`INSERT processed_messages ON CONFLICT DO NOTHING` ou SETNX Redis com TTL).
- **Lock por `(tenant_id, from)`** para serializar a conversa. É o que mata o fan-out — não remova.
- Worker idempotente: reprocessar o mesmo job não pode gerar pedido/resposta duplicado.

---

## 7. Definition of Done (toda fase)

Uma fase só está pronta quando: (a) bate o "pronto quando" do `PLANO_EXECUCAO.md`;
(b) tem teste no caminho crítico (especialmente fan-out, idempotência, isolamento de tenant);
(c) sobe via `docker compose up` sem passo manual escondido; (d) não vazou secret nem PII;
(e) não quebrou nenhuma das Regras de Ouro. Se não bater, não avance — pergunte.

---

## 8. Quando perguntar (não adivinhe)

- Mudança que afete isolamento entre tenants, schema de banco ou contrato de uma porta.
- Qualquer coisa que exija desligar/alterar o fluxo do n8n.
- Escolha de biblioteca nova não trivial (peso, manutenção).
- Ambiguidade entre "rápido agora" e uma Regra de Ouro: a Regra vence; confirme o caminho.

## 9. Não construir (YAGNI)
BSP/Embedded Signup, multi-número por loja, RBAC multi-usuário, auto-scaling, áudio/imagem no
pedido, A/B de prompt, i18n, BI rico. Se achar que precisa, pergunte antes.
