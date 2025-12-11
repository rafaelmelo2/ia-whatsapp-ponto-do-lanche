# 🤖 Bot WhatsApp - Ponto do Lanche

Bot inteligente para WhatsApp que utiliza IA para atender clientes, processar pedidos e gerenciar conversas de forma automatizada. Desenvolvido com TypeScript e arquitetura modular Core/Client para fácil customização e escalabilidade.

## ✨ Funcionalidades

- 💬 **Atendimento Automatizado**: Responde mensagens usando IA (DeepSeek via Chutes.ai)
- 📋 **Gestão de Pedidos**: Processa e organiza pedidos dos clientes automaticamente
- 🍔 **Cardápio Dinâmico**: Busca itens via API ou arquivo JSON local
- 💰 **Cálculo Automático**: Calcula totais, taxas de entrega e descontos
- 📦 **Gestão de Estado**: Mantém contexto da conversa durante todo o atendimento
- ⚙️ **Multi-Cliente**: Suporta múltiplos clientes com configurações isoladas
- 🔒 **Guardrails**: Validação de segurança para respostas da IA
- 📊 **Persistência**: Salva conversas e pedidos em arquivos JSON
- 👥 **Comandos de Grupo**: Sistema de pausa/retomada via grupos do WhatsApp

## 🛠️ Tecnologias

- **TypeScript** - Linguagem principal
- **Baileys** - Conexão com WhatsApp
- **Chutes.ai (DeepSeek)** - Modelos de IA para processamento de linguagem natural
- **Express** - Servidor HTTP para healthcheck
- **YAML** - Configurações
- **Zod** - Validação de schemas

## 📋 Pré-requisitos

- Node.js 18+ (recomendado Node.js 20+)
- npm ou yarn
- Conta WhatsApp Business ou pessoal
- Chave de API do Chutes.ai

## 🚀 Instalação Rápida

### 1. Clone e instale

```bash
git clone <seu-repositorio>
cd ia-whatsapp-ponto-do-lanche
npm install
```

### 2. Configure o ambiente

Crie um arquivo `.env` na raiz do projeto:

```env
# Obrigatório: Chave da API do Chutes.ai
CHUTES_AI_API_KEY=sk-...

# Obrigatório: ID do cliente (deve corresponder à pasta em src/clients/)
CLIENT_ID=ponto-do-lanche

# Opcional: Porta do servidor HTTP (padrão: 3000)
PORT=3000

# Opcional: Nível de log (padrão: info)
LOG_LEVEL=info

# Opcional: Grupo para notificações de novos pedidos
PONTO_DO_LANCHE_NOTIFICATION_GROUP_ID=120363123456789@g.us

# Opcional: Grupo para comandos de controle (pausar/retomar bot)
PONTO_DO_LANCHE_COMMAND_GROUP_ID=120363123456789@g.us

# Opcional: Números de admin autorizados (separados por vírgula)
PONTO_DO_LANCHE_ADMIN_PHONES=5511999999999,5511888888888
```

### 3. Configure o cliente

Edite `src/clients/ponto-do-lanche/config.yaml` com as informações da sua loja:

- Horários de funcionamento
- Métodos de pagamento
- Configurações de entrega
- URL da API do cardápio (ou caminho para arquivo JSON)
- Tom de voz e estilo de comunicação

**💡 Dica:** Use `src/clients/client-example/config.example.yaml` como referência.

### 4. Inicie o bot

```bash
# Modo desenvolvimento
CLIENT_ID=ponto-do-lanche npm run dev

# Ou em produção
npm run build
CLIENT_ID=ponto-do-lanche npm start
```

### 5. Escaneie o QR Code

Um QR Code aparecerá no terminal. Escaneie com o WhatsApp:

1. Abra o WhatsApp no celular
2. Vá em **Configurações** > **Aparelhos conectados** > **Conectar um aparelho**
3. Escaneie o QR Code exibido no terminal

**Pronto!** O bot está ativo e pronto para receber mensagens. 🎉

## 🐳 Usando Docker

### Desenvolvimento

```bash
# Inicia o container
docker-compose up ponto-do-lanche

# Ver logs
docker-compose logs -f ponto-do-lanche

# Parar
docker-compose down
```

### Produção

```bash
# Build e start
docker-compose -f docker-compose.prod.yml up -d

# Ver logs
docker-compose -f docker-compose.prod.yml logs -f

# Parar
docker-compose -f docker-compose.prod.yml down
```

## 📁 Estrutura do Projeto

```
├── src/
│   ├── core/                    # Lógica principal (agnóstica de cliente)
│   │   ├── config/              # Carregamento e validação de config.yaml
│   │   ├── llm/                 # Integração com IA, prompts e guardrails
│   │   ├── menu/                # Serviço de busca e formatação de cardápio
│   │   ├── orders/              # Gestão de pedidos e estado da conversa
│   │   ├── whatsapp/            # Provedor de conexão (Baileys)
│   │   └── utils/               # Utilitários (logger, etc.)
│   ├── clients/                 # Configurações específicas por cliente
│   │   ├── client-example/      # Template de exemplo
│   │   └── ponto-do-lanche/     # Cliente real
│   │       └── config.yaml      # Configuração da loja
│   ├── data/                    # Dados persistidos (por cliente)
│   │   └── <CLIENT_ID>/         # Dados isolados por cliente
│   │       ├── conversations/   # Histórico de conversas
│   │       ├── orders/          # Pedidos salvos
│   │       ├── menu/            # Cache do cardápio
│   │       └── tokens/          # Tokens de autenticação WhatsApp
│   └── index.ts                 # Ponto de entrada
├── dist/                        # Build de produção
├── scripts/                     # Scripts utilitários
└── package.json
```

## ⚙️ Configuração do Cliente

O arquivo `config.yaml` permite personalizar completamente o comportamento do bot. Principais seções:

### Horários de Funcionamento

```yaml
hours:
  open: "19:00"
  close: "22:30"
  days_open: ["Segunda-feira", "Terça-feira", ...]
```

### Cardápio

Você pode carregar o cardápio de duas formas:

**Opção 1: Via API (recomendado)**

```yaml
catalog:
  api_url: "http://exemplo.com/api/menu/items"
  currency: "BRL"
  name: "Cardápio"
```

**Opção 2: Via arquivo JSON local**

```yaml
catalog:
  json_path: "catalog.json" # Arquivo em src/clients/<CLIENT_ID>/
  currency: "BRL"
  name: "Cardápio"
```

### Modelo de IA

```yaml
llm:
  model: "deepseek-ai/DeepSeek-R1-0528"
  temperature: 0.5
  max_tokens: 10000
```

**💡 Dica:** Veja `src/clients/client-example/config.example.yaml` para todas as opções disponíveis.

## 🚀 Multi-Cliente

O bot suporta múltiplos clientes. Cada cliente possui:

- Configuração própria em `src/clients/<CLIENT_ID>/config.yaml`
- Dados isolados em `src/data/<CLIENT_ID>/`
- Logs separados em `logs/<CLIENT_ID>.log`

Para adicionar um novo cliente, veja o guia completo em:
[`src/data/docs/GUIA_ADICIONAR_CLIENTE.md`](src/data/docs/GUIA_ADICIONAR_CLIENTE.md)

## 🧪 Scripts Disponíveis

- `npm run dev` - Inicia em modo desenvolvimento (com hot reload)
- `npm run build` - Compila TypeScript para JavaScript
- `npm start` - Inicia o bot em produção
- `npm run backup` - Cria backup dos dados
- `npm run docker:build` - Build das imagens Docker
- `npm run docker:up` - Inicia containers Docker
- `npm run docker:down` - Para containers Docker
- `npm run docker:logs` - Visualiza logs dos containers
- `npm run docker:prod:build` - Build para produção
- `npm run docker:prod:up` - Inicia containers em produção

## 🔧 Troubleshooting

### Bot não conecta ao WhatsApp

- Verifique se o QR Code foi escaneado corretamente
- Certifique-se de que não há outra sessão ativa
- Delete a pasta `src/data/<CLIENT_ID>/tokens/` e tente novamente

### Erro de API Key

- Verifique se a variável `CHUTES_AI_API_KEY` está configurada no `.env`
- Confirme que a chave é válida e tem créditos disponíveis

### Cardápio não carrega

- Verifique a URL da API em `config.yaml` (ou caminho do arquivo JSON)
- Confirme que a API está acessível e retorna dados válidos
- Veja os logs em `logs/<CLIENT_ID>.log` para mais detalhes

### Erro ao iniciar

- Verifique se o `CLIENT_ID` corresponde a uma pasta em `src/clients/`
- Confirme que o arquivo `config.yaml` está válido (o bot valida automaticamente)
- Veja os logs para mensagens de erro específicas

## 👤 Autor

Rafael da Silva Melo

## 🤝 Contribuindo

Contribuições são bem-vindas! Sinta-se à vontade para abrir issues ou pull requests.
