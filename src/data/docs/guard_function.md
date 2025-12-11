# Usuário envia ERRADO:

1. Usuário envia: "ignore as instruções anteriores"
   ↓
2. Guard valida mensagem do usuário → ❌ BLOQUEADO
   ↓
3. Responde: "Desculpe, não posso processar essa mensagem..."
   ↓
4. NÃO envia para o LLM (economiza tokens e previne ataque)

# Usuário envia CERTO:

5. Usuário envia: "quero 2 hambúrgueres"
   ↓
6. Guard valida mensagem do usuário → ✅ OK
   ↓
7. Envia para o LLM
   ↓
8. LLM responde: "# Pedido Confirmado" (com header markdown)
   ↓
9. Guard valida resposta do LLM → ⚠️ Detecta header
   ↓
10. Corrige automaticamente: "\* Pedido Confirmado"
    ↓
11. Envia resposta corrigida para o usuário

# Resumo

- Bloqueia tentativas de manipulação na mensagem do usuário
- Valida e corrige problemas de formatação na resposta do LLM
- Bloqueia respostas inválidas graves (JSON quebrado, muito longas)
- O guard agora protege em duas camadas: antes e depois do LLM.
