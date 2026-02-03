# Legion Condor Bot

Este bot de Discord sirve para:
- Ejecutar comandos de estadísticas (por ejemplo `/stats`).
- Sincronizar miembros del servidor a la base de datos (`/sync-members`).
- Sincronizar el roster desde roles de Discord (`/sync-roster`).
- Programar una sync automática cada X horas.

## Requisitos

- `DISCORD_TOKEN` y `DISCORD_CLIENT_ID` configurados en `.env`.
- Bot invitado al servidor con permisos adecuados.
- **Server Members Intent** activado en el portal de Discord (para obtener todos los miembros).

## Variables de entorno (bot)

```
DISCORD_TOKEN=...
DISCORD_CLIENT_ID=...
DISCORD_GUILD_ID=...          # recomendado para registrar comandos a nivel servidor
DISCORD_SYNC_GUILD_ID=...     # opcional (si querés forzar sync a un servidor específico)
BOT_API_KEY=...               # clave compartida entre bot y API
DISCORD_SYNC_INTERVAL_HOURS=3 # intervalo de sync automático
ROSTER_ROLE_IDS=...           # IDs de roles que habilitan roster
```

## Comandos

### `/stats`
Consulta estadísticas del usuario (usa la API).

### `/sync-members`
Sincroniza todos los miembros del servidor a la DB.

### `/sync-roster`
Sincroniza el roster en la tabla `Member` usando roles de Discord.  
Solo se agregan/actualizan los miembros que tengan algún rol listado en `ROSTER_ROLE_IDS`.

**Visibilidad / permisos**  
Ambos comandos están **ocultos por defecto** (`defaultMemberPermissions = 0`).
Debés habilitarlos manualmente en Discord:

Server Settings → Integrations → Bots & Apps → comando → Permissions

## Base de datos: tabla DiscordMember

Se creó el modelo `DiscordMember` en Prisma:

- `discordId` (ID)
- `username` (Usuario)
- `nickname` (Nick)
- `joinedAt` (Ingreso)
- `roles` (JSON con `{ id, name }`)

**Relación con `Member`:**  
No hay FK directa. Se relacionan por `discordId` cuando corresponda.
`Member` sigue representando el roster interno del sistema, mientras que `DiscordMember`
representa **todos** los usuarios del servidor.

## Crear el bot en Discord

1) Ir a https://discord.com/developers/applications  
2) Create Application → Bot → **Reset Token**  
   - Ese token va en `DISCORD_TOKEN`.
3) OAuth2 → URL Generator:
   - Scopes: `bot`, `applications.commands`
   - Bot Permissions (mínimos para este bot):
     - View Channels
     - Read Message History
     - Send Messages
     - Create Public Threads
     - Create Private Threads
     - Send Messages in Threads
4) Bot → **Privileged Gateway Intents**:
   - Activar **Server Members Intent** (necesario para sync)
   - Activar **Message Content Intent** solo si querés leer contenido de mensajes

## Sync automático

El bot ejecuta una sync cada `SYNC_INTERVAL_HOURS` horas.  
Se controla en `apps/bot/src/index.ts`.

## Levantar con Docker

Rebuild del bot si hay cambios:
```
docker compose up -d --build bot
```

Ver logs:
```
docker compose logs -f bot
```
