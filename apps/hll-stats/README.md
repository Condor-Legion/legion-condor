# HLL Stats - Flujo de Importacion (API + hll-stats)

Este documento describe como funciona el importador de eventos CRCON y como levantarlo.

## Arquitectura

El flujo esta dividido en dos piezas:

1. **API (`apps/api`)**
   - Hace el fetch a la URL externa CRCON.
   - Parseo de payload.
   - Guarda en la base de datos (`ImportCrcon`, `RawPayload`, `PlayerMatchStats`).

2. **Worker (`apps/hll-stats`)**
   - Lee una lista de eventos desde `HLL_STATS_EVENTS`.
   - Llama a la API para que haga el import.
   - Corre en loop con intervalo configurable.
   - Pensado principalmente para pruebas manuales con variables de entorno.

## Endpoints relevantes

**POST `/api/import/crcon-fetch`**

- Autenticacion: `x-bot-api-key` o sesion admin.
- Body:
  ```json
  { "baseUrl": "http://152.53.39.31:7012", "mapId": "3289" }
  ```
- Respuesta:
  ```json
  { "status": "SUCCESS", "importId": "...", "statsCount": 123 }
  ```

## Variables de entorno

**Comunes**

- `DATABASE_URL` (obligatoria)
- `BOT_API_KEY` (obligatoria si usas el endpoint sin login admin)

**API**

- `API_PORT` (por defecto `3001`)
- `CORS_ORIGIN` (por defecto `http://localhost:3000`)

**hll-stats**

- `HLL_STATS_EVENTS` (obligatoria)
  - Ejemplo:
    ```json
    [{ "baseUrl": "http://152.53.39.31:7012", "mapId": "3289" }]
    ```
- `API_URL`
  - En Docker: `http://api:3001`
  - Local: `http://localhost:3001`
- `HLL_STATS_INTERVAL_MS` (opcional, default `300000` = 5 minutos)

## Como funciona el import

1. `hll-stats` toma `HLL_STATS_EVENTS`.
2. Por cada evento llama `POST /api/import/crcon-fetch`.
3. La API:
   - Hace `GET {baseUrl}/api/get_map_scoreboard?map_id={mapId}`.
   - Genera `payloadHash`.
   - Si existe el mismo `payloadHash`:
     - Si hay stats: borra e reimporta.
     - Si no hay stats: saltea.
   - Guarda:
     - `ImportCrcon`
     - `RawPayload`
     - `PlayerMatchStats` (con columnas extendidas).

## Modelo `PlayerMatchStats`

Campos principales guardados:

- `playerName`
- `providerId` (string, puede ser numerico o alfanumerico)
- `kills`, `deaths`, `killsStreak`
- `teamkills`, `deathsByTk`
- `killsPerMinute`, `deathsPerMinute`, `killDeathRatio`
- `score`, `combat`, `offense`, `defense`, `support`
- `teamSide`, `teamRatio`

## Levantar con Docker (solo API + hll-stats)

```bash
docker compose build api hll-stats
docker compose up -d postgres api hll-stats
```

Ver logs:

```bash
docker compose logs -f hll-stats
```

## Troubleshooting

**401 Unauthorized**

- Verificar que `BOT_API_KEY` exista en `.env`.
- Enviar header `x-bot-api-key` si haces requests manuales.

## Discord (opcional)

Si queres que el bot lea un canal y dispare imports:

- Configurar en `.env`:
  - `DISCORD_STATS_CHANNEL_ID`
  - `DISCORD_STATS_POLL_SECONDS`
- Recorda pasar esas vars al container del bot (en `docker-compose.yml`).
- El bot busca URLs con `/games/{id}` y llama a `/api/import/crcon-fetch`.
- El ultimo mensaje procesado se obtiene desde `ImportCrcon.discordMessageId`.
