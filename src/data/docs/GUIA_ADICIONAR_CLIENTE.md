# 📝 Guia: Adicionar Novo Cliente

## Passo a Passo

### 1. Criar Estrutura de Pastas

```bash
mkdir -p src/clients/meu-novo-cliente
mkdir -p src/data/meu-novo-cliente/{conversations,orders,menu,tokens}
```

### 2. Criar Configuração

Copie o template de `src/clients/client-example/config.example.yaml`:

```bash
cp src/clients/client-example/config.example.yaml src/clients/meu-novo-cliente/config.yaml
```

Edite `src/clients/meu-novo-cliente/config.yaml` com dados do novo cliente.

**⚠️ IMPORTANTE:** O schema Zod valida automaticamente. Se faltar algum campo obrigatório, o bot não inicia.

### 3. Adicionar ao Docker Compose

Edite `docker-compose.yml` e adicione novo service:

```yaml
meu-novo-cliente:
  build:
    context: .
    dockerfile: Dockerfile
  container_name: meu-novo-cliente
  environment:
    # CLIENT_ID será detectado automaticamente do container_name
    - CHUTES_AI_API_KEY=${CHUTES_AI_API_KEY}
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
