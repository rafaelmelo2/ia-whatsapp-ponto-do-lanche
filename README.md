# 🤖 Bot WhatsApp - Ponto do Lanche

Bot completo em Node.js para atendimento automatizado da hamburgueria Ponto do Lanche, integrado com Chutes.ai para respostas inteligentes.

## 📋 Funcionalidades

- ✅ **Recebe e envia mensagens** automaticamente via WhatsApp
- ✅ **Integração com Chutes.ai** para respostas inteligentes
- ✅ **Gerenciamento de conversas** com histórico completo
- ✅ **Contexto persistente** de pedidos e preferências
- ✅ **Instruções do agente** carregadas automaticamente
- ✅ **QR Code no terminal** para conexão fácil
- ✅ **Notificação de pedidos** para grupo do WhatsApp quando finalizados
- ✅ **Usa whatsapp-web.js** - biblioteca moderna e estável

## 📁 Estrutura do Projeto

```
.
├── src/                          # Código fonte
│   ├── bot.js                    # Bot principal
│   ├── managers/                 # Gerenciadores
│   │   └── conversationManager.js
│   ├── clients/                  # Clientes de APIs
│   │   └── chutesClient.js
│   ├── utils/                    # Utilitários
│   │   └── localProcessor.js
│   └── config/                   # Configurações
│       ├── loadInstructions.js
│       └── instrucoes_agente.md
├── data/                         # Dados gerados
│   ├── conversations/            # Conversas salvas
│   └── tokens/                   # Tokens do WhatsApp
├── package.json
├── .env                          # Variáveis de ambiente (criar você)
└── README.md
```

## 🚀 Instalação

### 1. Pré-requisitos

- **Node.js 16+** instalado
- Conta ativa no WhatsApp
- Chave de API do Chutes.ai (opcional, mas recomendado)

### 2. Instalar Dependências

```bash
npm install
```

### 3. Configurar Chutes.ai e Grupo do WhatsApp

Crie um arquivo `.env` na raiz do projeto:

```env
CHUTES_AI_API_KEY=seu_token_api_aqui
CHUTES_AI_MODEL=deepseek-ai/DeepSeek-V3.1
CONVERSATION_TIMEOUT_MINUTES=10
WHATSAPP_GROUP_ID=5511999999999-1234567890@g.us
```

> **Nota:** `CONVERSATION_TIMEOUT_MINUTES` define após quantos minutos de inatividade uma conversa expira e uma nova é criada. Padrão: 10 minutos.

> **Nota:** O `CHUTES_AI_MODEL` é opcional. Se não especificado, usará `deepseek-ai/DeepSeek-V3.1` como padrão.

> **Nota:** `WHATSAPP_GROUP_ID` é opcional, mas se configurado, os pedidos finalizados serão automaticamente enviados para o grupo. Para obter o ID do grupo:
>
> 1. Adicione o bot ao grupo do WhatsApp
> 2. Envie qualquer mensagem no grupo
> 3. Verifique os logs do bot - o ID do grupo aparecerá quando uma mensagem for recebida
> 4. O formato do ID é: `55XXXXXXXXX-XXXXXXXXXX@g.us` (número do país + número do grupo + @g.us)

### 4. Verificar Instruções do Agente

Certifique-se de que o arquivo `src/config/instrucoes_agente.md` existe e contém as instruções do agente.

## 🎯 Como Usar

### Iniciar o Bot

```bash
npm start
```

ou

```bash
node src/bot.js
```

ou use o arquivo `start.bat` (Windows)

### Conectar ao WhatsApp

1. **Um QR Code aparecerá no terminal**
2. **Abra o WhatsApp no seu celular**
3. **Vá em Configurações > Aparelhos conectados > Conectar um aparelho**
4. **Escaneie o QR Code** que aparece no terminal
5. **Aguarde a conexão** (o bot mostrará quando conectar)

### Bot Pronto!

Após conectar, o bot:

- ✅ Receberá mensagens automaticamente
- ✅ Processará com Chutes.ai (se configurado)
- ✅ Enviará respostas inteligentes
- ✅ Manterá contexto das conversas
- ✅ Enviará as instruções na primeira mensagem de cada usuário
- ✅ Enviará pedidos finalizados para o grupo configurado (se `WHATSAPP_GROUP_ID` estiver configurado)

## 📝 Como Funciona

### Primeira Mensagem

Quando um usuário envia a **primeira mensagem**:

1. O sistema cria uma nova conversa
2. As instruções de `src/config/instrucoes_agente.md` são carregadas
3. Essas instruções são enviadas como contexto para o Chutes.ai
4. O bot responde de forma inteligente baseado nas instruções

### Mensagens Subsequentes

Nas mensagens seguintes:

- O histórico da conversa é mantido
- O contexto do pedido é preservado
- O Chutes.ai usa todo o contexto para responder

## 🔧 Solução de Problemas

### Bot não conecta ao WhatsApp

1. **Verifique se Node.js está instalado**

   ```bash
   node --version
   ```

2. **Instale as dependências**

   ```bash
   npm install
   ```

3. **Limpe a sessão do WhatsApp**

   - Delete a pasta `data/tokens` se existir (criada pelo whatsapp-web.js)
   - Tente novamente

4. **Verifique os logs**
   - O bot mostra logs no terminal
   - Verifique se há erros específicos

### Chutes.ai não funciona

- Verifique se `CHUTES_AI_API_KEY` está configurado no `.env`
- Confirme que você tem créditos na conta do Chutes.ai
- O bot funcionará em modo local mesmo sem Chutes.ai

### QR Code não aparece

- Aguarde alguns segundos
- Verifique se o terminal suporta exibição de QR Code
- O QR Code também pode aparecer em uma janela do navegador

### Como obter o ID do grupo do WhatsApp

Para que os pedidos sejam enviados automaticamente para um grupo:

1. **Adicione o bot ao grupo** do WhatsApp onde deseja receber os pedidos
2. **Envie qualquer mensagem no grupo** (pode ser você ou outra pessoa)
3. **Verifique os logs do bot** no terminal - você verá algo como:
   ```
   📨 Mensagem recebida de Nome do Grupo (5511999999999-1234567890@g.us): mensagem
   ```
4. **Copie o ID do grupo** que aparece nos logs (formato: `55XXXXXXXXX-XXXXXXXXXX@g.us`)
5. **Adicione ao arquivo `.env`**:
   ```env
   WHATSAPP_GROUP_ID=5511999999999-1234567890@g.us
   ```

> **Nota:** O bot precisa estar no grupo e ter permissão para enviar mensagens. Se o grupo estiver privado ou o bot não tiver permissão, os pedidos não serão enviados.

## 🛑 Parar o Bot

Para parar o bot, pressione `Ctrl + C` no terminal.

## 📦 Dependências

- `whatsapp-web.js` - Biblioteca moderna para WhatsApp
- `qrcode-terminal` - Exibe QR Code no terminal
- `axios` - Cliente HTTP para Chutes.ai
- `dotenv` - Gerenciamento de variáveis de ambiente

## 📄 Licença

Este projeto é de código aberto e está disponível para uso livre.
