# Prueba de carga con k6

El script [admin-read-flow.js](../load-tests/k6/admin-read-flow.js) reproduce usuarios recurrentes del panel administrativo sin hacer escrituras. Cada usuario virtual consulta su sesión, los eventos y, alternadamente, estadísticas o catálogos/plantillas. La autenticación se realiza una vez y se comparte la sesión: evita que el rate limit de login (60/minuto) falsee la prueba.

## Antes de empezar

- Ejecutá la prueba contra una ventana de bajo tráfico y avisá a los usuarios, porque la base de datos y la API reales recibirán carga.
- Preferí correr k6 desde otra máquina. Si se ejecuta dentro de la VPS, el generador de carga también consume CPU y RAM de ella.
- Usá las credenciales de un admin de prueba si es posible. No copies secretos en el repositorio ni los pases en el historial del shell compartido.
- Mirá durante la ejecución CPU/RAM de Docker, `docker compose logs -f api`, y los paneles/logs de Grafana Cloud. En particular: tasa de 5xx, p95 de `durationMs`, saturación de Postgres y reinicios de contenedores.

La API limita por IP a 240 requests por minuto por defecto. k6 concentra todos los usuarios virtuales en una sola IP, por lo que las etapas superiores llegarían a 429 antes de medir el servidor. Para una ventana de prueba controlada podés elevar solo el límite general en el `.env` de la VPS, reiniciar API y luego restaurarlo:

```env
# Solo durante el test de carga; el valor habitual es 240.
RATE_LIMIT_MAX=12000
```

`LOGIN_RATE_LIMIT_MAX` sigue en 60 porque el script solo inicia una sesión. No desactives permanentemente los límites ni cambies sus valores sin volver a desplegar la configuración normal al terminar.

## Ejecución

En una terminal Linux (local o en una máquina externa), desde la raíz del repositorio:

```bash
read -rsp "Contraseña del admin: " LOAD_TEST_PASSWORD; echo
docker run --rm \
  -v "$PWD/load-tests/k6:/scripts:ro" \
  -e BASE_URL="https://tu-dominio-o-ip" \
  -e CONFIRM_TARGET="https://tu-dominio-o-ip" \
  -e ADMIN_USERNAME="admin-de-prueba" \
  -e ADMIN_PASSWORD="$LOAD_TEST_PASSWORD" \
  -e VUS=10 \
  -e DURATION=3m \
  -e THINK_TIME_SECONDS=3 \
  grafana/k6 run /scripts/admin-read-flow.js
unset LOAD_TEST_PASSWORD
```

`BASE_URL` debe ser la URL pública de la API. En este compose, si se expone directamente, suele ser `http://IP_DE_LA_VPS:3004`; si hay proxy inverso, usá su URL HTTPS. El script exige que `CONFIRM_TARGET` sea idéntica a `BASE_URL` para impedir enviar carga a una VPS por error. Para `localhost` no hace falta esa confirmación.

## Escalado recomendado

No saltes directamente a cientos de usuarios. Repetí escalones y guardá la salida de cada corrida:

| Etapa | VUS | Duración | Objetivo |
| --- | ---: | ---: | --- |
| Humo | 5 | 2 min | Validar credenciales, URL y métricas. |
| Base | 10 | 5 min | Medir comportamiento normal. |
| Carga | 25 | 10 min | Encontrar degradación inicial. |
| Pico | 50 | 10 min | Validar margen ante concurrencia alta. |

Con tres segundos de pausa entre recorridos, 50 VUs no equivalen a 50 requests por segundo: representan aproximadamente 50 personas navegando y recargando el panel. La salida de k6 informará los requests/segundo reales.

Considerá satisfactoria una etapa si no hay reinicios ni 5xx y k6 cumple sus umbrales: menos de 1% de requests fallidos, p95 menor de 1.2 s y p99 menor de 2.5 s. Si no se cumplen, detené la escalada y correlacioná la hora de la corrida con los logs y métricas de la API y PostgreSQL.

## Límites del escenario

Esta primera prueba cubre solo lectura autenticada; no crea rosters, asignaciones ni importaciones para no alterar producción. Tampoco simula usuarios Discord/bot ni conexiones Socket.io persistentes. Para evaluar esas rutas conviene montar antes un entorno staging con una copia anonimizada de la base de datos y datos de prueba.
