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
if [ -n "$PRISMA_CLI" ] && command -v bun >/dev/null 2>&1; then
  bun "$PRISMA_CLI" migrate deploy
fi
exec "$@"
