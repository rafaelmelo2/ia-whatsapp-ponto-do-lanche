# Migração para MongoDB

Este documento descreve a migração do sistema de persistência de arquivos JSON para MongoDB.

## 📋 O que foi migrado

### ✅ Dados migrados
- **Pedidos (Orders)** - Todos os pedidos salvos anteriormente em JSON
- **Conversas (Conversations)** - Conversas ativas e arquivadas
- **Agendamentos (Appointments)** - Todos os agendamentos
- **Números bloqueados** - Sistema de bloqueio agora persiste no MongoDB

### 📁 Arquitetura MongoDB

#### Coleções
- `orders` - Pedidos por cliente (índice: clientId)
- `conversations` - Conversas por cliente (índice: clientId, phone)
- `appointments` - Agendamentos por cliente (índice: clientId)
- `blockednumbers` - Números bloqueados por cliente (índice: clientId, phone)
- `photos` - Metadados das fotos dos pedidos (índice: clientId, orderId)

#### Schemas
Os schemas MongoDB estão em `src/core/database/models/`:
- `Order.ts`
- `Conversation.ts`
- `Appointment.ts`
- `BlockedNumber.ts`
- `Photo.ts` (Novo)

#### Repositórios
Os repositórios MongoDB estão em `src/core/database/repositories/`:
- `OrderRepository.ts`
- `ConversationRepository.ts`
- `AppointmentRepository.ts`
- `BlockedNumberRepository.ts`
- `PhotoRepository.ts` (Novo)

Os repositórios antigos foram atualizados para usar MongoDB internamente, mantendo a mesma interface pública.

## 🚀 Como usar

### 1. Configurar MongoDB

#### Opção A: Docker (Recomendado)
O `docker-compose.yml` já inclui um serviço MongoDB:
```bash
docker-compose up -d mongodb
```

#### Opção B: MongoDB local
Instale MongoDB localmente e configure a variável de ambiente:
```bash
export MONGODB_URI="mongodb://localhost:27017/whatsapp-bot"
```

### 2. Variáveis de Ambiente

Adicione ao seu `.env`:
```env
MONGODB_URI=mongodb://mongodb:27017/whatsapp-bot  # Para Docker
# ou
MONGODB_URI=mongodb://localhost:27017/whatsapp-bot  # Para local
```

### 3. Migrar dados existentes

Se você já tem dados em JSON, migre para MongoDB:
```bash
npm run migrate:mongodb <client-id>
```

Exemplo:
```bash
npm run migrate:mongodb emunah
npm run migrate:mongodb ponto-do-lanche
```

**⚠️ IMPORTANTE: Segurança dos dados**
- O script de migração **APENAS COPIA** os dados para o MongoDB
- Os arquivos JSON originais **NÃO SÃO APAGADOS** e permanecem intactos
- Você pode manter os JSONs como backup permanente
- O script detecta automaticamente se está rodando dentro ou fora do Docker e ajusta a conexão

### 4. Iniciar a aplicação

A aplicação agora se conecta automaticamente ao MongoDB ao iniciar:
```bash
npm run dev
# ou
docker-compose up
```

## 🔍 Consultas úteis

### MongoDB Compass (Interface Gráfica)

Para conectar ao MongoDB usando o MongoDB Compass:

#### Se o MongoDB está rodando no Docker:
Como o `docker-compose.yml` expõe a porta `27017` para o host, você pode conectar diretamente:

**String de conexão no Compass:**
```
mongodb://localhost:27017/whatsapp-bot
```

**Ou conecte sem especificar o database:**
```
mongodb://localhost:27017
```
Depois selecione o database `whatsapp-bot` no Compass.

#### Se o MongoDB está instalado localmente:
Use a mesma string de conexão:
```
mongodb://localhost:27017/whatsapp-bot
```

### MongoDB Shell (mongosh)

Conectar ao MongoDB:
```bash
docker exec -it whatsapp-bot-mongodb mongosh
# ou
mongosh mongodb://localhost:27017/whatsapp-bot
```

### Exemplos de consultas

```javascript
// Ver todos os pedidos de um cliente
db.orders.find({ clientId: "emunah" }).sort({ createdAt: -1 })

// Ver conversas ativas
db.conversations.find({ clientId: "emunah", isArchived: false })

// Ver números bloqueados
db.blockednumbers.find({ clientId: "emunah", isActive: true })

// Estatísticas de pedidos
db.orders.aggregate([
  { $match: { clientId: "emunah" } },
  { $group: { _id: "$status", count: { $sum: 1 } } }
])
```

## 📊 Benefícios da migração

1. **Performance**: Queries mais rápidas com índices
2. **Escalabilidade**: MongoDB escala melhor que arquivos JSON
3. **Consultas complexas**: Facilita buscar, filtrar e agregar dados
4. **Dashboard**: Base perfeita para criar APIs e dashboards
5. **Persistência de bloqueios**: Números bloqueados não se perdem ao reiniciar

## ⚠️ Notas importantes

### Segurança dos dados
- ✅ Os arquivos JSON antigos **NÃO SÃO DELETADOS** automaticamente durante a migração
- ✅ O script **APENAS COPIA** os dados para o MongoDB (não move nem apaga)
- ✅ Você pode manter os JSONs como backup permanente
- ✅ Todos os arquivos originais permanecem intactos após a migração

### Funcionamento
- O sistema agora usa **apenas MongoDB** para operações de leitura/escrita de dados transacionais
- As fotos (arquivos de imagem) continuam sendo salvas em disco, mas seus **metadados agora são salvos no MongoDB**
- O script detecta automaticamente o ambiente (Docker ou local) e ajusta a conexão

## 🐛 Troubleshooting

### Erro de conexão: "getaddrinfo ENOTFOUND mongodb"

Este erro ocorre quando o script tenta conectar ao MongoDB usando o hostname `mongodb` (nome do serviço Docker) mas está sendo executado fora do Docker.

**Solução:**
1. O script agora detecta automaticamente o ambiente e ajusta a URI
2. Se ainda ocorrer, certifique-se de que o MongoDB está rodando:
   ```bash
   # Se estiver usando Docker
   docker-compose ps mongodb
   docker-compose up -d mongodb
   
   # Se estiver usando MongoDB local
   # Verifique se o serviço está rodando na porta 27017
   ```

3. Você pode definir manualmente a URI no `.env`:
   ```env
   # Para executar fora do Docker (WSL, local, etc)
   MONGODB_URI=mongodb://localhost:27017/whatsapp-bot
   ```

### Dados não aparecem após migração
Verifique os logs da migração e confirme que não houve erros. Os dados podem já existir no MongoDB (upsert não sobrescreve se já existir).

### Performance lenta
Certifique-se de que os índices foram criados. MongoDB cria índices automaticamente na primeira inserção.

### Arquivos foram apagados?
**Não, isso não deve acontecer!** O script apenas lê os arquivos JSON e copia para o MongoDB. Se algum arquivo foi apagado, pode ter sido por outro motivo. Os arquivos originais devem permanecer intactos após a migração.

