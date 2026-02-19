# Legion Condor Bot

Este bot de Discord sirve para:
- Ejecutar comandos de estadisticas (`/mi-rank`, `/mi-cuenta`, `/ultimos-eventos` y `/gulag`).
- Sincronizar miembros del servidor a la base de datos (`/sync-miembros`).
- Sincronizar el roster desde roles de Discord (`/sync-roster`).
- Crear cuentas de juego desde administracion (`/crear-cuenta`).
- Programar una sync automatica cada X horas.
- Leer un canal de stats y disparar imports (links `/games/{id}`).

## Requisitos

- `DISCORD_TOKEN` y `DISCORD_CLIENT_ID` configurados en `.env`.
- Bot invitado al servidor con permisos adecuados.
- **Server Members Intent** activado en el portal de Discord (para obtener todos los miembros).
- **Message Content Intent** activado si vas a leer mensajes de un canal.

## Variables de entorno (bot)

```
DISCORD_TOKEN=...
DISCORD_CLIENT_ID=...
DISCORD_GUILD_ID=...          # recomendado para registrar comandos a nivel servidor
DISCORD_SYNC_GUILD_ID=...     # opcional (si queres forzar sync a un servidor especifico)
BOT_API_KEY=...               # clave compartida entre bot y API
DISCORD_SYNC_INTERVAL_HOURS=3 # intervalo de sync automatico
ROSTER_ROLE_IDS=...           # IDs de roles que habilitan roster
CLEAR_GLOBAL_COMMANDS=true    # borra comandos globales al iniciar
DISCORD_STATS_CHANNEL_ID=...  # canal donde el bot busca links /games/{id}
# Canal y categorÃ­a: ejecutÃ¡ /config-tickets en el canal deseado; los nuevos tickets se crean en la misma categorÃ­a que ese canal.
TICKETS_ADMIN_ROLE_IDS=...    # roles con acceso a todos los tickets (IDs separados por coma)
```

## Comandos

### `/mi-rank`
Muestra tu resumen de rendimiento en la ventana elegida.
Incluye usuario, IDs vinculados (marcando la ultima usada en stats), eventos participados y promedios.
Opciones:
- `dias`: toma stats de los ultimos N dias.
- `eventos`: toma stats de los ultimos N eventos.
- Usar solo una de las dos.

### `/mi-cuenta`
Muestra resumen general del jugador:
- Usuario y Discord.
- Estadisticas generales (kills, deaths, KPM, K/D).
- Cuentas asociadas.
- Actividad reciente.

### `/ultimos-eventos`
Muestra tus ultimos eventos con detalle de kills/deaths, K/D, score y puntos por rol.
Opciones:
- `cantidad`: cantidad de eventos recientes.
- `dias`: eventos dentro de los ultimos N dias.
- Usar solo una de las dos.

### `/gulag` (admin)
Evalua estado Gulag con la regla:
- Si un jugador no participa en los ultimos 5 eventos y tiene mas de 1 mes en el clan, entra en Gulag.

Fuente de datos:
- Base principal: `Member`.
- Fecha de ingreso al clan: `DiscordMember.joinedAt`.
- Participacion: `PlayerMatchStats` sobre los ultimos 5 `ImportCrcon` con stats.

Salida:
- Tabla con jugadores en estado Gulag.
- Resumen de miembros evaluados y cantidad en Gulag.
- Paginacion por botones (`< Anterior` / `Siguiente >`) en el mismo mensaje.

### `/imprimir-miembros` (admin)
Genera y adjunta un archivo HTML con tabla de miembros del roster (`Member`) y estadisticas agregadas.
Columnas:
- SteamID64/ID
- Nick
- Ingreso
- Antiguedad (Dias)
- Eventos Participados
- Mato / Murio
- Avg. K/D
- Avg. Pts (combate, ataque, defensa, soporte)
- Avg. Muertes x Min

### `/sync-miembros`
Sincroniza todos los miembros del servidor a la DB.

### `/sync-roster`
Sincroniza el roster en la tabla `Member` usando roles de Discord.
Solo se agregan/actualizan los miembros que tengan algun rol listado en `ROSTER_ROLE_IDS`.
Si un miembro no tiene roles de roster, solo se desactiva (`isActive = false`) si pasaron 7 dias desde que fue creado en `Member`.

### `/crear-cuenta` (admin)
Crea una cuenta de juego asociada a un usuario del roster (`Member`).
Si no existe, crea `DiscordMember` y `Member` usando `nickname` o `username`.
La cuenta queda aprobada automaticamente.
Todos los parametros son obligatorios:
- `provider`
- `id`
- `usuario`

### `/config-tickets`
Publica en el canal actual el botÃ³n para crear tickets de ingreso.  
Ejecutarlo en el canal donde querÃ©s el botÃ³n de tickets (cualquier canal).

## Tickets de ingreso

- El botÃ³n crea un canal privado para el solicitante y los roles de `TICKETS_ADMIN_ROLE_IDS`.
- La encuesta se responde en 2 modales (9 preguntas en total).
- En la base de datos solo se guardan: **plataforma**, **nombre de usuario** e **ID de jugador**.
- El bot publica en el canal un resumen con las respuestas completas.

**Visibilidad / permisos**  
- `/crear-cuenta`, `/gulag` y `/config-tickets` requieren permisos de administrador.
- `/mi-rank`, `/mi-cuenta`, `/ultimos-eventos`, `/sync-miembros` y `/sync-roster` usan `defaultMemberPermissions = 0`.
- Debes habilitar manualmente los que correspondan en Discord:

Server Settings -> Integrations -> Bots & Apps -> comando -> Permissions

## Base de datos: tabla DiscordMember

Se creo el modelo `DiscordMember` en Prisma:

- `discordId` (ID)
- `username` (Usuario)
- `nickname` (Nick)
- `joinedAt` (Ingreso)
- `roles` (JSON con `{ id, name }`)
- `isActive` (marca si sigue en el servidor)

**Relacion con `Member`:**
No hay FK directa. Se relacionan por `discordId` cuando corresponda.
`Member` sigue representando el roster interno del sistema, mientras que `DiscordMember`
representa **todos** los usuarios del servidor.
Cuando alguien sale del servidor, `DiscordMember.isActive` pasa a `false`.
Cuando se sincroniza, si existe `Member`, se actualiza `displayName` con `nickname` o `username`.

## GameAccount (aprobacion)

Se agrego `approved` en `GameAccount`.
Cuando se crea desde `/crear-cuenta`, queda `approved = true`.
Cuando se crea desde el panel admin, queda `approved = true`.

## Canal de stats (opcional)

El bot escucha mensajes nuevos y editados en el canal configurado y extrae links con `/games/{id}` para disparar imports. Al iniciar hace un scan de catch-up de mensajes recientes.

Requiere:
- `DISCORD_STATS_CHANNEL_ID`
- **Message Content Intent** habilitado en el portal de Discord

## Baja logica (isActive)

- `DiscordMember.isActive = false` si el usuario ya no esta en el servidor (por `/sync-miembros`).
- `Member.isActive = false` si el usuario no tiene rol de roster y pasaron 7 dias desde su alta (por `/sync-roster`).

Esto es un **borrado logico**: el registro no se elimina de la base, solo se marca
como inactivo. Asi podes conservar el historial y reactivarlo mas adelante si vuelve
al servidor o recupera el rol.

## Crear el bot en Discord

1. Ir a https://discord.com/developers/applications
2. Create Application -> Bot -> **Reset Token**
   - Ese token va en `DISCORD_TOKEN`.
3. OAuth2 -> URL Generator:
   - Scopes: `bot`, `applications.commands`
   - Bot Permissions (minimos para este bot):
     - View Channels
     - Read Message History
     - Send Messages
     - Create Public Threads
     - Create Private Threads
     - Send Messages in Threads
4. Bot -> **Privileged Gateway Intents**:
   - Activar **Server Members Intent** (necesario para sync)
   - Activar **Message Content Intent** solo si queres leer contenido de mensajes

## Sync automatico

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

