# 🚀 Estratégia de Escalabilidade Multi-Cliente

## 📋 Visão Geral

Este documento analisa as opções arquiteturais para escalar o bot WhatsApp para múltiplos clientes, considerando os prós, contras e recomendação baseada no contexto atual do projeto.

---

## 🎯 Situação Atual

O projeto já possui uma **arquitetura Core/Client** bem estruturada:

- **`src/core/`**: Lógica principal agnóstica de cliente (reutilizável)
- **`src/clients/<CLIENT_ID>/`**: Configurações específicas por cliente (YAML)
- **`src/data/`**: Dados persistidos (conversations, orders, menu cache)

**Observação Importante**: Atualmente, os dados em `src/data/` **não estão separados por cliente**. Todos os clientes compartilhariam as mesmas pastas de dados se rodassem na mesma instância.

---

## 🔀 Opções de Arquitetura

### **Opção 1: Monorepo com Pasta `clients/` (Recomendada ✅)**

#### 📁 Estrutura Proposta

```
ia-whatsapp-ponto-do-lanche/
├── src/
│   ├── core/                    # Lógica compartilhada
│   ├── clients/                 # Configurações por cliente
│   │   ├── ponto-do-lanche/
│   │   │   └── config.yaml
│   │   ├── cliente-2/
│   │   │   └── config.yaml
│   │   └── cliente-3/
│   │       └── config.yaml
│   ├── data/                    # Dados separados por cliente
│   │   ├── ponto-do-lanche/
│   │   │   ├── conversations/
│   │   │   ├── orders/
│   │   │   └── menu/
│   │   ├── cliente-2/
│   │   │   └── ...
│   │   └── cliente-3/
│   │       └── ...
│   └── index.ts
```

#### ✅ Vantagens

1. **Manutenção Centralizada**

   - Um único código base para todos os clientes
   - Correções de bugs e melhorias beneficiam todos simultaneamente
   - Atualização de dependências uma vez só

2. **Desenvolvimento Eficiente**

   - Compartilhamento de código e lógica entre clientes
   - Testes unitários cobrem toda a base
   - CI/CD único para deploy

3. **Economia de Recursos**

   - Uma instância pode rodar múltiplos clientes (com adaptação)
   - Menos overhead de infraestrutura
   - Deploy simplificado

4. **Gestão de Configurações**

   - Facilidade para comparar configurações entre clientes
   - Template de config pode ser replicado
   - Versionamento unificado

5. **Escalabilidade Horizontal Simplificada**
   - Pode rodar múltiplas instâncias da mesma aplicação
   - Load balancer pode distribuir por CLIENT_ID
   - Failover mais simples

#### ❌ Desvantagens

1. **Isolamento de Dados**

   - Precisa garantir separação rigorosa dos dados por cliente
   - Bugs no código podem afetar múltiplos clientes (mitigado por testes)

2. **Deploy Acoplado**

   - Mudanças no core exigem teste em todos os clientes
   - Rollback afeta todos (pode ser mitigado com feature flags)

3. **Compartilhamento de Recursos**

   - Se rodar na mesma instância, um cliente pode impactar performance do outro
   - Precisa de rate limiting e isolamento de memória

4. **Segurança**
   - Risco de vazamento de dados entre clientes se não houver isolamento adequado
   - Logs podem misturar dados de diferentes clientes

#### 🛠️ O Que Precisa Ser Adaptado

1. **Separação de Dados por Cliente**

   ```typescript
   // Exemplo: ConversationManager precisa receber clientId
   const dataDir = path.resolve(
     process.cwd(),
     "src",
     "data",
     clientId, // ← Novo
     "conversations"
   );
   ```

2. **Suporte a Múltiplas Instâncias**

   - Modificar `src/index.ts` para aceitar múltiplos CLIENT_IDs
   - Ou criar um processo supervisor que inicia uma instância por cliente

3. **Isolamento de Cache**

   - MenuService precisa cachear por cliente
   - Tokens do WhatsApp separados por cliente

4. **Logs Contextualizados**
   - Adicionar `clientId` em todos os logs
   - Estruturar logs para fácil filtragem

#### 📊 Quando Usar

- ✅ Você controla todos os clientes
- ✅ A maioria dos clientes usa funcionalidades similares
- ✅ Você quer manutenção centralizada
- ✅ Você tem entre 1-50 clientes (pode escalar mais com otimizações)
- ✅ Clientes não precisam de customizações muito específicas no core

---

### **Opção 2: Repositórios Separados por Cliente**

#### 📁 Estrutura Proposta

```
ia-whatsapp-ponto-do-lanche/          # Repo base/core
├── src/core/
└── README.md

ia-whatsapp-cliente-2/                # Novo repo
├── src/
│   ├── clients/cliente-2/
│   │   └── config.yaml
│   └── data/
└── package.json (referencia o core via npm/git submodule)

ia-whatsapp-cliente-3/                # Outro repo
└── ...
```

#### ✅ Vantagens

1. **Isolamento Total**

   - Cada cliente tem seu próprio repositório
   - Zero risco de vazamento de dados ou código
   - Deploy independente

2. **Customizações Específicas**

   - Cliente pode ter forks com modificações próprias
   - Não precisa esperar releases do core
   - Flexibilidade máxima

3. **Privacidade e Segurança**

   - Configurações sensíveis ficam em repos separados
   - Compliance mais fácil (LGPD, etc.)
   - Cliente pode ter controle total do seu repo

4. **Responsabilidade Clara**

   - Fácil identificar qual cliente tem qual versão
   - Rollback independente
   - Cada cliente tem seu próprio histórico Git

5. **Colaboração com Cliente**
   - Cliente pode ter acesso ao seu próprio repo
   - Não expõe código/config de outros clientes
   - Cliente pode fazer PRs específicos

#### ❌ Desvantagens

1. **Duplicação de Código**

   - Core precisa ser compartilhado (npm package, git submodule, ou copy-paste)
   - Manutenção torna-se complexa (mudanças no core precisam ser aplicadas em N repos)

2. **Overhead de Manutenção**

   - Bug fix precisa ser aplicado em múltiplos lugares
   - Atualização de dependências multiplicada
   - CI/CD precisa ser configurado por cliente

3. **Complexidade de Gestão**

   - Múltiplos repositórios para gerenciar
   - Versionamento do core complicado
   - Sincronização de mudanças é trabalhosa

4. **Custo de Infraestrutura**

   - Cada cliente pode precisar de sua própria instância/servidor
   - Mais recursos computacionais
   - Mais complexidade de deploy

5. **Desenvolvimento Mais Lento**
   - Testar mudanças exige atualizar múltiplos repos
   - Feature flags mais complexos
   - Debugging mais difícil (onde está o bug?)

#### 🛠️ Opções de Implementação

**2.1. Core como Pacote NPM Privado**

```json
// package.json do cliente
{
  "dependencies": {
    "@sua-empresa/ia-whatsapp-core": "^2.0.0"
  }
}
```

- ✅ Versionamento semântico
- ✅ Atualizações via `npm update`
- ❌ Precisa de registry privado (npm, GitHub Packages, etc.)

**2.2. Git Submodule**

```
ia-whatsapp-cliente-2/
├── core/ (submodule apontando para ia-whatsapp-ponto-do-lanche)
└── src/
```

- ✅ Código sempre sincronizado
- ❌ Git submodules são complicados de gerenciar
- ❌ Todos clientes teriam acesso ao core completo

**2.3. Monorepo com Workspaces**

```
workspace/
├── packages/
│   ├── core/
│   ├── cliente-1/
│   ├── cliente-2/
│   └── cliente-3/
└── package.json (workspaces)
```

- ✅ Boa para monorepo
- ✅ Compartilhamento eficiente
- ❌ Ainda é um único repo (meio-termo)

#### 📊 Quando Usar

- ✅ Clientes precisam de customizações muito específicas no core
- ✅ Isolamento de dados/privacidade é crítico
- ✅ Clientes querem controle total do seu código
- ✅ Você tem poucos clientes (1-5)
- ✅ Cada cliente tem orçamento para manter seu próprio ambiente
- ✅ Compliance exige separação total (ex: saúde, financeiro)

---

## 🏆 Recomendação: **Opção 1 (Monorepo com `clients/`)**

### Justificativa

Baseado na análise do código atual e nas necessidades típicas de um bot SaaS:

1. **Arquitetura Já Preparada**: O projeto já segue o padrão Core/Client, facilitando a evolução
2. **Eficiência Operacional**: Manutenção centralizada economiza tempo e reduz erros
3. **Escalabilidade Progressiva**: Pode começar simples e evoluir para múltiplas instâncias conforme cresce
4. **Economia de Recursos**: Uma instância pode servir múltiplos clientes (com isolamento adequado)

### 🚨 Pontos de Atenção Críticos

Se escolher a Opção 1, **DEVE implementar**:

1. **Isolamento Rigoroso de Dados**

   - Dados separados por cliente em `src/data/<CLIENT_ID>/`
   - Validação para garantir que um cliente não acessa dados de outro

2. **Suporte a Múltiplas Instâncias**

   - Uma instância por cliente OU
   - Múltiplos clientes na mesma instância com isolamento de memória

3. **Logs e Monitoramento**

   - Todos os logs devem incluir `clientId`
   - Métricas separadas por cliente

4. **Testes Abrangentes**
   - Testes de isolamento de dados
   - Testes de multi-tenancy

---

## 🔧 Plano de Implementação (Opção 1)

### Fase 1: Isolamento de Dados ✅

Modificar as classes que persistem dados para incluir `clientId`:

**1.1. ConversationManager**

```typescript
// src/core/orders/orderState.ts
constructor(clientId: string) {
  this.dataDir = path.resolve(
    process.cwd(),
    "src",
    "data",
    clientId,  // ← Adicionar
    "conversations"
  );
}
```

**1.2. OrderRepository**

```typescript
// src/core/orders/orderRepo.ts
constructor(clientId: string) {
  this.dataDir = path.resolve(
    process.cwd(),
    "src",
    "data",
    clientId,  // ← Adicionar
    "orders"
  );
}
```

**1.3. MenuService**

```typescript
// src/core/menu/menuService.ts
// Cache deve ser por cliente (usar Map ou objeto indexado)
private cache: Map<string, CachedMenu> = new Map();
```

**1.4. BaileysProvider**

```typescript
// src/core/whatsapp/baileys.ts
// Tokens do WhatsApp devem ser por cliente
private tokensDir: string;

constructor(clientId: string) {
  this.tokensDir = path.resolve(
    process.cwd(),
    "src",
    "data",
    clientId,  // ← Adicionar
    "tokens"
  );
}
```

### Fase 2: Modificar Entry Point

**2.1. Suporte a Múltiplos Clientes na Mesma Instância**

```typescript
// src/index.ts
const CLIENT_IDS = process.env.CLIENT_IDS?.split(",") || [process.env.CLIENT_ID || "ponto-do-lanche"];

async function startBotForClient(clientId: string) {
  const config = loadConfig(clientId);
  // ... resto do código
}

// Inicia um bot por cliente
for (const clientId of CLIENT_IDS) {
  startBotForClient(clientId).catch((err) => {
    logger.error(`Erro ao iniciar bot para ${clientId}`, err);
  });
}
```

**2.2. Ou: Uma Instância por Cliente (Recomendado para Produção)**

```typescript
// src/index.ts
const CLIENT_ID = process.env.CLIENT_ID || "ponto-do-lanche";
// ... resto do código existente
```

Usar um processo supervisor (PM2, Docker Compose, Kubernetes) para iniciar uma instância por cliente.

### Fase 3: Logs Contextualizados

```typescript
// src/core/utils/logger.ts
export function createLogger(clientId: string) {
  return winston.createLogger({
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json(),
      winston.format.metadata({ clientId }) // ← Adicionar
    )
    // ...
  });
}
```

### Fase 4: Validação e Testes

1. **Teste de Isolamento**

   - Criar dois clientes de teste
   - Verificar que dados não se misturam
   - Verificar que conversas são independentes

2. **Teste de Performance**
   - Rodar múltiplos clientes na mesma instância
   - Monitorar uso de memória/CPU
   - Verificar que não há vazamento de recursos

---

## 📦 Exemplo: Estrutura Final Recomendada

```
ia-whatsapp-ponto-do-lanche/
├── src/
│   ├── core/
│   │   ├── config/
│   │   ├── llm/
│   │   ├── menu/
│   │   ├── orders/
│   │   ├── whatsapp/
│   │   └── utils/
│   ├── clients/
│   │   ├── ponto-do-lanche/
│   │   │   └── config.yaml
│   │   ├── cliente-2/
│   │   │   └── config.yaml
│   │   └── cliente-3/
│   │       └── config.yaml
│   ├── data/
│   │   ├── ponto-do-lanche/
│   │   │   ├── conversations/
│   │   │   ├── orders/
│   │   │   ├── menu/
│   │   │   └── tokens/
│   │   ├── cliente-2/
│   │   │   └── ...
│   │   └── cliente-3/
│   │       └── ...
│   └── index.ts
├── .env.example
├── docker-compose.yml (opcional, para múltiplas instâncias)
└── README.md
```

### Docker Compose Exemplo (Uma Instância por Cliente)

```yaml
version: "3.8"
services:
  ponto-do-lanche:
    build: .
    environment:
      - CLIENT_ID=ponto-do-lanche
      - OPENAI_API_KEY=${OPENAI_API_KEY}
    volumes:
      - ./src/data/ponto-do-lanche:/app/src/data/ponto-do-lanche
    restart: unless-stopped

  cliente-2:
    build: .
    environment:
      - CLIENT_ID=cliente-2
      - OPENAI_API_KEY=${OPENAI_API_KEY}
    volumes:
      - ./src/data/cliente-2:/app/src/data/cliente-2
    restart: unless-stopped
```

---

## 🔄 Migração da Estrutura Atual

Se você já tem dados na estrutura antiga (`src/data/conversations/`, `src/data/orders/`), será necessário migrar:

1. **Backup dos Dados Atuais**

   ```bash
   cp -r src/data src/data.backup
   ```

2. **Script de Migração**

   ```typescript
   // scripts/migrate-to-multi-client.ts
   const CLIENT_ID = "ponto-do-lanche";
   const oldDataDir = path.resolve("src/data");
   const newDataDir = path.resolve("src/data", CLIENT_ID);

   // Move conversations
   fs.renameSync(path.join(oldDataDir, "conversations"), path.join(newDataDir, "conversations"));

   // Move orders
   fs.renameSync(path.join(oldDataDir, "orders"), path.join(newDataDir, "orders"));

   // Move menu cache
   fs.renameSync(path.join(oldDataDir, "menu"), path.join(newDataDir, "menu"));
   ```

---

## 🎯 Decisão Final

**Recomendação: Comece com Opção 1 (Monorepo) e evolua conforme necessário.**

### Por quê?

- ✅ Alinha com a arquitetura atual
- ✅ Menor fricção para começar
- ✅ Escala bem até dezenas de clientes
- ✅ Pode migrar para Opção 2 no futuro se necessário

### Quando Reconsiderar (migrar para Opção 2)?

- Clientes exigem customizações muito específicas no core
- Requisitos de compliance exigem isolamento total
- Mais de 50 clientes ativos (pode ser melhor separar)
- Clientes querem controle total do código

---

## 📝 Checklist de Implementação

- [ ] Refatorar `ConversationManager` para aceitar `clientId`
- [ ] Refatorar `OrderRepository` para aceitar `clientId`
- [ ] Refatorar `MenuService` para cache por cliente
- [ ] Refatorar `BaileysProvider` para tokens por cliente
- [ ] Adicionar `clientId` em todos os logs
- [ ] Migrar dados existentes para estrutura nova
- [ ] Criar testes de isolamento
- [ ] Atualizar `.gitignore` para ignorar `src/data/*/` (exceto estrutura)
- [ ] Documentar processo de adicionar novo cliente
- [ ] Configurar CI/CD para testar múltiplos clientes
- [ ] Criar template de `config.yaml` para novos clientes

---

## 📚 Referências e Boas Práticas

- **Multi-tenancy**: Garantir isolamento completo entre tenants
- **SaaS Architecture**: Padrões de arquitetura para software como serviço
- **Microservices vs Monolith**: Trade-offs de cada abordagem
- **Data Isolation**: Práticas de isolamento de dados em aplicações multi-tenant

---

**Última atualização**: 2025-01-27  
**Versão do Documento**: 1.0
