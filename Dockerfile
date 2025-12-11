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
COPY --from=builder /app/src ./src

# Copia script de entrypoint
COPY --from=builder /app/scripts/docker-entrypoint.sh ./scripts/docker-entrypoint.sh

# Cria estrutura de diretórios para dados
RUN mkdir -p src/data src/clients logs && \
    chmod +x scripts/docker-entrypoint.sh

# Variáveis de ambiente padrão
ENV NODE_ENV=production
ENV PORT=3000

# Expõe porta
EXPOSE 3000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Usa entrypoint para detectar CLIENT_ID automaticamente
ENTRYPOINT ["/app/scripts/docker-entrypoint.sh"]

# Comando de inicialização
CMD ["node", "dist/index.js"]

