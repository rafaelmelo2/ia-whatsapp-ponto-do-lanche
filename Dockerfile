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

# Cria estrutura de diretórios
RUN mkdir -p scripts src/data src/clients logs

# Copia script de entrypoint do builder
COPY --from=builder /app/scripts/docker-entrypoint.sh ./scripts/docker-entrypoint.sh

# Converte quebras de linha para Unix (LF) se necessário e configura permissões
RUN if [ -f scripts/docker-entrypoint.sh ]; then \
      tr -d '\r' < scripts/docker-entrypoint.sh > scripts/docker-entrypoint.sh.tmp && \
      mv scripts/docker-entrypoint.sh.tmp scripts/docker-entrypoint.sh; \
    fi && \
    chmod +x scripts/docker-entrypoint.sh && \
    test -x scripts/docker-entrypoint.sh && \
    echo "✅ Entrypoint script preparado" && \
    head -1 scripts/docker-entrypoint.sh && \
    ls -la scripts/docker-entrypoint.sh

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

