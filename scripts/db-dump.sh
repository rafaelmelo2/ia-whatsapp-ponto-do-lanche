#!/usr/bin/env bash
# Dump do Postgres do Sirvase via docker compose (não precisa de psql no host).
# Uso: scripts/db-dump.sh [arquivo-saida.sql.gz]
set -euo pipefail
cd "$(dirname "$0")/.."

# Carrega .env p/ POSTGRES_USER/DB (secrets ficam no container, não aqui).
[ -f .env ] && set -a && . ./.env && set +a
: "${POSTGRES_USER:=sirvase}"
: "${POSTGRES_DB:=sirvase}"

OUT="${1:-backups/sirvase-$(date +%Y%m%d-%H%M%S).sql.gz}"
mkdir -p "$(dirname "$OUT")"

echo "→ Dump de '$POSTGRES_DB' para $OUT"
docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" | gzip >"$OUT"
echo "✓ Dump concluído: $OUT ($(du -h "$OUT" | cut -f1))"
