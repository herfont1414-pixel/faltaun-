#!/usr/bin/env bash
# Baja la última versión de MaderoSys y la reinicia (los datos no se tocan).
# Hace una copia de seguridad antes. Uso:  ./actualizar.sh
set -euo pipefail
cd "$(dirname "$0")"
./backup.sh
cd ..
git pull --ff-only
cd deploy
APP_VERSION="$(git rev-parse --short HEAD)" docker compose up -d --build
docker image prune -f >/dev/null
echo "Actualizado a la versión $(git rev-parse --short HEAD)"
