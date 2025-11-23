# Nova Estrutura Ponto do Lanche Bot

Refatoração completa para TypeScript com arquitetura Core/Client.

## Estrutura

- `src/core/`: Lógica principal do bot (agnóstica de cliente).
  - `config/`: Carregamento de `config.yaml`.
  - `menu/`: Serviço de busca e formatação de cardápio.
  - `llm/`: Integração com OpenAI, construção de prompts e guardrails.
  - `orders/`: Gestão de estado da conversa, parser de pedidos e persistência.
  - `whatsapp/`: Provedor de conexão (Baileys).
- `src/clients/`: Configurações específicas de cada loja.
  - `ponto-do-lanche/config.yaml`: Configuração da sua loja.

## Como Rodar

1. Certifique-se que seu arquivo `.env` tem a chave da OpenAI:
   ```env
   OPENAI_API_KEY=sk-...
   CLIENT_ID=ponto-do-lanche
   ```

2. Instale as dependências (já feito):
   ```bash
   npm install
   ```

3. Inicie o bot:
   ```bash
   npm run dev
   ```

4. Escaneie o QR Code que aparecerá no terminal.

## Desenvolvimento

- Os arquivos antigos estão em `src_legacy/`.
- Para adicionar novas funcionalidades, mexa em `src/core/`.
- Para alterar regras de negócio da loja (horários, tom de voz), edite `src/clients/ponto-do-lanche/config.yaml`.

