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
- PII (telefone, pedido) **nunca** versionada no git. `src/data/*.json` legado não entra no novo repo.

---

## 4. WhatsApp Cloud API

- Webhook: verifica `X-Hub-Signature-256`, responde 200 **sempre** e **<5s**. Qualquer trabalho
  pesado vai para a fila. 200 atrasado faz a Meta reentregar e duplicar.
- Roteamento por `phone_number_id` → `tenant`. Número desconhecido: descarta com log, não processa.
- Respeite a **janela de 24h**: fora dela, só template aprovado. Dentro, texto livre.
- Não recrie heurística anti-ban (delay/typing/spoof) — é Baileys, morreu na migração.

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
