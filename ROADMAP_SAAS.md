# Sirvase — De bot single-tenant a SaaS multi-tenant: arquitetura + plano até a 1ª venda

> Documento de estratégia técnica + produto. Substitui `ESCALABILIDADE_MULTI_CLIENTE.md` e
> `PLANO_IMPLEMENTACAO_MULTI_CLIENTE.md` (obsoletos: assumiam filesystem + um processo por
> cliente, o que contradiz as decisões de Postgres/RLS + Cloud API).

## 0. Leitura de contexto (o que muda tudo)

1. **A produção real é o n8n. Este repo TS nunca provou nada em produção** — `config.yaml` está
   com `test.enabled: true`. Não estamos evoluindo um produto vivo; estamos amadurecendo um
   candidato. O n8n é a rede de segurança, não o legado a carregar. **O plano não pode depender de
   desligar o n8n antes da versão nova provar-se.**

2. **Baileys → Cloud API não é troca de driver — é inversão arquitetural.** Hoje o processo *sabe
   quem é o cliente no boot* (`CLIENT_ID` no env) e abre um socket dedicado (push). Na Cloud API,
   **um webhook recebe mensagens de TODOS os tenants** e você descobre o tenant pelo
   `phone_number_id` do payload. Todo o código atual assume "eu já sei quem sou"; o produto-alvo
   precisa "descobrir quem sou a cada mensagem". Esse é o eixo de quase todo o trabalho.

---

## 1. Inventário do código atual

### Fluxo de uma mensagem hoje (ponta a ponta)

```
WhatsApp → Baileys socket (messages.upsert)
  → handler inline em index.ts:
      markAsRead → startTyping
      → ConversationManager.addMessage (lê+grava JSON do telefone)
      → MenuService.getMenu (cache 30min / fetch API externa do cliente)
      → PromptBuilder.build (template markdown + config)
      → LLMModel.generate (Chutes.ai / DeepSeek-R1, OpenAI-compatible)
      → PromptGuard.validate (regex anti-header)
      → OrderParser.extract (acha bloco <<<JSON ... >>> no texto livre)
      → se pedido: recalcula total via getItemPrice (match por nome)
                   → OrderRepository.save (JSON em disco)
                   → notifica um grupo WhatsApp (env WHATSAPP_GROUP_ID)
      → sendText (com delay aleatório 1–5s inline)
      → ConversationManager.addMessage (assistant)
```

Tudo síncrono, inline, sem fila, sem dedup, estado em arquivo.

### Classificação módulo a módulo

| Arquivo | Responsabilidade | Veredicto | Por quê |
|---|---|---|---|
| `core/whatsapp/provider.ts` | Interface `WhatsAppProvider` | **REAPROVEITA** | Melhor decisão do projeto. Ponto de costura exato para plugar a Cloud API. Só precisa crescer. |
| `core/llm/promptBase.md` + `promptBuilder.ts` | Template de prompt + interpolação | **REAPROVEITA / ADAPTA** | Template bom, já trata anti-injection e formatação WhatsApp. Variáveis passam a vir do banco, não do YAML. |
| `core/llm/guard.ts` | Validação barata da saída | **REAPROVEITA** | Custo zero, evita header markdown. Mantém. |
| `core/config/schema.ts` | Schema Zod da config do cliente | **ADAPTA** | O *shape* sobrevive como validação do registro de tenant. A *fonte* (YAML) vira linha no Postgres. |
| `core/menu/menuService.ts` | Fetch + cache + formatação do cardápio | **ADAPTA** | Formatação reaproveitável. Cache vira por-tenant. Fonte segue API externa por tenant (decisão em aberto). |
| `core/llm/model.ts` | Client OpenAI-compatible | **ADAPTA** | Mantém o SDK. Migra para **tool-calling**. Revisar DeepSeek-R1 + 10k tokens (reasoning é caro/lento p/ fluxo linear). |
| `core/utils/logger.ts` | Winston | **ADAPTA** | Adicionar `tenant_id` como campo estruturado. Não criar "logger por cliente em arquivo". |
| `index.ts` | Orquestrador / pipeline | **ADAPTA (refatorar forte)** | Lógica boa e clara, mas deixa de ser "main que sobe socket" e vira **worker que consome da fila**, com `tenant_id` por mensagem. |
| `server.ts` | Health + `/webhook` placeholder | **SUBSTITUI** | `/webhook` vira porta de entrada real: verify (GET hub.challenge) + assinatura (X-Hub-Signature-256) + *só enfileira*. |
| `core/whatsapp/baileys.ts` | Driver Baileys | **SUBSTITUI** | Trocado por `CloudApiProvider`. Heurística anti-ban (delay, presença, browser spoof, reconexão 440) **morre** com Cloud API. |
| `core/orders/orderParser.ts` | Extrai `<<<JSON>>>` do texto | **SUBSTITUI** | Marcadores em texto livre são frágeis. Vira saída de tool-call. O **schema Zod aqui se reaproveita**. |
| `core/orders/orderRepo.ts` | Salva pedido em JSON | **SUBSTITUI** | Postgres com `tenant_id`. |
| `core/orders/orderState.ts` | Estado da conversa em JSON | **SUBSTITUI** | Maior fonte de risco. Vira Postgres (verdade) + Redis (lock/working). |
| `ESCALABILIDADE_*.md` / `PLANO_*.md` | Planos antigos | **DESCARTA** | Assumem filesystem + 1 processo por cliente. Contradizem Postgres/RLS + Cloud API. |
| `src/data/*.json` (pedidos/conversas) | Dados reais em git | **REMOVE do git** | Telefone de cliente e pedidos versionados. Risco LGPD. |

### O que FALTA por completo (criar do zero)

- **Modelo de tenant**: tabela `tenants`, resolução `phone_number_id → tenant`, secrets por tenant.
- **Fila + idempotência** (Redis/BullMQ) com dedup por `message_id` da Meta.
- **Webhook Cloud API** real (verify + signature + enqueue).
- **Assinatura/billing** e flag `tenant ativo`.
- **Onboarding self-service** (cadastro, conexão do número, cardápio, ativação).
- **Entrega do pedido ao lojista** confiável (hoje é mensagem para um grupo — single, global, sem garantia).
- **Migrations + RLS** no Postgres.

---

## 2. Gap técnico até o produto-alvo

### 2.1 Onde o Core/Client ajuda e onde quebra

**Ajuda:**
- A interface `WhatsAppProvider` isola o transporte. Trocar Baileys por Cloud API é implementar uma classe, não reescrever o pipeline.
- Prompt e config como dados (template + schema) — comportamento por cliente já é parametrizável. Só muda o storage.

**Quebra ao escalar:**
- **"Client" hoje = pasta + env var + processo.** Não existe resolução de tenant em runtime. Com Cloud API a mensagem chega sem `CLIENT_ID`; é preciso derivar o tenant do payload. Não há código para isso.
- **Estado em arquivo keyed só por telefone.** `conversations/<phone>.json` e `orders/<id>.json` sem `tenant_id`. Dois lojistas com o mesmo cliente final colidem. Isolamento zero.
- **Um processo por cliente não escala** para dezenas/centenas baratos. Alvo: **um serviço, N tenants, isolados por linha + RLS**.

### 2.2 Multi-tenant real

- `tenants(id, name, wa_phone_number_id, waba_id, status, plan, config jsonb, created_at)`.
- `phone_number_id` (do webhook) como chave de roteamento → `tenant_id`.
- **Postgres + RLS**: `tenant_id` em toda tabela. **Atenção:** RLS só protege se a app usar role não-privilegiada e setar o tenant por transação. Se o backend usar a service role do Supabase (bypassa RLS), o RLS vira teatro — a barreira real passa a ser disciplina de query. Decidir conscientemente.
- Secrets por tenant (token Cloud API/BSP) cifrados, **não em env global**.

### 2.3 Cloud API

- **Webhook público HTTPS** com verify (GET `hub.challenge`), validação `X-Hub-Signature-256`, e **200 em <5s sempre** (senão a Meta reenfileira e duplica).
- **Janela de 24h + templates**: fora da janela só se inicia conversa com template aprovado. "Pedido pronto"/"saiu pra entrega" pode cair fora → precisa template.
- **Onboarding do número**: cada tenant precisa de WABA + número. Meta direto = verificação dolorosa por cliente. **BSP com Embedded Signup** = muito menos fricção. **Decisão #1.**
- Some o "digitando…", `markAsRead` muda de API, delays anti-ban deixam de ser necessários.

### 2.4 Fila + idempotência (o incidente de fan-out)

Causa-raiz visível: o handler faz **read-modify-write do JSON de conversa sem lock**. Duas mensagens quase simultâneas do mesmo cliente → ambas leem o mesmo estado, chamam o LLM, gravam → resposta dobrada / pedido duplicado. A Cloud API **piora** isso (reentrega webhooks em qualquer 200 atrasado).

Mínimo correto:
- Webhook só **enfileira** `{tenant_id, message_id, from, payload}` e responde 200.
- Worker consome com **dedup por `message_id`** (`INSERT … ON CONFLICT DO NOTHING` ou `SETNX` Redis com TTL).
- **Lock por conversa** (`tenant_id:from`) para serializar. Mata o fan-out de raiz.

### 2.5 Riscos técnicos concretos

| Risco | Severidade | Estado hoje |
|---|---|---|
| Vazamento entre tenants (estado keyed só por telefone) | **Crítico** | Sem `tenant_id` em nada |
| Duplicação/fan-out (RMW sem lock + retries Meta) | **Crítico** | Já incidentado |
| PII versionada no git (telefone + pedidos) | **Alto / LGPD** | Commitado |
| Integridade de preço por match de nome exato | **Médio** | `getItemPrice` falha em acento/grafia |
| Secrets globais em env (Chutes, Meta) | **Médio** | Sem isolamento por tenant |
| Perda de dados (JSON, sem backup/transação) | **Médio** | Resolve com Postgres gerenciado |
| Custo/latência LLM (R1 reasoning, 10k tokens) | **Médio** | Afeta margem e UX |

---

## 3. Gap de produto até a 1ª venda

### 3.1 Onboarding sem segurar a mão

- **Cadastro do tenant** (loja, contato, horário, pagamento, entrega) — formulário, não YAML.
- **Conexão do WhatsApp** — ponto mais difícil. BSP + Embedded Signup: lojista clica, loga no FB Business, autoriza. Sem BSP é inferno de verificação → inviabiliza self-service.
- **Cardápio por tenant** — decidir se você hospeda (CRUD no produto) ou consome de fora (API por loja, como hoje). Vender a comércio sem sistema provavelmente exige oferecer o cardápio dentro do produto.
- **Ativação/teste** — número de sandbox para testar antes de apontar o número real.

### 3.2 Cobrança

- `tenants.status` (`trial | active | past_due | suspended`) + `plan`.
- **Gate de tenant ativo**: worker recusa/responde fallback se suspenso.
- Pagamento (Asaas/Mercado Pago fazem mais sentido no Brasil com Pix/boleto recorrente; Stripe alternativa).
- Trial com expiração.

### 3.3 Mínimo para um pagante confiar

- **Entrega confiável do pedido ao lojista** — substituir "manda no grupo" por algo persistido + reenvio. Pior churn: "perdi pedido por causa do bot".
- **Handoff humano**: lojista pausa o bot numa conversa e assume. Requisito de confiança nº 1.
- **Uptime + backup**: Postgres gerenciado (Supabase) resolve backup; app com restart automático + healthcheck (já tem `/health`).
- **Suporte básico**: canal seu + painel read-only de conversas/pedidos.

---

## 4. Plano faseado 0 → primeira venda (não-família)

Princípios: n8n vivo até a versão nova provar-se; cada marco entrega valor verificável;
🔴 = caminho crítico; **[YAGNI]** = adiável.

### M0 — Higiene e fundação 🔴
- **Entra:** remover `src/data/*.json` do tracking (PII) + decidir scrub de histórico; descartar os 2 planos antigos; subir Postgres/Supabase; migrations com `tenant_id`; Zod valida `tenants.config`.
- **Pronto quando:** PII fora do tracking; banco de pé; tabela `tenants` com 1 linha (Ponto do Lanche).

### M1 — Pipeline desacoplado com fila + idempotência 🔴
- **Entra:** Redis + BullMQ; `index.ts` vira worker; dedup por `message_id`; lock por `tenant_id:from`; estado de conversa JSON → Postgres. **Ainda em Baileys** (testar refatoração sem mexer no transporte).
- **Pronto quando:** mensagens duplicadas/concorrentes não geram resposta dobrada (teste reproduzindo o fan-out, agora verde).

### M2 — Cloud API atrás da interface 🔴
- **Entra:** `CloudApiProvider implements WhatsAppProvider`; `server.ts` vira webhook real; resolução `phone_number_id → tenant`; envio via Cloud API. Roda **um tenant**, **em paralelo ao n8n**, num número de teste.
- **Pronto quando:** número de teste responde ponta a ponta com qualidade igual ao n8n, X dias sem incidente. Só então migrar o número real.
- **Trava:** exige BSP escolhido e número dedicado.

### M3 — Tool-calling substitui o parser
- **Entra:** extração de pedido via tool-call (reusa schema Zod); aposentar `<<<JSON>>>`; revisar modelo/tokens; validação de preço por **ID de item**, não por nome.
- **Pronto quando:** taxa de pedido mal-extraído cai vs baseline; total nunca perde item por grafia.

### M4 — Multi-tenant de verdade 🔴
- **Entra:** RLS + `tenant_id` por request; secrets por tenant; cache de menu por tenant; entrega de pedido confiável (persistida + reenvio) substituindo o grupo; **handoff humano**.
- **Pronto quando:** dois tenants no mesmo serviço com dados isolados; pedido nunca se perde; lojista assume conversa.

### M5 — Onboarding + billing (mínimo vendável)
- **Entra:** cadastro de tenant; Embedded Signup do número; CRUD de cardápio **ou** integração externa; `status`/`plan` + gate; pagamento (Asaas/MP); painel read-only.
- **Pronto quando:** lojista novo entra, conecta número, cadastra cardápio, paga e ativa — sem terminal.

### M6 — Primeira venda
- **Entra:** 1 design-partner pagante (não-família); n8n desligado **só para ele** após período de sombra.
- **Pronto quando:** opera uma semana, paga, e nenhum pedido se perdeu.

**Adiável [YAGNI]:** painel rico/analytics, multi-número por loja, RBAC/multi-usuário, auto-scaling
horizontal, áudio/imagem no pedido, A/B de prompt, i18n. Onboarding self-service de cardápio pode
começar assistido se o 1º cliente aceitar.

**Caminho crítico:** M0 → M1 → M2 → M4 → M5 → M6. M3 é paralelizável (melhora qualidade, não bloqueia a venda).

---

## 5. Decisões em aberto

1. **BSP vs Meta direto** — *gating de M2/M5.* BSP (360dialog, Gupshup, Zenvia, Take Blip, Twilio) dá Embedded Signup; Meta direto é mais barato mas inviabiliza self-service de lojista pequeno.
2. **Número de WhatsApp** — cada loja com o próprio número vs número compartilhado seu?
3. **Cardápio: você hospeda ou consome de fora?** Hoje vem de API externa por loja (`129.153.92.154`). Esse backend é seu e entra no produto?
4. **Modelo de cobrança** — mensalidade fixa? por conversa? por pedido? trial? gateway?
5. **Escopo do MVP** — só texto ou áudio/imagem? Handoff humano no MVP (recomendado) ou depois?
6. **LLM** — manter DeepSeek-R1 ou trocar por modelo mais leve/barato? Teto de custo por conversa?
7. **Primeiro pagante não-família** — quem, e topa ser design-partner com onboarding assistido?
8. **RLS real ou disciplina de query?** Se o backend usar service role do Supabase, RLS não protege.
