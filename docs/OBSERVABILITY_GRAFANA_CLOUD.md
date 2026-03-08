# Observability with Grafana Cloud Free

This project now emits structured JSON logs from:

- `api`
- `bot`
- `deploy-listener`

Logs are shipped with an Alloy sidecar (`docker-compose.yml`) to Grafana Cloud Loki.

## 1) Environment variables

Set these values in `.env`:

```bash
GRAFANA_CLOUD_LOKI_URL=https://logs-prod-XXX.grafana.net/loki/api/v1/push
GRAFANA_CLOUD_LOKI_USER=XXXXXX
GRAFANA_CLOUD_LOKI_API_KEY=glc_XXXXXX
DEPLOY_ENVIRONMENT=production
LOG_PRETTY=false
LOG_SUCCESS_SAMPLE_RATE=1
LOG_ENABLE_DOMAIN_START=true
```

Notes:

- Keep `LOG_PRETTY=false` in production so logs stay JSON-parseable.
- Use `LOG_SUCCESS_SAMPLE_RATE` (`0..1`) to control info-level success volume.

## 2) Start stack

```bash
docker compose up -d --build
```

Check Alloy logs:

```bash
docker compose logs -f alloy
```

## 3) Standard log fields

Domain logs use:

- `event`, `module`, `operation`
- `requestId`, `correlationId`
- `actorType`, `actorId`
- `outcome`, `reason`
- `durationMs`

HTTP logs additionally include:

- `method`, `path`, `statusCode`, `remoteIp`, `userAgent`

## 4) Suggested dashboards (manual in Grafana Cloud)

### API Overview

- Request rate by `service="api"`
- 4xx/5xx trend by `statusCode`
- p95 `durationMs` for `event="http_request_completed"`
- Top error events (`level="error"`)

### Bot Operations

- Interactions started/completed/failed (`event="discord_interaction"`)
- Sync jobs:
  - `discord_sync_members_*`
  - `discord_sync_roster_*`
- Retry warnings in sync module

### Domain Flows

- `auth_*`
- `ticket_*`
- `discord_sync_*`
- `webhook_*`

## 5) Suggested alerts

Create these alert rules in Grafana Cloud:

1. API 5xx spike (5-minute window).
2. Bot errors spike per command/module.
3. Missing expected `*_completed` events for periodic sync.

Send alert notifications to a Discord webhook contact point.

## 6) Troubleshooting

If logs do not appear:

1. Verify `GRAFANA_CLOUD_LOKI_*` values.
2. Confirm Alloy can read `/var/lib/docker/containers`.
3. Ensure services output JSON logs (`LOG_PRETTY=false`).
4. Query Grafana with a broad selector first: `{environment="production"}`.
