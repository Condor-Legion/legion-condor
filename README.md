# Legion Condor

Sistema de gestión para una comunidad de juego: miembros, roster de eventos, estadísticas, importación de datos (rcon) y panel de administración con bot de Discord.

## Funcionalidad general

- **Panel admin (web)**: login con usuario y contraseña, gestión de eventos, roster por evento, importación de datos e historial de auditoría.
- **API**: autenticación por sesión (cookie), CRUD de miembros y roster, estadísticas, importación y WebSocket para actualizaciones en tiempo real.
- **Bot Discord**: integración con la API (por API key) para consultas, sync y tickets de ingreso desde Discord.
- **Base de datos**: PostgreSQL con Prisma.

## Cómo levantar el proyecto en local (con Docker)

El proyecto está pensado para usarse con **Docker** y **Docker Compose**. **Docker Desktop** en Windows trae ambos servicios.

### Requisitos

- [Docker](https://docs.docker.com/get-docker/)
- [Docker Compose](https://docs.docker.com/compose/install/)

### Pasos

1. **Clonar el repo** (si aplica) y entrar en la raíz del proyecto:

   ```bash
   cd legion-condor
   ```

2. **Variables de entorno** (opcional para desarrollo básico):

   Copia `.env.example` a `.env` y ajusta los valores. Para tener usuario admin tras el seed necesitas al menos:

   - **Base de datos** (para migraciones y seed en tu máquina): `DATABASE_URL`
   - **Admin inicial** (para crear el usuario la primera vez con el seed):
     - `ADMIN_USERNAME` – usuario del panel admin
     - `ADMIN_PASSWORD` – contraseña
   - **Bot de Discord** (solo si vas a usar el bot):
     - `DISCORD_TOKEN`
     - `DISCORD_CLIENT_ID`
     - `BOT_API_KEY` (misma clave que en la API)
     - `TICKETS_ADMIN_ROLE_IDS` (roles con acceso a todos los tickets; obligatorio para tickets). El canal y categoría se definen al ejecutar `/setup-tickets` en el canal deseado.
     - `TICKETS_PENDING_ROLE_ID` Rol que se asigna al pulsar "Otorgar Pre-Aspirante" (solo admins)
     - `TICKETS_MEMBER_ROLE_ID` Rol que se otorga al creador del ticket al pulsar "Completar ingreso"
     - `TICKETS_LOG_CHANNEL_ID` Canal donde se guarda el transcript al completar ingreso

   Ejemplo mínimo en `.env` para tener admin:

   ```env
   DATABASE_URL=postgres://legion:legion@localhost:5432/legion_condor
   ADMIN_USERNAME=admin
   ADMIN_PASSWORD=tu_contraseña_segura
   ```

3. **Levantar todos los servicios**:

   ```bash
   docker compose up -d
   ```

   La primera vez construye las imágenes (puede tardar unos minutos).

   Servicios y puertos:

   | Servicio  | Puerto | Descripción        |
   |-----------|--------|--------------------|
   | **web**  | 3000   | Frontend Next.js   |
   | **api**  | 3001   | API Express        |
   | **postgres** | 5432 | Base de datos  |
   | **bot**  | —      | Bot Discord        |

4. **Primera vez: migraciones y usuario admin**:

   Con los contenedores en marcha, en tu máquina (necesitas [pnpm](https://pnpm.io/) y [Bun](https://bun.sh/) instalados), en la raíz del proyecto:

   ```bash
   pnpm install
   pnpm exec prisma migrate deploy
   pnpm run seed
   ```

   Las variables `DATABASE_URL`, `ADMIN_USERNAME` y `ADMIN_PASSWORD` deben estar definidas cuando ejecutes estos comandos (el script de seed no carga `.env` por sí solo). Si tienes un `.env`, cárgalo en la sesión o define las variables a mano:

   **Linux / macOS (bash)** — cargar variables desde `.env` y ejecutar migraciones y seed:

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
   export ADMIN_PASSWORD=tu_contraseña_segura
   pnpm exec prisma migrate deploy
   pnpm run seed
   ```

   En PowerShell:

   ```powershell
   $env:DATABASE_URL="postgres://legion:legion@localhost:5432/legion_condor"
   $env:ADMIN_USERNAME="admin"
   $env:ADMIN_PASSWORD="tu_contraseña_segura"
   pnpm exec prisma migrate deploy
   pnpm run seed
   ```

   El seed crea el usuario admin **solo si** `ADMIN_USERNAME` y `ADMIN_PASSWORD` están definidos; si no, se limita a avisar y no hace nada.

5. **Acceder**:

   - **Web**: http://localhost:3000  
   - **Admin**: http://localhost:3000/admin (login con el usuario configurado en el seed)  
   - **API health**: http://localhost:3001/health  

### Comandos útiles

```bash
# Ver logs de todos los servicios
docker compose logs -f

# Solo API
docker compose logs -f api

# Parar todo
docker compose down

# Parar y borrar volúmenes (¡borra la base de datos!)
docker compose down -v
```

## Desarrollo local sin Docker (opcional)

Si quieres correr solo la base de datos en Docker y el resto en tu máquina necesitas **pnpm** y **Bun** instalados:

- **pnpm**: `corepack enable && corepack prepare pnpm@latest --activate` (con Node.js 16.13+) o [instalación directa](https://pnpm.io/installation).
- **Bun**: <https://bun.sh/docs/installation>

1. Levantar solo Postgres:

   ```bash
   docker compose up -d postgres
   ```

2. En la raíz del proyecto (necesitas pnpm y Bun instalados):

   ```bash
   pnpm install
   pnpm exec prisma migrate deploy
   pnpm run prisma:generate
   pnpm run dev
   ```

   Asegúrate de tener `DATABASE_URL` (y si quieres usuario admin, `ADMIN_USERNAME` y `ADMIN_PASSWORD`) en tu `.env` o exportadas en la sesión. Para crear el usuario admin la primera vez, ejecuta también `pnpm run seed` en otra terminal (con las variables cargadas).

   Esto levanta en paralelo api, web y bot según los scripts del monorepo (api y bot se ejecutan con Bun; web con Next.js).
