#!/usr/bin/env bash
# Restaura um dump (.sql ou .sql.gz) no Postgres do Sirvase via docker compose.
# Uso: scripts/db-restore.sh <arquivo.sql[.gz]>
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f .env ] && set -a && . ./.env && set +a
: "${POSTGRES_USER:=sirvase}"
: "${POSTGRES_DB:=sirvase}"

FILE="${1:?Uso: scripts/db-restore.sh <arquivo.sql[.gz]>}"
[ -f "$FILE" ] || {
	echo "✖ Arquivo não encontrado: $FILE" >&2
	exit 1
}

echo "→ Restaurando $FILE em '$POSTGRES_DB' (isto sobrescreve dados existentes)"
if [[ "$FILE" == *.gz ]]; then
	gunzip -c "$FILE" | docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
else
	docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" <"$FILE"
fi
echo "✓ Restauração concluída"
