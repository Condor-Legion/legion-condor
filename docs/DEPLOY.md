# Despliegue a producción (Legion Condor)

Checklist y pasos para subir el proyecto a producción por primera vez.

---

## 1. Variables de entorno en producción

Definir en el servidor o en el `.env` que use el compose (nunca subir `.env` al repo):

| Variable | Uso en producción |
|----------|-------------------|
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Credenciales fuertes; no usar `legion/legion` en producción. |
| `DATABASE_URL` | Solo si corrés migraciones/seed desde fuera del compose (p. ej. desde tu máquina contra la DB de prod). Debe apuntar a la misma DB que usa la API. |
| `SESSION_SECRET` | **Obligatorio** y distinto al de desarrollo; string aleatorio largo para firmar cookies. |
| `BOT_API_KEY` | **Obligatorio** si usás el bot; misma clave en API y bot. |
| `CORS_ORIGIN` | URL real del frontend (p. ej. `http://TU_IP:3003` o `https://tudominio.com`). |
| `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_SOCKET_URL` | URL pública de la API (la que el navegador usará). En producción ej. `http://TU_IP:3001`. Se inyectan al **build** de la imagen web; definir antes de `docker compose build`. |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | Para crear el usuario admin con el seed (solo primera vez). |
| Discord | `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, y las que use el bot (Guild, tickets, etc.). |

---

## 2. Orden del primer despliegue

1. **Configurar variables** (incluidas DB, `SESSION_SECRET`, `BOT_API_KEY`, `CORS_ORIGIN`, y para producción `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_SOCKET_URL` con la URL pública de la API).
2. **Levantar Postgres** (y, si usás todo el stack, el resto de servicios):
   ```bash
   docker compose up -d postgres
   ```
3. **Aplicar migraciones**

   El contenedor de la **API** ejecuta `prisma migrate deploy` al arrancar (ver `apps/api/docker-entrypoint.sh`). Por tanto, al hacer `docker compose up -d`, la API espera a que Postgres esté listo (healthcheck), arranca, aplica las migraciones y luego inicia el servidor. No hace falta ejecutar migraciones a mano salvo que uses una base de datos externa y no levantes la API con este compose.

4. **Crear usuario admin** (solo primera vez):
   ```bash
   export DATABASE_URL="postgres://..."
   export ADMIN_USERNAME=admin
   export ADMIN_PASSWORD=tu_password_seguro
   pnpm run seed
   ```
5. **Levantar el resto** (si no lo hiciste en el paso 2):
   ```bash
   docker compose up -d
   ```

---

## 3. Despliegues posteriores (con nuevos cambios)

1. Hacer pull del repo (incluye nuevas migraciones si las hay).
2. Reconstruir imágenes: `docker compose build` (o solo de los servicios que cambiaron). Si cambiás la URL pública de la API, definí de nuevo `NEXT_PUBLIC_API_URL` y `NEXT_PUBLIC_SOCKET_URL` antes del build de la web.
3. Reiniciar servicios: `docker compose up -d`. La API aplicará migraciones pendientes al arrancar.

---

## 4. Qué no subir al repo

- `.env` y archivos con secretos (ya están en `.gitignore`).
- `node_modules`, `dist`, `.next`, etc.

---

## 5. Resumen rápido

- **Migraciones:** versionadas en `prisma/migrations/`; en producción solo `prisma migrate deploy`.
- **Secretos:** definir en el entorno de producción; no commitear `.env`.
- **CORS:** poner la URL real del frontend en producción.
- **Primera vez:** aplicar migraciones → seed (admin) → levantar servicios.
