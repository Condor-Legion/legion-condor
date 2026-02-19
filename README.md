# Legion Condor

Sistema de gestiÃ³n para una comunidad de juego: miembros, roster de eventos, estadÃ­sticas, importaciÃ³n de datos (rcon) y panel de administraciÃ³n con bot de Discord.

## Funcionalidad general

- **Panel admin (web)**: login con usuario y contraseÃ±a, gestiÃ³n de eventos, roster por evento, importaciÃ³n de datos e historial de auditorÃ­a.
- **API**: autenticaciÃ³n por sesiÃ³n (cookie), CRUD de miembros y roster, estadÃ­sticas, importaciÃ³n y WebSocket para actualizaciones en tiempo real.
- **Bot Discord**: integraciÃ³n con la API (por API key) para consultas, sync y tickets de ingreso desde Discord. Comandos principales: `/mi-rank`, `/mi-cuenta`, `/ultimos-eventos`, `/gulag` (admin), `/crear-cuenta` (admin).
- **Base de datos**: PostgreSQL con Prisma.

## CÃ³mo levantar el proyecto en local (con Docker)

El proyecto estÃ¡ pensado para usarse con **Docker** y **Docker Compose**. **Docker Desktop** en Windows trae ambos servicios.

### Requisitos

- [Docker](https://docs.docker.com/get-docker/)
- [Docker Compose](https://docs.docker.com/compose/install/)

### Pasos

1. **Clonar el repo** (si aplica) y entrar en la raÃ­z del proyecto:

   ```bash
   cd legion-condor
   ```

2. **Variables de entorno** (opcional para desarrollo bÃ¡sico):

   Copia `.env.example` a `.env` y ajusta los valores. Para tener usuario admin tras el seed necesitas al menos:

   - **Base de datos** (para migraciones y seed en tu mÃ¡quina): `DATABASE_URL`
   - **Admin inicial** (para crear el usuario la primera vez con el seed):
     - `ADMIN_USERNAME` â€“ usuario del panel admin
     - `ADMIN_PASSWORD` â€“ contraseÃ±a
   - **Bot de Discord** (solo si vas a usar el bot):
     - `DISCORD_TOKEN`
     - `DISCORD_CLIENT_ID`
     - `BOT_API_KEY` (misma clave que en la API)
     - `TICKETS_ADMIN_ROLE_IDS` (roles con acceso a todos los tickets; obligatorio para tickets). El canal y categorÃ­a se definen al ejecutar `/config-tickets` en el canal deseado.
     - `TICKETS_PENDING_ROLE_ID` Rol que se asigna al pulsar "Otorgar Pre-Aspirante" (solo admins)
     - `TICKETS_MEMBER_ROLE_ID` Rol que se otorga al creador del ticket al pulsar "Completar ingreso"
     - `TICKETS_LOG_CHANNEL_ID` Canal donde se guarda el transcript al completar ingreso

   Ejemplo mÃ­nimo en `.env` para tener admin:

   ```env
   DATABASE_URL=postgres://legion:legion@localhost:5432/legion_condor
   ADMIN_USERNAME=admin
   ADMIN_PASSWORD=tu_contraseÃ±a_segura
   ```

3. **Levantar todos los servicios**:

   ```bash
   docker compose up -d
   ```

   La primera vez construye las imÃ¡genes (puede tardar unos minutos).

   Servicios y puertos:

   | Servicio  | Puerto | DescripciÃ³n        |
   |-----------|--------|--------------------|
   | **web**  | 3000   | Frontend Next.js   |
   | **api**  | 3001   | API Express        |
   | **postgres** | 5432 | Base de datos  |
   | **bot**  | â€”      | Bot Discord        |

4. **Primera vez: migraciones y usuario admin**:

   Con los contenedores en marcha, en tu mÃ¡quina (necesitas [pnpm](https://pnpm.io/) y [Bun](https://bun.sh/) instalados), en la raÃ­z del proyecto:

   ```bash
   pnpm install
   pnpm exec prisma migrate deploy
   pnpm run seed
   ```

   Las variables `DATABASE_URL`, `ADMIN_USERNAME` y `ADMIN_PASSWORD` deben estar definidas cuando ejecutes estos comandos (el script de seed no carga `.env` por sÃ­ solo). Si tienes un `.env`, cÃ¡rgalo en la sesiÃ³n o define las variables a mano:

   **Linux / macOS (bash)** â€” cargar variables desde `.env` y ejecutar migraciones y seed:

   ```bash
   set -a && source .env && set +a
   pnpm exec prisma migrate deploy
   pnpm run seed
   ```

   (Si tu `.env` tiene valores con espacios o `#`, usa mejor los `export` del bloque siguiente.)

   **O bien define solo las necesarias a mano:** En bash:

   ```bash
   export DATABASE_URL="postgres://legion:legion@localhost:5432/legion_condor"
   export ADMIN_USERNAME=admin
   export ADMIN_PASSWORD=tu_contraseÃ±a_segura
   pnpm exec prisma migrate deploy
   pnpm run seed
   ```

   En PowerShell:

   ```powershell
   $env:DATABASE_URL="postgres://legion:legion@localhost:5432/legion_condor"
   $env:ADMIN_USERNAME="admin"
   $env:ADMIN_PASSWORD="tu_contraseÃ±a_segura"
   pnpm exec prisma migrate deploy
   pnpm run seed
   ```

   El seed crea el usuario admin **solo si** `ADMIN_USERNAME` y `ADMIN_PASSWORD` estÃ¡n definidos; si no, se limita a avisar y no hace nada.

5. **Acceder**:

   - **Web**: http://localhost:3000  
   - **Admin**: http://localhost:3000/admin (login con el usuario configurado en el seed)  
   - **API health**: http://localhost:3001/health  

### Comandos Ãºtiles

```bash
# Ver logs de todos los servicios
docker compose logs -f

# Solo API
docker compose logs -f api

# Parar todo
docker compose down

# Parar y borrar volÃºmenes (Â¡borra la base de datos!)
docker compose down -v
```

## Migracion legacy de stats (Google Sheets -> DB)

Esta migracion carga datos historicos del sistema viejo a:

- `ImportCrcon` + `Event` desde la hoja `Eventos BD`
- `PlayerMatchStats` desde la hoja `Miembros Stats BD`

Script:

```bash
pnpm run migrate:legacy:stats
```

Variables de entorno relevantes:

- `STATS_LEGACY_MIGRATION_ENABLED=true` para habilitar la corrida
- `STATS_LEGACY_EVENT_TEMPLATE_AUTOCREATE=true` para crear un template tecnico si no existe ninguno
- `STATS_LEGACY_EVENT_TEMPLATE_ID` (opcional) para forzar un template exacto
- `STATS_LEGACY_EVENT_TEMPLATE_NAME` (opcional) para buscar template por nombre
- `STATS_LEGACY_SPREADSHEET_ID` (opcional) para usar otra planilla
- `STATS_LEGACY_EVENTS_SHEET` y `STATS_LEGACY_PLAYER_STATS_SHEET` (opcionales)

Comportamiento importante:

- `Event.rosterTemplateId` es obligatorio en el modelo; no puede ser `null`
- Si no hay templates y `STATS_LEGACY_EVENT_TEMPLATE_AUTOCREATE=true`, el script crea uno llamado `Legacy Stats Migration` (modo `18x18`)
- Eso no crea slots de roster por si solo; solo asegura el FK requerido para `Event`
- La migracion es idempotente: si se vuelve a ejecutar, actualiza `Event/ImportCrcon` y reemplaza sus `PlayerMatchStats` sin duplicar

Flujo recomendado:

```powershell
$env:STATS_LEGACY_MIGRATION_ENABLED="true"
pnpm run migrate:legacy:stats
$env:STATS_LEGACY_MIGRATION_ENABLED="false"
```

## Desarrollo local sin Docker (opcional)

Si quieres correr solo la base de datos en Docker y el resto en tu mÃ¡quina necesitas **pnpm** y **Bun** instalados:

- **pnpm**: `corepack enable && corepack prepare pnpm@latest --activate` (con Node.js 16.13+) o [instalaciÃ³n directa](https://pnpm.io/installation).
- **Bun**: <https://bun.sh/docs/installation>

1. Levantar solo Postgres:

   ```bash
   docker compose up -d postgres
   ```

2. En la raÃ­z del proyecto (necesitas pnpm y Bun instalados):

   ```bash
   pnpm install
   pnpm exec prisma migrate deploy
   pnpm run prisma:generate
   pnpm run dev
   ```

   AsegÃºrate de tener `DATABASE_URL` (y si quieres usuario admin, `ADMIN_USERNAME` y `ADMIN_PASSWORD`) en tu `.env` o exportadas en la sesiÃ³n. Para crear el usuario admin la primera vez, ejecuta tambiÃ©n `pnpm run seed` en otra terminal (con las variables cargadas).

   Esto levanta en paralelo api, web y bot segÃºn los scripts del monorepo (api y bot se ejecutan con Bun; web con Next.js).

