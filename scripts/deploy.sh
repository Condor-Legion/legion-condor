#!/usr/bin/env sh
set -eu

REPO_DIR="${REPO_DIR:-/repo}"

cd "$REPO_DIR"

if command -v git >/dev/null 2>&1; then
  current_branch="$(git rev-parse --abbrev-ref HEAD)"
  if [ -z "$current_branch" ] || [ "$current_branch" = "HEAD" ]; then
    echo "No se pudo determinar la rama actual para deploy." >&2
    exit 1
  fi

  if ! git pull --ff-only; then
    echo "deploy.sh: git pull fallo; intentando recuperacion de refs remotas..." >&2

    git remote prune origin || true
    git fetch origin --prune || true
    git update-ref -d "refs/remotes/origin/$current_branch" || true

    git fetch origin "$current_branch"
    git merge --ff-only "origin/$current_branch"
  fi
else
  echo "git no esta disponible en el entorno" >&2
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
      echo "Servicio invalido: $svc (esperado: bot|api|web|deploy-listener|all)" >&2
      exit 2
      ;;
  esac
  echo "$dedup_services" | grep -qx "$svc" 2>/dev/null || dedup_services="${dedup_services}${dedup_services:+
}${svc}"
done

echo "deploy.sh: servicios a desplegar:"
echo "$dedup_services"

if echo "$dedup_services" | grep -qx "all" 2>/dev/null; then
  docker compose up -d --build
  echo "deploy.sh: despliegue completado para: all"
  exit 0
fi

services_args=""
while IFS= read -r svc; do
  [ -n "$svc" ] || continue
  services_args="${services_args}${services_args:+ }${svc}"
done <<EOF
$dedup_services
EOF

docker compose up -d --build $services_args

echo "deploy.sh: despliegue completado para servicios:"
echo "$dedup_services"