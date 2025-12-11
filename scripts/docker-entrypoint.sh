#!/bin/sh

# Se CLIENT_ID não estiver definido, tenta inferir do nome do container
if [ -z "$CLIENT_ID" ]; then
  # O hostname no Docker geralmente é o container_name
  # Formato esperado: <CLIENT_ID> ou <CLIENT_ID>-prod
  HOST=$(hostname)
  
  # Remove sufixo "-prod" se existir
  CLIENT_ID=$(echo "$HOST" | sed 's/-prod$//')
fi

# Se ainda não tiver CLIENT_ID, mostra erro
if [ -z "$CLIENT_ID" ]; then
  echo "❌ ERRO: CLIENT_ID não definido e não foi possível inferir do nome do container!"
  echo "Hostname: $(hostname)"
  echo "Defina CLIENT_ID como variável de ambiente ou use um container_name igual ao CLIENT_ID"
  exit 1
fi

echo "✅ CLIENT_ID detectado: $CLIENT_ID"

# Exporta o CLIENT_ID para o processo Node
export CLIENT_ID

# Executa o comando original
exec "$@"

