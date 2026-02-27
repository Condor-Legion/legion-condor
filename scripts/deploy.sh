#!/usr/bin/env sh
set -eu

REPO_DIR="${REPO_DIR:-/repo}"

cd "$REPO_DIR"

if command -v git >/dev/null 2>&1; then
  git pull --ff-only
else
  echo "git no está disponible en el entorno" >&2
  exit 1
fi

if [ "$#" -eq 0 ]; then
  echo "No se pasaron servicios para desplegar; no hago nada."
  exit 0
fi

dedup_services=""
for svc in "$@"; do
  case "$svc" in
    bot|api|web|deploy-listener|all) ;;
    *)
      echo "Servicio inválido: $svc (esperado: bot|api|web|deploy-listener|all)" >&2
      exit 2
      ;;
  esac
  echo "$dedup_services" | grep -qx "$svc" 2>/dev/null || dedup_services="${dedup_services}${dedup_services:+
}${svc}"
done

if echo "$dedup_services" | grep -qx "all" 2>/dev/null; then
  docker compose up -d --build
  echo "deploy.sh: despliegue completado para: all"
  exit 0
fi

echo "$dedup_services" | while IFS= read -r svc; do
  [ -n "$svc" ] || continue
  docker compose build "$svc"
  docker compose up -d "$svc"
done

echo "deploy.sh: despliegue completado para servicios:"
echo "$dedup_services"

