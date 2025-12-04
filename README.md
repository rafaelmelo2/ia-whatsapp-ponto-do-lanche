# 🤖 Bot WhatsApp - Ponto do Lanche

Bot inteligente para WhatsApp que utiliza IA para atender clientes, processar pedidos e gerenciar conversas de forma automatizada. Desenvolvido com TypeScript e arquitetura modular Core/Client para fácil customização e escalabilidade.

## ✨ Funcionalidades

- 💬 **Atendimento Automatizado**: Responde mensagens usando IA (DeepSeek/OpenAI)
- 📋 **Gestão de Pedidos**: Processa e organiza pedidos dos clientes
- 🍔 **Cardápio Dinâmico**: Busca e exibe itens do menu via API
- 💰 **Cálculo de Valores**: Calcula totais, taxas de entrega e descontos
- 📦 **Gestão de Estado**: Mantém contexto da conversa durante todo o atendimento
- ⚙️ **Configuração Flexível**: Sistema de configuração por cliente via YAML
- 🔒 **Guardrails**: Validação de segurança para respostas da IA
- 📊 **Persistência**: Salva conversas e pedidos em arquivos JSON

## 🛠️ Tecnologias

- **TypeScript** - Linguagem principal
- **Baileys** - Conexão com WhatsApp
- **OpenAI/DeepSeek** - Modelos de IA para processamento de linguagem natural
- **Express** - Servidor HTTP (opcional)
- **YAML** - Configurações
- **Zod** - Validação de schemas

## 📋 Pré-requisitos

- Node.js 18+ (recomendado Node.js 20+)
- npm ou yarn
- Conta WhatsApp Business ou pessoal
- Chave de API da OpenAI ou acesso ao Chutes.ai (DeepSeek)

## 🚀 Instalação

1. **Clone o repositório:**

   ```bash
   git clone <seu-repositorio>
   cd ia-whatsapp-ponto-do-lanche
   ```

2. **Instale as dependências:**

   ```bash
   npm install
   ```

3. **Configure as variáveis de ambiente:**

   Crie um arquivo `.env` na raiz do projeto:

   ```env
   # Obrigatório: Chave da API da OpenAI ou Chutes.ai
   OPENAI_API_KEY=sk-...

   # Obrigatório: ID do cliente (deve corresponder à pasta em src/clients/)
   CLIENT_ID=ponto-do-lanche

   # Opcional: Porta do servidor HTTP (padrão: 3000)
   PORT=3000
   ```

4. **Configure o cliente:**

   Edite `src/clients/ponto-do-lanche/config.yaml` com as informações da sua loja:

   - Horários de funcionamento
   - Métodos de pagamento
   - Configurações de entrega
   - URL da API do cardápio
   - Tom de voz e estilo de comunicação

## 🎯 Como Usar

1. **Inicie o bot em modo desenvolvimento:**

   ```bash
   npm run dev
   ```

   Ou em produção:

   ```bash
   npm run build
   npm start
   ```

2. **Escaneie o QR Code:**

   Um QR Code aparecerá no terminal. Escaneie com o WhatsApp no seu celular:

   - Abra o WhatsApp
   - Vá em Configurações > Aparelhos conectados > Conectar um aparelho
   - Escaneie o QR Code exibido no terminal

3. **Pronto!** O bot está ativo e pronto para receber mensagens.

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
│   │   └── ponto-do-lanche/
│   │       └── config.yaml      # Configuração da loja
│   ├── data/                    # Dados persistidos
│   │   ├── conversations/       # Histórico de conversas
│   │   ├── orders/              # Pedidos salvos
│   │   └── menu/                # Cache do cardápio
│   └── index.ts                 # Ponto de entrada
├── dist/                        # Build de produção
├── tests/                       # Testes unitários
└── package.json
```

## ⚙️ Configuração

O arquivo `config.yaml` permite personalizar completamente o comportamento do bot:

- **Horários**: Define quando o bot está disponível
- **Pagamentos**: Métodos aceitos pela loja
- **Entrega**: Taxas, tempo estimado e configurações
- **Cardápio**: URL da API e moeda
- **Tom de Voz**: Estilo de comunicação e uso de emojis
- **LLM**: Modelo de IA e parâmetros (temperature, max_tokens)

Exemplo de configuração:

```yaml
store:
  id: "ponto-do-lanche"
  name: "Ponto do Lanche"
  phone: "+5511999999999"

hours:
  open: "19:00"
  close: "22:30"
  days_open: ["Segunda-feira", "Terça-feira", ...]

llm:
  model: "deepseek-ai/DeepSeek-R1-0528"
  temperature: 0.5
  max_tokens: 10000
```

## 🧪 Desenvolvimento

### Scripts Disponíveis

- `npm run dev` - Inicia em modo desenvolvimento (com hot reload)
- `npm run build` - Compila TypeScript para JavaScript
- `npm start` - Inicia o bot em produção
- `npm test` - Executa testes unitários

### Adicionando Novas Funcionalidades

- **Lógica do bot**: Edite arquivos em `src/core/`
- **Regras de negócio**: Modifique `src/clients/<cliente>/config.yaml`
- **Novos clientes**: Crie uma nova pasta em `src/clients/` com seu `config.yaml`

### Arquivos Legados

Os arquivos antigos estão preservados em `_backup_legacy/` para referência.

## 🔧 Troubleshooting

### Bot não conecta ao WhatsApp

- Verifique se o QR Code foi escaneado corretamente
- Certifique-se de que não há outra sessão ativa
- Delete a pasta `src/data/tokens/` e tente novamente

### Erro de API Key

- Verifique se a variável `OPENAI_API_KEY` está configurada no `.env`
- Confirme que a chave é válida e tem créditos disponíveis

### Cardápio não carrega

- Verifique a URL da API em `config.yaml`
- Confirme que a API está acessível e retorna dados válidos
- Veja os logs em `logs/app.log` para mais detalhes

## 📝 Licença

[Adicione sua licença aqui]

## 👤 Autor

[Seu nome]

## 🤝 Contribuindo

Contribuições são bem-vindas! Sinta-se à vontade para abrir issues ou pull requests.
