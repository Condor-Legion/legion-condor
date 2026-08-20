#!/bin/sh
set -e
cd /app
# Aplicar migraciones antes de arrancar la API (Bun puede ejecutar el CLI de Prisma)
PRISMA_CLI=""
if [ -f "node_modules/prisma/build/index.js" ]; then
  PRISMA_CLI="node_modules/prisma/build/index.js"
else
  PRISMA_CLI=$(find node_modules/.pnpm -path "*/prisma/build/index.js" 2>/dev/null | head -1) || true
fi

# Fallar ruidosamente: si el CLI no esta (ej. alguien poda devDependencies del
# runner, donde vive "prisma"), saltear las migraciones en silencio arranca la
# API contra un schema viejo.
if [ -z "$PRISMA_CLI" ]; then
  echo "docker-entrypoint: no se encontro el CLI de prisma en node_modules; no se pueden aplicar migraciones." >&2
  exit 1
fi
if ! command -v bun >/dev/null 2>&1; then
  echo "docker-entrypoint: bun no esta disponible; no se pueden aplicar migraciones." >&2
  exit 1
fi

bun "$PRISMA_CLI" migrate deploy

exec "$@"
