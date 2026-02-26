# Deploy automático por Webhook (GitHub → VPS)

Este documento describe cómo configurar un **listener** que recibe webhooks de GitHub (evento **push**), valida la firma HMAC y ejecuta un redeploy **selectivo** (solo bot/api/web afectados) usando `docker compose` en la VPS.

## Componentes

- **Listener**: `deploy-listener/` (Bun) expone `POST /deploy`.
- **Script**: `scripts/deploy.sh` hace `git pull` y luego `docker compose build/up` de los servicios indicados.
- **Compose**: `docker-compose.yml` incluye el servicio `deploy-listener` y fija el nombre de proyecto con `name: legion-condor` para que todos los `docker compose` (manuales o del listener) operen sobre el mismo stack de contenedores.

## Variables de entorno

En la VPS (en tu `.env` de producción o en el entorno donde corra `docker compose`):

- **`GITHUB_WEBHOOK_SECRET`**: secret usado para firmar el webhook (GitHub) y verificarlo (listener). Debe ser un valor aleatorio fuerte.
- **`REPO_PATH`**: ruta en el host al repo clonado. Ejemplo: `/home/usuario/legion-condor`.
  - En `docker-compose.yml` se monta como `${REPO_PATH}:/repo`.

## Levantar el listener en la VPS

1. Asegurate de tener el repo clonado en la VPS y que `git pull` funcione sin pedir credenciales (SSH key o token).
2. Definí `GITHUB_WEBHOOK_SECRET` y `REPO_PATH` en el entorno/`.env` del compose.
3. Construí y levantá el listener:

```bash
docker compose up -d --build deploy-listener
```

El listener quedará escuchando en el puerto **9000** (ver `docker-compose.yml`).

## Configurar el webhook en GitHub

Repositorio → **Settings** → **Webhooks** → **Add webhook**:

- **Payload URL**: `https://TU_DOMINIO_O_IP/deploy`
  - Si no usás proxy inverso, sería `http://TU_IP:9000/deploy`.
- **Content type**: `application/json`
- **Secret**: el mismo valor que `GITHUB_WEBHOOK_SECRET` en la VPS
- **Which events**: **Just the push event**

GitHub enviará el payload con `commits[]` y las rutas de archivos en `added[]`, `modified[]`, `removed[]`.

## Cómo decide qué redeployar

El listener recolecta todas las rutas tocadas en el push y mapea:

- `apps/bot/**` → `bot`
- `apps/api/**` → `api`
- `apps/web/**` → `web`
- `packages/shared/**` → `bot`, `api`, `web`
- Archivos de raíz que suelen afectar el build/runtime (ej. `docker-compose.yml`, `pnpm-lock.yaml`, `tsconfig.base.json`) → `bot`, `api`, `web`

Si no detecta servicios afectados, responde OK y no ejecuta nada.

## Logs / troubleshooting

- Ver logs del listener:

```bash
docker compose logs -f deploy-listener
```

- Si el webhook devuelve 401:
  - falta el header `X-Hub-Signature-256`, o
  - el secret no coincide, o
  - el body no es el que se firmó (proxy alterando el payload).

## Recomendación de exposición

Idealmente poné un **proxy inverso** (nginx/caddy) que exponga solo `POST /deploy` hacia el puerto 9000.
La validación real es la firma HMAC, pero el proxy puede ayudar a limitar superficie.

