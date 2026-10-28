#!/usr/bin/env bash
# Restaura una copia de seguridad (REEMPLAZA todos los datos actuales).
# Uso:  ./restore.sh backups/maderosys-2026-10-28_0400.sql.gz
set -euo pipefail
cd "$(dirname "$0")"
[ -f .env ] && set -a && . ./.env && set +a
ARCHIVO="${1:?Indicá el archivo de copia. Ej: ./restore.sh backups/maderosys-2026-10-28_0400.sql.gz}"
[ -f "$ARCHIVO" ] || { echo "No existe $ARCHIVO" >&2; exit 1; }
USUARIO="${DB_USUARIO:-maderosys}"; NOMBRE="${DB_NOMBRE:-maderosys}"

read -r -p "Esto BORRA los datos actuales y carga $ARCHIVO. ¿Seguro? (escribí SI): " RESPUESTA
[ "$RESPUESTA" = "SI" ] || { echo "Cancelado."; exit 1; }

docker compose stop app
docker compose exec -T db psql -U "$USUARIO" -d postgres -v ON_ERROR_STOP=1 \
  -c "drop database if exists \"$NOMBRE\" with (force)" -c "create database \"$NOMBRE\""
gzip -dc "$ARCHIVO" | docker compose exec -T db psql -U "$USUARIO" -d "$NOMBRE" -v ON_ERROR_STOP=1 -q
docker compose start app
echo "Listo: datos restaurados desde $ARCHIVO"
