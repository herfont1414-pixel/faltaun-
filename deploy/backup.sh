#!/usr/bin/env bash
# Copia de seguridad de la base de MaderoSys: un archivo comprimido por corrida, en
# deploy/backups/, y se borran las de más de 30 días (cambiable con DIAS_A_GUARDAR).
# Opcional: COPIA_REMOTA="usuario@otra-maquina:/ruta/" para mandarlas también a otro equipo (rsync por SSH).
# Uso manual:  ./backup.sh        Programado:  ver LEEME-SERVIDOR.md (cron)
set -euo pipefail
cd "$(dirname "$0")"
[ -f .env ] && set -a && . ./.env && set +a

DIAS_A_GUARDAR="${DIAS_A_GUARDAR:-30}"
DESTINO="$(pwd)/backups"
mkdir -p "$DESTINO"
ARCHIVO="$DESTINO/maderosys-$(date +%Y-%m-%d_%H%M).sql.gz"

docker compose exec -T db pg_dump -U "${DB_USUARIO:-maderosys}" -d "${DB_NOMBRE:-maderosys}" --no-owner --no-privileges | gzip > "$ARCHIVO.tmp"
# Una copia vacía o cortada no sirve: se descarta en vez de dejarla como si estuviera bien.
if [ "$(gzip -dc "$ARCHIVO.tmp" | grep -c 'CREATE TABLE')" -lt 5 ]; then
  rm -f "$ARCHIVO.tmp"
  echo "ERROR: la copia de seguridad salió incompleta" >&2
  exit 1
fi
mv "$ARCHIVO.tmp" "$ARCHIVO"
find "$DESTINO" -name 'maderosys-*.sql.gz' -mtime +"$DIAS_A_GUARDAR" -delete
echo "Copia lista: $ARCHIVO ($(du -h "$ARCHIVO" | cut -f1))"

if [ -n "${COPIA_REMOTA:-}" ]; then
  rsync -a --timeout=60 "$DESTINO"/ "$COPIA_REMOTA" && echo "Copia enviada a $COPIA_REMOTA"
fi
