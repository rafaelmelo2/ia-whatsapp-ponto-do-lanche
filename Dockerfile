# Dockerfile único para todos os serviços. Escolha o entrypoint via build-arg:
#   docker build --build-arg SERVICE_ENTRY=services/worker/src/index.ts .
# Mantido genérico de propósito — um só artefato, N serviços.
FROM oven/bun:1.3 AS base
WORKDIR /app

# 1) Manifests primeiro (camada de deps cacheável). bun.lock + libsignal override
#    evitam o git clone (que falha em ambientes confinados).
COPY package.json bun.lock ./
COPY packages/core/package.json packages/core/
COPY packages/config/package.json packages/config/
COPY packages/adapters/package.json packages/adapters/
COPY packages/db/package.json packages/db/
COPY services/api/package.json services/api/
COPY services/webhook/package.json services/webhook/
COPY services/worker/package.json services/worker/
RUN bun install --frozen-lockfile

# 2) Código-fonte + config não-secreta versionada.
COPY . .

# Entry escolhido no build; default = api.
ARG SERVICE_ENTRY=services/api/src/index.ts
ENV SERVICE_ENTRY=${SERVICE_ENTRY}

EXPOSE 3000
# shell form p/ expandir a env var em runtime.
CMD bun run ${SERVICE_ENTRY}
