# Checklist de Validação — IA WhatsApp Ponto do Lanche

---

## Checklist 0 — "Tá pronto pra testar fora de casa?" ⏱️ (1–2h)

**Objetivo:** Garantir que o core roda liso e não te envergonha em cliente.

- [ X ] `npm run build` passa sem erro
- [ X ] `npm start` sobe sem crash
- [ X ] `.env` tem tudo que o app precisa (LLM key, menu api url default, id do cliente, etc)
- [ X ] Se o `clients/ponto-do-lanche/config.yaml` estiver faltando campo, o app explode cedo com erro claro (zod)
- [ X ] Logs aparecem em `logs/` com data/hora e contexto (não só `console.log`)

> ⚠️ **Se falhar aqui, você nem sai do seu pai.**

---

## Checklist 1 — WhatsApp (Baileys) "não pode cair"

**Objetivo:** Conexão estável e leitura correta de mensagens.

- [ X ] Autentica uma vez e salva sessão em `tokens/`
- [ X ] Reconecta sozinho após queda de internet/servidor

### Ignora:
- [ ] Mensagens de grupo
- [ ] Áudios/imagens/figurinhas (ou responde "não consigo ouvir, digite por favor")
- [ ] Mensagens vazias

### Lida com:
- [ ] Texto normal
- [ ] Mensagem citada/resposta
- [ ] Mensagens rápidas em sequência (não atropelar estado)
- [ ] Não responde duas vezes a mesma mensagem (dedupe por id/timestamp)

> ✅ **Sinal verde:** Você pode deixar ligado 6h seguidas sem precisar "reiniciar na mão".

---

## Checklist 2 — Cardápio (menuService) "sem inventar preço"

**Objetivo:** Zero alucinação de preço.

- [ ] API do cardápio responde OK

### Cache funciona:
- [ ] Usa `data/menu/cache.json`
- [ ] Tem TTL (ex: 5–10 min)

### Se API cair:
- [ ] Usa cache antigo
- [ ] Avisa no log "menu stale"

- [ ] `menuRendered` sai no formato WhatsApp (sem `#`, sem tabela quebrada)
- [ ] Validação hard no core: quando salvar pedido, recalcula preço pelo menu real
- [ ] LLM só sugere item/quantidade/obs

> ✅ **Sinal verde:** Você desliga a IA e ainda assim o pedido salvo tem valores certos.

---

## Checklist 3 — LLM + Prompt "não pode sair lixo"

**Objetivo:** Resposta consistente e JSON sempre parseável quando fecha pedido.

### Ajustes urgentes no seu `promptBase`

Hoje seu prompt tem **3 furos**:

#### 1. Títulos
- **Problema:** Você escreveu "Títulos: MAIÚSCULO EM NEGRITO."
- **Correção:** Isso é itálico no WhatsApp. Título tem que ser `*MAIÚSCULO EM NEGRITO*`

#### 2. Mono
- **Problema:** "Use somente… mono"
- **Correção:** WhatsApp mono é triple backtick. Padroniza no prompt pra não confundir modelo

#### 3. Delimitador final do JSON
- **Problema:** Você botou `> > >`
- **Correção:** Tem que ser exatamente `>>>` senão seu parser vira loteria

### Checklist do guard / model

**`guard.ts` barra resposta com:**
- [ ] `#` / `##` / `###`
- [ ] Preços não presentes no menu (você pode checar por regex de `R$` e comparar)

**Se guard falhar, você:**
- [ ] Re-pede ao modelo "corrija seguindo regras"
- [ ] No máximo 2 tentativas → depois responde com fallback "vou confirmar com atendente"

### JSON

- [ ] `orderParser.ts` extrai só entre `<<<JSON` e `>>>`
- [ ] Valida schema (`itens`, `deliveryNeeded`, `address`, `paymentMethod`)
- [ ] Se JSON inválido → pede correção ao modelo

> ✅ **Sinal verde:** Em 20 fechamentos simulados, você tem 20 JSONs válidos.

---

## Checklist 4 — Máquina de estados (orderState)

**Objetivo:** Conversa não se perde.

### Teste esses fluxos:

#### Happy path delivery
1. `oi` → cardápio
2. `item + qtd + obs`
3. `delivery?`
4. endereço
5. pagamento
6. "pode fechar" → JSON

#### Happy path retirada
- [ ] Fluxo completo sem entrega

#### Cliente muda de ideia no meio
- [ ] "troca X por Y"
- [ ] "cancela o último"

#### Cliente manda tudo de uma vez
- [ ] "quero 2 xsalada sem cebola, entrega rua tal, pix"

#### Cliente não informa endereço/pagamento
- [ ] Bot insiste do jeito certo, sem travar

> ✅ **Sinal verde:** Não importa a ordem que o cliente fala, você guia pra finalização.

---

## Checklist 5 — Persistência de pedidos (orderRepo)

**Objetivo:** Pedido salvo confiável pro dono.

- [ ] Cada pedido vai pra `data/orders/{timestamp}.json`

### Estrutura salva inclui:
- [ ] Itens com nome exato do menu
- [ ] Quantidade
- [ ] Observação
- [ ] Total recalculado pelo core
- [ ] Entrega/retirada
- [ ] Endereço
- [ ] Forma de pagamento
- [ ] Telefone do cliente

- [ ] Loga erro se falhar pra salvar

> ✅ **Sinal verde:** Dono consegue abrir 1 arquivo e entender o pedido sem IA.

---

## Checklist 6 — "Pronto pra vender piloto amanhã?"

**Objetivo:** Você não vende código. Vende resultado.

- [ ] **Oferta em 1 frase** (sem enrolar)
  > "Atendente IA no WhatsApp que responde cardápio, pega pedido e reduz tempo de atendimento em 7 dias."

### Preço piloto:
- [ ] R$300–500 por 2 semanas
- [ ] Depois vira mensalidade

### Material mínimo:
- [ ] 1 vídeo curto (30–60s) mostrando conversa real
- [ ] 1 print antes/depois
- [ ] 1 mensagem padrão de abordagem
- [ ] Lista de 20 hamburguerias pra abordar

> ✅ **Sinal verde:** Você consegue vender isso no WhatsApp em conversa de 5 minutos.

---

## Prioridade Real (o que você faz primeiro)

1. **Corrigir `promptBase`** (3 ajustes acima)
2. **Testar 20 conversas simuladas** (Checklist 3 + 4)
3. **Deixar Baileys estável 6h** (Checklist 1)
4. **Gravar vídeo demo e vender piloto** (Checklist 6)

---

## Desafio Direto 🎯

**Hoje, sem desculpa:**

### 1. Corrige agora no `promptBase.md`:
- [ ] Títulos com `*...*`
- [ ] Mono com triple backtick
- [ ] `>>>` certinho

### 2. Roda 10 simulações completas e anota:
- [ ] Quantos JSON válidos
- [ ] Onde travou o fluxo

### 3. Me manda:
- [ ] O `promptBase` corrigido
- [ ] O número de JSON válidos / 10
- [ ] 3 pontos de travamento
