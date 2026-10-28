#!/usr/bin/env bash
# Trae TODOS los datos desde la base anterior (la de Prisma/Vercel) a este servidor.
# REEMPLAZA lo que haya acá. Se hace una sola vez, antes de empezar a usar el servidor.
#
# Uso (la dirección de la base anterior va entre comillas; se la pasa el dueño, no se guarda en ningún archivo):
#   ./traer-datos.sh "postgres://usuario:clave@host:5432/postgres?sslmode=require"
set -euo pipefail
cd "$(dirname "$0")"
[ -f .env ] && set -a && . ./.env && set +a
ORIGEN="${1:?Falta la dirección de la base anterior (entre comillas).}"
USUARIO="${DB_USUARIO:-maderosys}"; NOMBRE="${DB_NOMBRE:-maderosys}"

read -r -p "Esto BORRA los datos de este servidor y trae los de la base anterior. ¿Seguro? (escribí SI): " RESPUESTA
[ "$RESPUESTA" = "SI" ] || { echo "Cancelado."; exit 1; }

./backup.sh || true   # por las dudas, copia de lo que haya ahora
docker compose stop app
docker compose exec -T db psql -U "$USUARIO" -d postgres -v ON_ERROR_STOP=1 \
  -c "drop database if exists \"$NOMBRE\" with (force)" -c "create database \"$NOMBRE\""
# pg_dump 17 corre dentro de un contenedor: no hace falta instalar nada en el servidor.
docker run --rm postgres:17-alpine pg_dump --no-owner --no-privileges --dbname "$ORIGEN" \
  | docker compose exec -T db psql -U "$USUARIO" -d "$NOMBRE" -v ON_ERROR_STOP=1 -q
docker compose start app
echo "Listo. Datos traídos. Verificá entrando al panel (ventas, clientes y fidelidad)."
