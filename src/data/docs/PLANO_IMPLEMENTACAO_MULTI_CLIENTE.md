# 📋 Plano de Implementação - Multi-Cliente Completo

## 🎯 Objetivo

Transformar o bot WhatsApp de single-tenant para multi-tenant, permitindo rodar múltiplos clientes no mesmo repositório com isolamento completo de dados e configurações.

---

## 📊 Visão Geral das Fases

1. **Fase 0**: Preparação e Backup de Dados
2. **Fase 1**: Isolamento de Dados nos Repositórios
3. **Fase 2**: Logs Contextualizados por Cliente
4. **Fase 3**: Refatoração do Entry Point (`index.ts`)
5. **Fase 4**: Docker e Containerização
6. **Fase 5**: Testes e Validação
7. **Fase 6**: Documentação e Deploy

---

## 🔄 FASE 0: Preparação e Backup de Dados

### 📝 Objetivo

Garantir backup dos dados existentes e criar estrutura base para novos clientes.

### 🛠️ Tarefas

#### 0.1. Criar Script de Backup

**Arquivo**: `scripts/backup-data.ts`

**Ação**: Criar novo arquivo

```typescript
import fs from "fs";
import path from "path";

const DATA_DIR = path.resolve(process.cwd(), "src", "data");
const BACKUP_DIR = path.resolve(process.cwd(), "backups", `backup-${Date.now()}`);

async function backupData() {
  console.log("🔄 Iniciando backup dos dados...");

  if (!fs.existsSync(DATA_DIR)) {
    console.log("❌ Pasta de dados não encontrada!");
    return;
  }

  // Cria pasta de backup
  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  // Copia tudo
  fs.cpSync(DATA_DIR, path.join(BACKUP_DIR, "data"), { recursive: true });

  console.log(`✅ Backup criado em: ${BACKUP_DIR}`);
}

backupData();
```

**Como executar**:

```bash
npm run backup
```

**Adicionar ao `package.json`**:

```json
"scripts": {
  "backup": "ts-node scripts/backup-data.ts"
}
```

#### 0.2. Criar Script de Migração de Dados

**Arquivo**: `scripts/migrate-to-multi-client.ts`

**Ação**: Criar novo arquivo

```typescript
import fs from "fs";
import path from "path";

const OLD_DATA_DIR = path.resolve(process.cwd(), "src", "data");
const CLIENT_ID = process.env.MIGRATE_CLIENT_ID || "ponto-do-lanche";

async function migrateData() {
  console.log(`🔄 Migrando dados para estrutura multi-cliente (cliente: ${CLIENT_ID})...`);

  const NEW_DATA_DIR = path.resolve(process.cwd(), "src", "data", CLIENT_ID);

  if (!fs.existsSync(OLD_DATA_DIR)) {
    console.log("❌ Pasta de dados antiga não encontrada!");
    return;
  }

  // Cria estrutura nova
  fs.mkdirSync(NEW_DATA_DIR, { recursive: true });
  fs.mkdirSync(path.join(NEW_DATA_DIR, "conversations"), { recursive: true });
  fs.mkdirSync(path.join(NEW_DATA_DIR, "orders"), { recursive: true });
  fs.mkdirSync(path.join(NEW_DATA_DIR, "menu"), { recursive: true });
  fs.mkdirSync(path.join(NEW_DATA_DIR, "tokens"), { recursive: true });

  // Move conversations
  const oldConversationsDir = path.join(OLD_DATA_DIR, "conversations");
  if (fs.existsSync(oldConversationsDir)) {
    const files = fs.readdirSync(oldConversationsDir);
    files.forEach((file) => {
      const oldPath = path.join(oldConversationsDir, file);
      const newPath = path.join(NEW_DATA_DIR, "conversations", file);
      if (fs.statSync(oldPath).isFile()) {
        fs.copyFileSync(oldPath, newPath);
        console.log(`✅ Migrado: conversations/${file}`);
      }
    });
  }

  // Move orders
  const oldOrdersDir = path.join(OLD_DATA_DIR, "orders");
  if (fs.existsSync(oldOrdersDir)) {
    const files = fs.readdirSync(oldOrdersDir);
    files.forEach((file) => {
      const oldPath = path.join(oldOrdersDir, file);
      const newPath = path.join(NEW_DATA_DIR, "orders", file);
      if (fs.statSync(oldPath).isFile()) {
        fs.copyFileSync(oldPath, newPath);
        console.log(`✅ Migrado: orders/${file}`);
      }
    });
  }

  // Move menu cache
  const oldMenuDir = path.join(OLD_DATA_DIR, "menu");
  if (fs.existsSync(oldMenuDir)) {
    const files = fs.readdirSync(oldMenuDir);
    files.forEach((file) => {
      const oldPath = path.join(oldMenuDir, file);
      const newPath = path.join(NEW_DATA_DIR, "menu", file);
      if (fs.statSync(oldPath).isFile()) {
        fs.copyFileSync(oldPath, newPath);
        console.log(`✅ Migrado: menu/${file}`);
      }
    });
  }

  // Move tokens (se existir)
  const oldTokensDir = path.join(OLD_DATA_DIR, "tokens");
  if (fs.existsSync(oldTokensDir)) {
    const files = fs.readdirSync(oldTokensDir);
    files.forEach((file) => {
      const oldPath = path.join(oldTokensDir, file);
      const newPath = path.join(NEW_DATA_DIR, "tokens", file);
      if (fs.statSync(oldPath).isFile()) {
        fs.copyFileSync(oldPath, newPath);
        console.log(`✅ Migrado: tokens/${file}`);
      }
    });
  }

  console.log(`✅ Migração concluída! Dados em: ${NEW_DATA_DIR}`);
  console.log("⚠️  DADOS ANTIGOS AINDA EXISTEM. Remova manualmente após validação.");
}

migrateData();
```

**Como executar**:

```bash
MIGRATE_CLIENT_ID=ponto-do-lanche npm run migrate
```

**Adicionar ao `package.json`**:

```json
"scripts": {
  "migrate": "ts-node scripts/migrate-to-multi-client.ts"
}
```

#### 0.3. Atualizar `.gitignore`

**Arquivo**: `.gitignore`

**Localização**: Linhas 6-8 (seção de dados)

**Alteração**:

**ANTES**:

```
src/data/tokens/
src/data/orders/
src/data/conversations/*
```

**DEPOIS**:

```
# Dados por cliente (ignorar conteúdo, manter estrutura)
src/data/*/tokens/
src/data/*/orders/
src/data/*/conversations/*
src/data/*/menu/*.json

# Backup de dados
backups/
```

**Justificativa**: Mantém a estrutura de pastas no git, mas ignora os dados sensíveis de cada cliente.

---

## 🔐 FASE 1: Isolamento de Dados nos Repositórios

### 📝 Objetivo

Modificar todas as classes que persistem dados para incluir `clientId` no caminho, garantindo isolamento completo.

### 🛠️ Tarefas

#### 1.1. Modificar `ConversationManager`

**Arquivo**: `src/core/orders/orderState.ts`

**Alterações**:

**Linha 20-28** (Constructor):

**ANTES**:

```typescript
export class ConversationManager {
  private dataDir: string;

  constructor() {
    this.dataDir = path.resolve(process.cwd(), "src", "data", "conversations");
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }
```

**DEPOIS**:

```typescript
export class ConversationManager {
  private dataDir: string;
  private clientId: string;

  constructor(clientId: string) {
    this.clientId = clientId;
    this.dataDir = path.resolve(process.cwd(), "src", "data", clientId, "conversations");
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }
```

**Linha 48** (getFilePath no método get - linha 34):

**ANTES**:

```typescript
const archiveDir = path.join(this.dataDir, "archive");
```

**DEPOIS**:

```typescript
const archiveDir = path.join(this.dataDir, "archive");
```

_(Nenhuma alteração necessária aqui, pois `this.dataDir` já contém o clientId)_

**✅ Teste**: Verificar que não há mais referências hardcoded a "conversations" fora do constructor.

#### 1.2. Modificar `OrderRepository`

**Arquivo**: `src/core/orders/orderRepo.ts`

**Alterações**:

**Linha 6-15** (Constructor):

**ANTES**:

```typescript
export class OrderRepository {
  private dataDir: string;

  constructor() {
    // Ajuste para rodar tanto em src quanto dist
    this.dataDir = path.resolve(process.cwd(), "src", "data", "orders");
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }
```

**DEPOIS**:

```typescript
export class OrderRepository {
  private dataDir: string;
  private clientId: string;

  constructor(clientId: string) {
    this.clientId = clientId;
    // Ajuste para rodar tanto em src quanto dist
    this.dataDir = path.resolve(process.cwd(), "src", "data", clientId, "orders");
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }
```

**Linha 21** (método save - linha 17):

**Alterar log para incluir clientId**:

**ANTES**:

```typescript
logger.info(`Pedido salvo: ${order.id}`);
```

**DEPOIS**:

```typescript
logger.info(`[${this.clientId}] Pedido salvo: ${order.id}`);
```

**Linha 36** (método getById - linha 28):

**Alterar log para incluir clientId**:

**ANTES**:

```typescript
logger.error(`Erro ao ler pedido ${id}`, error);
```

**DEPOIS**:

```typescript
logger.error(`[${this.clientId}] Erro ao ler pedido ${id}`, error);
```

#### 1.3. Modificar `MenuService`

**Arquivo**: `src/core/menu/menuService.ts`

**Alterações**:

**Linha 26-32** (Class e Constructor):

**ANTES**:

```typescript
export class MenuService {
  private cache: CachedMenu | null = null;
  private config: AppConfig;

  constructor(config: AppConfig) {
    this.config = config;
  }
```

**DEPOIS**:

```typescript
export class MenuService {
  private cache: CachedMenu | null = null;
  private config: AppConfig;
  private clientId: string;

  constructor(config: AppConfig, clientId: string) {
    this.config = config;
    this.clientId = clientId;
  }
```

**Linha 107** (método getMenu - linha 100):

**Alterar log para incluir clientId**:

**ANTES**:

```typescript
logger.info(`Buscando menu em: ${this.config.menu.api_url}`);
```

**DEPOIS**:

```typescript
logger.info(`[${this.clientId}] Buscando menu em: ${this.config.menu.api_url}`);
```

**Linha 127** (método getMenu):

**Alterar log para incluir clientId**:

**ANTES**:

```typescript
logger.warn("Menu vazio ou nenhum item ativo encontrado.");
```

**DEPOIS**:

```typescript
logger.warn(`[${this.clientId}] Menu vazio ou nenhum item ativo encontrado.`);
```

**Linha 140** (método getMenu):

**Alterar log para incluir clientId**:

**ANTES**:

```typescript
logger.error("Falha ao buscar menu", error);
```

**DEPOIS**:

```typescript
logger.error(`[${this.clientId}] Falha ao buscar menu`, error);
```

**💡 Nota**: O cache em memória (`this.cache`) já é isolado por instância da classe, então não precisa de Map. Cada cliente terá sua própria instância de MenuService.

#### 1.4. Modificar `BaileysProvider`

**Arquivo**: `src/core/whatsapp/baileys.ts`

**Alterações**:

**Linha 15-25** (Class e Constructor):

**ANTES**:

```typescript
export class BaileysProvider implements WhatsAppProvider {
  private sock: any;
  private messageHandler?: (msg: IncomingMessage) => Promise<void>;
  private authPath: string;

  constructor() {
    this.authPath = path.resolve(process.cwd(), "src", "data", "tokens");
    if (!fs.existsSync(this.authPath)) {
      fs.mkdirSync(this.authPath, { recursive: true });
    }
  }
```

**DEPOIS**:

```typescript
export class BaileysProvider implements WhatsAppProvider {
  private sock: any;
  private messageHandler?: (msg: IncomingMessage) => Promise<void>;
  private authPath: string;
  private clientId: string;

  constructor(clientId: string) {
    this.clientId = clientId;
    this.authPath = path.resolve(process.cwd(), "src", "data", clientId, "tokens");
    if (!fs.existsSync(this.authPath)) {
      fs.mkdirSync(this.authPath, { recursive: true });
    }
  }
```

**Linha 74** (método initialize - linha 27):

**Alterar log para incluir clientId**:

**ANTES**:

```typescript
logger.info("Escaneie o QR Code acima para conectar.");
```

**DEPOIS**:

```typescript
logger.info(`[${this.clientId}] Escaneie o QR Code acima para conectar.`);
```

**Linha 82** (método initialize):

**Alterar log para incluir clientId**:

**ANTES**:

```typescript
logger.warn(`Conexão fechada. Razão: ${reason}. Reconectando: ${shouldReconnect}`);
```

**DEPOIS**:

```typescript
logger.warn(`[${this.clientId}] Conexão fechada. Razão: ${reason}. Reconectando: ${shouldReconnect}`);
```

**Linha 86** (método initialize):

**Alterar log para incluir clientId**:

**ANTES**:

```typescript
logger.warn(`Aguardando ${delay}ms para reconectar...`);
```

**DEPOIS**:

```typescript
logger.warn(`[${this.clientId}] Aguardando ${delay}ms para reconectar...`);
```

**Linha 91** (método initialize):

**Alterar log para incluir clientId**:

**ANTES**:

```typescript
logger.info("Conexão com WhatsApp estabelecida!");
```

**DEPOIS**:

```typescript
logger.info(`[${this.clientId}] Conexão com WhatsApp estabelecida!`);
```

**Linha 123** (método initialize):

**Alterar log para incluir clientId**:

**ANTES**:

```typescript
logger.error("Erro no handler de mensagem:", e);
```

**DEPOIS**:

```typescript
logger.error(`[${this.clientId}] Erro no handler de mensagem:`, e);
```

---

## 📝 FASE 2: Logs Contextualizados por Cliente

### 📝 Objetivo

Melhorar o sistema de logs para incluir `clientId` em todas as mensagens, facilitando debugging e monitoramento em produção.

### 🛠️ Tarefas

#### 2.1. Modificar `logger.ts` para Suportar ClientId

**Arquivo**: `src/core/utils/logger.ts`

**Alterações**:

**Substituir TODO o arquivo**:

**ANTES**:

```typescript
import winston from "winston";
import fs from "fs";
import path from "path";

const logDir = "logs";

// Garante que a pasta de logs existe
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

export const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `[${timestamp}] ${level.toUpperCase()}: ${message}`;
    })
  ),
  transports: [new winston.transports.Console(), new winston.transports.File({ filename: "logs/app.log" })]
});
```

**DEPOIS**:

```typescript
import winston from "winston";
import fs from "fs";
import path from "path";

const logDir = "logs";

// Garante que a pasta de logs existe
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

// Logger global (mantido para compatibilidade)
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message, clientId, ...meta }) => {
      const clientTag = clientId ? `[${clientId}]` : "";
      const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : "";
      return `[${timestamp}] ${clientTag} ${level.toUpperCase()}: ${message}${metaStr}`;
    })
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message, clientId, ...meta }) => {
          const clientTag = clientId ? `[${clientId}]` : "";
          const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : "";
          return `[${timestamp}] ${clientTag} ${level.toUpperCase()}: ${message}${metaStr}`;
        })
      )
    }),
    new winston.transports.File({ filename: "logs/app.log" })
  ]
});

// Factory para criar logger específico de cliente
export function createClientLogger(clientId: string): winston.Logger {
  const logFile = path.join(logDir, `${clientId}.log`);

  return winston.createLogger({
    level: process.env.LOG_LEVEL || "info",
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.printf(({ timestamp, level, message, ...meta }) => {
        const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : "";
        return `[${timestamp}] [${clientId}] ${level.toUpperCase()}: ${message}${metaStr}`;
      })
    ),
    transports: [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.timestamp(),
          winston.format.printf(({ timestamp, level, message, ...meta }) => {
            const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : "";
            return `[${timestamp}] [${clientId}] ${level.toUpperCase()}: ${message}${metaStr}`;
          })
        )
      }),
      new winston.transports.File({ filename: logFile }),
      new winston.transports.File({ filename: "logs/app.log" }) // Log global também
    ]
  });
}
```

**💡 Nota**: O logger global continua funcionando, mas agora suporta passar `clientId` como metadata. O `createClientLogger` cria um logger dedicado por cliente com arquivo próprio.

---

## 🔄 FASE 3: Refatoração do Entry Point (`index.ts`)

### 📝 Objetivo

Modificar o ponto de entrada para suportar múltiplos clientes, passando `clientId` para todas as classes que precisam.

### 🛠️ Tarefas

#### 3.1. Refatorar `index.ts`

**Arquivo**: `src/index.ts`

**Alterações**:

**Linha 15-16** (Definição de CLIENT_ID):

**ANTES**:

```typescript
// ID do cliente (poderia vir de env var)
const CLIENT_ID = process.env.CLIENT_ID || "ponto-do-lanche";
```

**DEPOIS**:

```typescript
// ID do cliente (obrigatório via env var)
const CLIENT_ID = process.env.CLIENT_ID;
if (!CLIENT_ID) {
  console.error("❌ ERRO: CLIENT_ID não definido na variável de ambiente!");
  process.exit(1);
}
```

**Linha 18-177** (Função main):

**Refatorar TODO o conteúdo da função**:

**ANTES**:

```typescript
async function main() {
  try {
    startServer(Number(process.env.PORT) || 3000);
    logger.info(`Iniciando bot para cliente: ${CLIENT_ID}`);

    // 1. Config
    const config = loadConfig(CLIENT_ID);

    // 2. Services
    const menuService = new MenuService(config);
    const promptBuilder = new PromptBuilder();
    const llm = new LLMModel(config);
    const guard = new PromptGuard();
    const parser = new OrderParser();
    const orderRepo = new OrderRepository();
    const conversationManager = new ConversationManager();
    const whatsapp = new BaileysProvider();
```

**DEPOIS**:

```typescript
async function main() {
  try {
    const port = Number(process.env.PORT) || 3000;
    startServer(port);

    // Criar logger específico do cliente
    const clientLogger = createClientLogger(CLIENT_ID);
    clientLogger.info(`Iniciando bot para cliente: ${CLIENT_ID}`);

    // 1. Config
    const config = loadConfig(CLIENT_ID);

    // 2. Services (todos recebem clientId agora)
    const menuService = new MenuService(config, CLIENT_ID);
    const promptBuilder = new PromptBuilder();
    const llm = new LLMModel(config);
    const guard = new PromptGuard();
    const parser = new OrderParser();
    const orderRepo = new OrderRepository(CLIENT_ID);
    const conversationManager = new ConversationManager(CLIENT_ID);
    const whatsapp = new BaileysProvider(CLIENT_ID);
```

**Linha 37-38** (Handler de mensagens):

**Alterar para usar clientLogger**:

**ANTES**:

```typescript
    whatsapp.onMessage(async (msg) => {
      logger.info(`Msg de ${msg.from}: ${msg.body}`);
```

**DEPOIS**:

```typescript
    whatsapp.onMessage(async (msg) => {
      clientLogger.info(`Msg de ${msg.from}: ${msg.body}`);
```

**Linha 59** (Geração de resposta LLM):

**Alterar para usar clientLogger**:

**ANTES**:

```typescript
logger.info(`Gerando resposta LLM...`);
```

**DEPOIS**:

```typescript
clientLogger.info(`Gerando resposta LLM...`);
```

**Linha 66** (Validação guard):

**Alterar para usar clientLogger**:

**ANTES**:

```typescript
logger.warn(`Resposta inválida do LLM: ${validation.reason}`);
```

**DEPOIS**:

```typescript
clientLogger.warn(`Resposta inválida do LLM: ${validation.reason}`);
```

**Linha 79** (Pedido detectado):

**Alterar para usar clientLogger**:

**ANTES**:

```typescript
logger.info("Pedido detectado!", orderExtraction);
```

**DEPOIS**:

```typescript
clientLogger.info("Pedido detectado!", orderExtraction);
```

**Linha 95** (Item não encontrado):

**Alterar para usar clientLogger**:

**ANTES**:

```typescript
logger.warn(`Item não encontrado no menu ao fechar pedido: ${item.name}`);
```

**DEPOIS**:

```typescript
clientLogger.warn(`Item não encontrado no menu ao fechar pedido: ${item.name}`);
```

**Linha 130** (Notificação enviada):

**Alterar para usar clientLogger**:

**ANTES**:

```typescript
logger.info(`Notificação enviada para o grupo ${groupID}`);
```

**DEPOIS**:

```typescript
clientLogger.info(`Notificação enviada para o grupo ${groupID}`);
```

**Linha 132** (Erro ao enviar notificação):

**Alterar para usar clientLogger**:

**ANTES**:

```typescript
logger.error(`Erro ao enviar notificação para o grupo ${groupID}`, error);
```

**DEPOIS**:

```typescript
clientLogger.error(`Erro ao enviar notificação para o grupo ${groupID}`, error);
```

**Linha 135** (Grupo não configurado):

**Alterar para usar clientLogger**:

**ANTES**:

```typescript
logger.warn("WHATSAPP_GROUP_ID não configurado na env, notificação de grupo pulada.");
```

**DEPOIS**:

```typescript
clientLogger.warn("WHATSAPP_GROUP_ID não configurado na env, notificação de grupo pulada.");
```

**Linha 161** (Erro no processamento):

**Alterar para usar clientLogger**:

**ANTES**:

```typescript
logger.error("Erro no processamento da mensagem", err);
```

**DEPOIS**:

```typescript
clientLogger.error("Erro no processamento da mensagem", err);
```

**Linha 174** (Erro fatal):

**Alterar para usar clientLogger**:

**ANTES**:

```typescript
logger.error("Fatal error no startup:", e);
```

**DEPOIS**:

```typescript
console.error("Fatal error no startup:", e);
process.exit(1);
```

**Linha 2** (Import do logger):

**Adicionar import do createClientLogger**:

**ANTES**:

```typescript
import { logger } from "./core/utils/logger.js";
```

**DEPOIS**:

```typescript
import { logger, createClientLogger } from "./core/utils/logger.js";
```

**💡 Nota**: Mantemos o import do `logger` global para compatibilidade, mas usamos principalmente o `clientLogger` criado com `createClientLogger(CLIENT_ID)`.

---

## 🐳 FASE 4: Docker e Containerização

### 📝 Objetivo

Criar infraestrutura Docker para facilitar deploy e permitir rodar múltiplas instâncias (uma por cliente).

### 🛠️ Tarefas

#### 4.1. Criar `Dockerfile`

**Arquivo**: `Dockerfile` (na raiz)

**Ação**: Criar novo arquivo

```dockerfile
# Dockerfile multi-stage para otimizar tamanho
FROM node:20-alpine AS builder

# Define diretório de trabalho
WORKDIR /app

# Copia arquivos de dependências
COPY package*.json ./
COPY tsconfig.json ./

# Instala dependências
RUN npm ci

# Copia código fonte
COPY src/ ./src/
COPY scripts/ ./scripts/

# Build da aplicação
RUN npm run build

# Stage de produção
FROM node:20-alpine

WORKDIR /app

# Instala apenas dependências de produção
COPY package*.json ./
RUN npm ci --only=production

# Copia código compilado do builder
COPY --from=builder /app/dist ./dist

# Copia assets necessários (markdown, yaml, etc)
COPY --from=builder /app/dist ./dist

# Cria estrutura de diretórios para dados
RUN mkdir -p src/data src/clients logs

# Variáveis de ambiente padrão
ENV NODE_ENV=production
ENV PORT=3000

# Expõe porta
EXPOSE 3000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Comando de inicialização
CMD ["node", "dist/index.js"]
```

#### 4.2. Criar `.dockerignore`

**Arquivo**: `.dockerignore` (na raiz)

**Ação**: Criar novo arquivo

```
node_modules
dist
.env
.env.*
*.log
logs
backups
src/data
.git
.gitignore
README*.md
*.md
tests
.vscode
.idea
.DS_Store
```

#### 4.3. Criar `docker-compose.yml` (Desenvolvimento)

**Arquivo**: `docker-compose.yml` (na raiz)

**Ação**: Criar novo arquivo

```yaml
version: "3.8"

services:
  # Cliente: Ponto do Lanche
  ponto-do-lanche:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: ia-whatsapp-ponto-do-lanche
    environment:
      - CLIENT_ID=ponto-do-lanche
      - CHUTES_AI_API_KEY=${CHUTES_AI_API_KEY}
      - PORT=3000
      - LOG_LEVEL=info
      - WHATSAPP_GROUP_ID=${WHATSAPP_GROUP_ID:-}
    volumes:
      # Monta dados persistentes
      - ./src/data/ponto-do-lanche:/app/src/data/ponto-do-lanche
      # Monta configuração do cliente (pode editar sem rebuild)
      - ./src/clients/ponto-do-lanche:/app/src/clients/ponto-do-lanche:ro
      # Monta logs
      - ./logs:/app/logs
    ports:
      - "3000:3000"
    restart: unless-stopped
    networks:
      - whatsapp-bot-network

  # Cliente: Exemplo (descomente e ajuste quando adicionar novo cliente)
  # cliente-2:
  #   build:
  #     context: .
  #     dockerfile: Dockerfile
  #   container_name: ia-whatsapp-cliente-2
  #   environment:
  #     - CLIENT_ID=cliente-2
  #     - OPENAI_API_KEY=${OPENAI_API_KEY}
  #     - PORT=3001
  #     - LOG_LEVEL=info
  #     - WHATSAPP_GROUP_ID=${WHATSAPP_GROUP_ID_CLIENTE_2:-}
  #   volumes:
  #     - ./src/data/cliente-2:/app/src/data/cliente-2
  #     - ./src/clients/cliente-2:/app/src/clients/cliente-2:ro
  #     - ./logs:/app/logs
  #   ports:
  #     - "3001:3000"
  #   restart: unless-stopped
  #   networks:
  #     - whatsapp-bot-network

networks:
  whatsapp-bot-network:
    driver: bridge
```

#### 4.4. Criar `docker-compose.prod.yml` (Produção)

**Arquivo**: `docker-compose.prod.yml` (na raiz)

**Ação**: Criar novo arquivo

```yaml
version: "3.8"

services:
  ponto-do-lanche:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: ia-whatsapp-ponto-do-lanche-prod
    environment:
      - CLIENT_ID=ponto-do-lanche
      - CHUTES_AI_API_KEY=${CHUTES_AI_API_KEY}
      - PORT=3000
      - NODE_ENV=production
      - LOG_LEVEL=info
      - WHATSAPP_GROUP_ID=${WHATSAPP_GROUP_ID:-}
    volumes:
      - ponto-do-lanche-data:/app/src/data/ponto-do-lanche
      - ./src/clients/ponto-do-lanche:/app/src/clients/ponto-do-lanche:ro
      - ponto-do-lanche-logs:/app/logs
    restart: always
    networks:
      - whatsapp-bot-network
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

volumes:
  ponto-do-lanche-data:
  ponto-do-lanche-logs:

networks:
  whatsapp-bot-network:
    driver: bridge
```

#### 4.5. Adicionar Scripts Docker ao `package.json`

**Arquivo**: `package.json`

**Localização**: Seção `scripts` (após os scripts existentes)

**Adição**:

```json
"scripts": {
  "docker:build": "docker-compose build",
  "docker:up": "docker-compose up -d",
  "docker:down": "docker-compose down",
  "docker:logs": "docker-compose logs -f",
  "docker:prod:build": "docker-compose -f docker-compose.prod.yml build",
  "docker:prod:up": "docker-compose -f docker-compose.prod.yml up -d",
  "docker:prod:down": "docker-compose -f docker-compose.prod.yml down"
}
```

#### 4.6. Melhorar Health Check no `server.ts`

**Arquivo**: `src/server.ts`

**Alterações**:

**Linha 8-10** (Endpoint /health):

**ANTES**:

```typescript
app.get("/health", (req, res) => {
  res.send({ status: "ok", uptime: process.uptime() });
});
```

**DEPOIS**:

```typescript
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "healthy",
    clientId: (global as any).CLIENT_ID || "unknown",
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});
```

**Linha 23** (Função startServer):

**ANTES**:

```typescript
export function startServer(port: number = 3000) {
  const server = app.listen(port, () => {
    logger.info(`HTTP Server rodando na porta ${port}`);
  });
```

**DEPOIS**:

```typescript
export function startServer(port: number = 3000, clientId?: string) {
  // Armazena clientId globalmente para o endpoint /health
  if (clientId) {
    (global as any).CLIENT_ID = clientId;
  }

  const server = app.listen(port, () => {
    logger.info(`HTTP Server rodando na porta ${port}${clientId ? ` (cliente: ${clientId})` : ""}`);
  });
```

**Atualizar `src/index.ts` linha 20**:

**ANTES**:

```typescript
startServer(port);
```

**DEPOIS**:

```typescript
startServer(port, CLIENT_ID);
```

---

## ✅ FASE 5: Testes e Validação

### 📝 Objetivo

Garantir que todas as mudanças funcionam corretamente e que há isolamento completo entre clientes.

### 🛠️ Tarefas

#### 5.1. Criar Script de Teste de Isolamento

**Arquivo**: `tests/isolation.test.ts`

**Ação**: Criar novo arquivo

```typescript
import fs from "fs";
import path from "path";
import { ConversationManager } from "../src/core/orders/orderState.js";
import { OrderRepository } from "../src/core/orders/orderRepo.js";
import { MenuService } from "../src/core/menu/menuService.js";
import { BaileysProvider } from "../src/core/whatsapp/baileys.js";

// Mock de config para MenuService
const mockConfig = {
  store: { id: "test", name: "Test Store" },
  menu: { api_url: "http://test.com/api" }
} as any;

describe("Isolamento Multi-Cliente", () => {
  const CLIENT_1 = "test-client-1";
  const CLIENT_2 = "test-client-2";

  afterAll(() => {
    // Limpa dados de teste
    const dataDir1 = path.resolve(process.cwd(), "src", "data", CLIENT_1);
    const dataDir2 = path.resolve(process.cwd(), "src", "data", CLIENT_2);

    if (fs.existsSync(dataDir1)) {
      fs.rmSync(dataDir1, { recursive: true, force: true });
    }
    if (fs.existsSync(dataDir2)) {
      fs.rmSync(dataDir2, { recursive: true, force: true });
    }
  });

  test("ConversationManager cria diretórios separados", () => {
    const manager1 = new ConversationManager(CLIENT_1);
    const manager2 = new ConversationManager(CLIENT_2);

    const expectedDir1 = path.resolve(process.cwd(), "src", "data", CLIENT_1, "conversations");
    const expectedDir2 = path.resolve(process.cwd(), "src", "data", CLIENT_2, "conversations");

    expect(fs.existsSync(expectedDir1)).toBe(true);
    expect(fs.existsSync(expectedDir2)).toBe(true);
    expect(expectedDir1).not.toBe(expectedDir2);
  });

  test("OrderRepository cria diretórios separados", () => {
    const repo1 = new OrderRepository(CLIENT_1);
    const repo2 = new OrderRepository(CLIENT_2);

    const expectedDir1 = path.resolve(process.cwd(), "src", "data", CLIENT_1, "orders");
    const expectedDir2 = path.resolve(process.cwd(), "src", "data", CLIENT_2, "orders");

    expect(fs.existsSync(expectedDir1)).toBe(true);
    expect(fs.existsSync(expectedDir2)).toBe(true);
    expect(expectedDir1).not.toBe(expectedDir2);
  });

  test("BaileysProvider cria diretórios de tokens separados", () => {
    const provider1 = new BaileysProvider(CLIENT_1);
    const provider2 = new BaileysProvider(CLIENT_2);

    const expectedDir1 = path.resolve(process.cwd(), "src", "data", CLIENT_1, "tokens");
    const expectedDir2 = path.resolve(process.cwd(), "src", "data", CLIENT_2, "tokens");

    expect(fs.existsSync(expectedDir1)).toBe(true);
    expect(fs.existsSync(expectedDir2)).toBe(true);
    expect(expectedDir1).not.toBe(expectedDir2);
  });

  test("ConversationManager não mistura dados entre clientes", async () => {
    const manager1 = new ConversationManager(CLIENT_1);
    const manager2 = new ConversationManager(CLIENT_2);

    // Adiciona mensagem no cliente 1
    await manager1.addMessage("5511999999999@s.whatsapp.net", "user", "Mensagem cliente 1");

    // Adiciona mensagem no cliente 2
    await manager2.addMessage("5511999999999@s.whatsapp.net", "user", "Mensagem cliente 2");

    // Verifica que não se misturaram
    const state1 = await manager1.get("5511999999999@s.whatsapp.net");
    const state2 = await manager2.get("5511999999999@s.whatsapp.net");

    expect(state1.history.length).toBe(1);
    expect(state2.history.length).toBe(1);
    expect(state1.history[0].content).toBe("Mensagem cliente 1");
    expect(state2.history[0].content).toBe("Mensagem cliente 2");
  });
});
```

**Adicionar ao `package.json`**:

```json
"scripts": {
  "test:isolation": "ts-node tests/isolation.test.ts"
}
```

**⚠️ Nota**: Você precisará instalar dependências de teste se ainda não tiver:

```bash
npm install --save-dev jest @types/jest ts-jest
```

#### 5.2. Teste Manual de Integração

**Documento**: `TESTES_MANUAIS.md` (criar na raiz)

**Ação**: Criar checklist de testes manuais

```markdown
# Checklist de Testes Manuais - Multi-Cliente

## Pré-requisitos

- [ ] Dados migrados (se aplicável)
- [ ] Build compilado: `npm run build`
- [ ] Variável `CLIENT_ID` definida no `.env`

## Teste 1: Inicialização

- [ ] Bot inicia sem erros com `CLIENT_ID=ponto-do-lanche`
- [ ] Logs mostram `[ponto-do-lanche]` em todas as mensagens
- [ ] Estrutura de pastas `src/data/ponto-do-lanche/` criada

## Teste 2: Funcionalidade Básica

- [ ] Recebe mensagem no WhatsApp
- [ ] Responde corretamente
- [ ] Salva conversa em `src/data/ponto-do-lanche/conversations/`
- [ ] Logs aparecem em `logs/ponto-do-lanche.log`

## Teste 3: Isolamento (2 clientes)

- [ ] Criar segundo cliente (ex: `cliente-teste`)
- [ ] Configurar `.env` com `CLIENT_ID=cliente-teste`
- [ ] Iniciar segunda instância (porta diferente)
- [ ] Enviar mensagem para cada bot
- [ ] Verificar que dados não se misturam:
  - [ ] `src/data/ponto-do-lanche/` só tem dados do primeiro
  - [ ] `src/data/cliente-teste/` só tem dados do segundo
  - [ ] Logs separados em arquivos diferentes

## Teste 4: Docker

- [ ] `docker-compose build` executa sem erros
- [ ] `docker-compose up` inicia containers
- [ ] Health check responde: `curl http://localhost:3000/health`
- [ ] Logs aparecem: `docker-compose logs -f`
```

---

## 📚 FASE 6: Documentação e Deploy

### 📝 Objetivo

Atualizar documentação e criar guias para adicionar novos clientes.

### 🛠️ Tarefas

#### 6.1. Criar Guia de Adição de Novo Cliente

**Arquivo**: `GUIA_ADICIONAR_CLIENTE.md` (na raiz)

**Ação**: Criar novo arquivo

````markdown
# 📝 Guia: Adicionar Novo Cliente

## Passo a Passo

### 1. Criar Estrutura de Pastas

```bash
mkdir -p src/clients/meu-novo-cliente
mkdir -p src/data/meu-novo-cliente/{conversations,orders,menu,tokens}
```
````

### 2. Criar Configuração

Copie o template de `src/clients/ponto-do-lanche/config.yaml` e ajuste:

```bash
cp src/clients/ponto-do-lanche/config.yaml src/clients/meu-novo-cliente/config.yaml
```

Edite `src/clients/meu-novo-cliente/config.yaml` com dados do novo cliente.

### 3. Adicionar ao Docker Compose

Edite `docker-compose.yml` e adicione novo service:

```yaml
meu-novo-cliente:
  build:
    context: .
    dockerfile: Dockerfile
  container_name: ia-whatsapp-meu-novo-cliente
  environment:
    - CLIENT_ID=meu-novo-cliente
    - OPENAI_API_KEY=${OPENAI_API_KEY}
    - PORT=3001
    - LOG_LEVEL=info
  volumes:
    - ./src/data/meu-novo-cliente:/app/src/data/meu-novo-cliente
    - ./src/clients/meu-novo-cliente:/app/src/clients/meu-novo-cliente:ro
    - ./logs:/app/logs
  ports:
    - "3001:3000"
  restart: unless-stopped
```

### 4. Testar Localmente

```bash
# Sem Docker
CLIENT_ID=meu-novo-cliente npm run dev

# Com Docker
docker-compose up meu-novo-cliente
```

### 5. Deploy em Produção

Ajuste `docker-compose.prod.yml` similarmente.

````

#### 6.2. Atualizar `README.md`

**Arquivo**: `README.md`

**Localização**: Seção de configuração

**Adicionar seção**:

```markdown
## 🚀 Multi-Cliente

O bot suporta múltiplos clientes. Cada cliente possui:
- Configuração própria em `src/clients/<CLIENT_ID>/config.yaml`
- Dados isolados em `src/data/<CLIENT_ID>/`
- Logs separados em `logs/<CLIENT_ID>.log`

### Rodar Localmente
```bash
CLIENT_ID=ponto-do-lanche npm run dev
````

### Rodar com Docker

```bash
docker-compose up ponto-do-lanche
```

Veja [GUIA_ADICIONAR_CLIENTE.md](./GUIA_ADICIONAR_CLIENTE.md) para adicionar novos clientes.

```

---

## 📋 Checklist Final de Implementação

Use este checklist para acompanhar o progresso:

### Fase 0: Preparação
- [ ] Script de backup criado e testado
- [ ] Script de migração criado e executado
- [ ] `.gitignore` atualizado

### Fase 1: Isolamento de Dados
- [ ] `ConversationManager` modificado (aceita `clientId`)
- [ ] `OrderRepository` modificado (aceita `clientId`)
- [ ] `MenuService` modificado (aceita `clientId`)
- [ ] `BaileysProvider` modificado (aceita `clientId`)
- [ ] Todos os logs incluem `clientId`

### Fase 2: Logs
- [ ] `logger.ts` refatorado com `createClientLogger`
- [ ] Logs por cliente funcionando

### Fase 3: Entry Point
- [ ] `index.ts` refatorado para passar `clientId` em todos os services
- [ ] `CLIENT_ID` obrigatório via env var
- [ ] Todos os logs usam `clientLogger`

### Fase 4: Docker
- [ ] `Dockerfile` criado
- [ ] `.dockerignore` criado
- [ ] `docker-compose.yml` criado (dev)
- [ ] `docker-compose.prod.yml` criado (prod)
- [ ] Scripts Docker no `package.json`
- [ ] Health check no `server.ts`

### Fase 5: Testes
- [ ] Testes de isolamento criados
- [ ] Testes passando
- [ ] Teste manual executado

### Fase 6: Documentação
- [ ] `GUIA_ADICIONAR_CLIENTE.md` criado
- [ ] `README.md` atualizado
- [ ] Documentação revisada

---

## 🎯 Ordem de Execução Recomendada

1. **Fase 0** → Fazer backup e migrar dados existentes
2. **Fase 1** → Implementar isolamento (pode testar localmente)
3. **Fase 2** → Melhorar logs
4. **Fase 3** → Refatorar entry point
5. **Testar tudo junto** → `npm run build && npm start`
6. **Fase 4** → Criar Docker
7. **Fase 5** → Testes finais
8. **Fase 6** → Documentação

---

## 🚨 Pontos de Atenção

1. **Nunca misture dados entre clientes** - Sempre verifique que `clientId` está sendo usado corretamente
2. **Backup antes de migrar** - Use o script de backup antes de qualquer migração
3. **Teste isolamento** - Sempre teste com 2 clientes antes de ir para produção
4. **Logs separados** - Cada cliente deve ter seu próprio arquivo de log
5. **Tokens do WhatsApp** - Cada cliente precisa escanear QR Code separadamente

---

**Última atualização**: 2025-01-27
**Versão do Plano**: 1.0

```
