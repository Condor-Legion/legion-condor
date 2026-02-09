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
- Puertos en uso (3000/3001/5432): cerrar procesos o cambiar puertos en `docker-compose.yml`.

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

- Web: `http://localhost:3000`
- Admin: `http://localhost:3000/admin`
- API health: `http://localhost:3001/health`

## 9) Logs si algo falla

```
docker compose logs -f
```
