# Legion Condor - Docker Setup (con errores comunes)

Guia paso a paso para levantar el proyecto con Docker en Windows/PowerShell, incluyendo errores tipicos y soluciones.

## 1) Verificar `.env`

Debe existir y tener al menos:

- `DATABASE_URL`
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`

Ejemplo minimo:

```
DATABASE_URL=postgres://legion:legion@localhost:5432/legion_condor
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
```

## 2) Limpiar `node_modules` locales (si hiciste `pnpm install` antes)

Docker en Windows falla si encuentra symlinks de pnpm dentro del contexto.

```
Get-ChildItem -Directory -Filter node_modules -Recurse | Remove-Item -Recurse -Force
```

## 3) Build + levantar servicios

```
docker compose up -d --build
```

Errores comunes:

- Docker no responde: abrir Docker Desktop.
- Puertos en uso (3003/3004/5432): cerrar procesos o cambiar puertos en `docker-compose.yml`.

## 4) Instalar dependencias locales (para migraciones/seed)

```
pnpm install
```

## 5) Generar Prisma Client

```
pnpm exec prisma generate
```

Error comun:

- `Cannot find module '.prisma/client/default'` -> volver a ejecutar `prisma generate`.

## 6) Migraciones

```
$env:DATABASE_URL="postgres://legion:legion@localhost:5432/legion_condor"
$env:ADMIN_USERNAME="admin"
$env:ADMIN_PASSWORD="admin123"
pnpm exec prisma migrate deploy
pnpm run seed
```

Errores comunes:

- DB no responde: esperar 10-20s y reintentar.
- Credenciales mal: revisar `DATABASE_URL`.

## 7) Seed (crear admin)

```
pnpm run seed
```

Errores comunes:

- `bun no se reconoce` -> instalar Bun:
  ```
  powershell -c "irm bun.sh/install.ps1 | iex"
  ```
  Abrir nueva terminal y repetir `pnpm run seed`.

## 8) Verificar

- Web: `http://localhost:3003`
- Admin: `http://localhost:3003/admin`
- API health: `http://localhost:3004/health`

## 9) Logs si algo falla

```
docker compose logs -f
```

## 10) Migracion legacy de stats (opcional)

Este paso migra datos historicos de Google Sheets a:

- `ImportCrcon` y `Event` (desde `Eventos BD`)
- `PlayerMatchStats` (desde `Miembros Stats BD`)

Configurar variables en `.env`:

```
STATS_LEGACY_MIGRATION_ENABLED=true
STATS_LEGACY_EVENT_TEMPLATE_AUTOCREATE=true
# STATS_LEGACY_EVENT_TEMPLATE_ID=
# STATS_LEGACY_EVENT_TEMPLATE_NAME=Legacy Stats Migration
```

Ejecutar:

```
pnpm run migrate:legacy:stats
```

Notas:

- `Event.rosterTemplateId` es obligatorio. Si no hay templates y `AUTOCREATE=true`, se crea uno tecnico (`Legacy Stats Migration`, modo `18x18`).
- Eso no crea slots de roster por si solo.
- Al finalizar, volver a desactivar:
  ```
  STATS_LEGACY_MIGRATION_ENABLED=false
  ```
