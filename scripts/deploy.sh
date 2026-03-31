#!/usr/bin/env sh
set -eu

REPO_DIR="${REPO_DIR:-/repo}"
NO_BUILD=0

if [ "${1:-}" = "--no-build" ]; then
  NO_BUILD=1
  shift
fi

compose_up_with_build() {
  # Fallback compatible para entornos sin buildx.
  docker compose up -d --build "$@"
}

compose_up_without_build() {
  docker compose up -d "$@"
}

bake_build_services() {
  # bake puede tomar servicios definidos en docker-compose.yml como targets.
  # Ej: api, bot, web, deploy-listener.
  docker buildx bake -f docker-compose.yml "$@"
}

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
  if [ "$NO_BUILD" -eq 1 ]; then
    compose_up_without_build
  else
    if docker buildx version >/dev/null 2>&1; then
      bake_build_services api bot web deploy-listener
      docker compose up -d --no-build
    else
      compose_up_with_build
    fi
  fi
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

if [ "$NO_BUILD" -eq 1 ]; then
  compose_up_without_build $services_args
else
  build_targets=""
  while IFS= read -r svc; do
    [ -n "$svc" ] || continue
    case "$svc" in
      bot|api|web|deploy-listener)
        build_targets="${build_targets}${build_targets:+ }${svc}"
        ;;
    esac
  done <<EOF
$dedup_services
EOF

  if [ -n "$build_targets" ] && docker buildx version >/dev/null 2>&1; then
    # Build desacoplado + up sin build reduce tiempo y evita rebuild innecesario.
    bake_build_services $build_targets
    docker compose up -d --no-build $services_args
  else
    compose_up_with_build $services_args
  fi
fi

echo "deploy.sh: despliegue completado para servicios:"
echo "$dedup_services"
