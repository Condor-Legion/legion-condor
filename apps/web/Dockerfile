# syntax=docker/dockerfile:1

# Base pinneada: "node:20-alpine" es flotante y ademas cambia la version de
# corepack entre patches, que es de donde salen los fallos de firma al preparar
# pnpm. Hoy 20.20.2-alpine resuelve al mismo digest que 20-alpine.
FROM node:20.20.2-alpine AS builder
WORKDIR /app

# CI=true: pnpm nunca pide confirmacion interactiva (dentro del build no hay
# TTY y un prompt aborta con ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY).
ENV CI=true
# PNPM_HOME define donde vive el store (=> /pnpm/store), que se monta como
# cache de BuildKit y por lo tanto no ocupa espacio en la imagen.
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
# pnpm: debe coincidir con "packageManager" en package.json, si no corepack
# descarga otra version en la primera invocacion (fuera de esta capa).
RUN corepack enable && corepack prepare pnpm@10.28.2 --activate

# Solo manifiestos: esta capa es la clave de cache de dependencias.
# Hacen falta los cuatro para que --frozen-lockfile valide contra el lockfile.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY apps/api/package.json ./apps/api/
COPY apps/bot/package.json ./apps/bot/
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/

# --ignore-scripts: evita el "prepare" raiz, que compila @legion/shared; web no
# depende de shared y sus fuentes no se copian en esta imagen.
# --filter: instala solo el subgrafo de web (sin googleapis/prisma de api ni
# discord.js de bot). --include-workspace-root aporta typescript de la raiz.
# El cache mount conserva el store entre builds: cuando cambia una dependencia
# el install se rehace, pero contra el store local en vez de contra la red.
RUN --mount=type=cache,id=pnpm-store,sharing=locked,target=/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts --prefer-offline \
      --filter @legion/web... --include-workspace-root

# Fuentes: el dir completo de la app, no una lista de archivos. Sigue aislando
# el cache por servicio y evita que un config nuevo quede sin copiar en silencio.
# packages/shared no se copia: apps/web/src no importa @legion/shared.
COPY tsconfig.base.json ./
COPY apps/web ./apps/web

# NEXT_PUBLIC_* se inyectan en el bundle en build time (requerido para
# produccion). Sin valor por defecto a proposito: un default apuntando a un
# entorno concreto se hornea en silencio en el bundle de cliente cuando alguien
# construye sin pasar los args. docker-compose.yml los pasa siempre.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SOCKET_URL
RUN test -n "$NEXT_PUBLIC_API_URL" && test -n "$NEXT_PUBLIC_SOCKET_URL" || { \
      echo "ERROR: NEXT_PUBLIC_API_URL y NEXT_PUBLIC_SOCKET_URL son build args obligatorios" >&2; \
      exit 1; \
    }
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_SOCKET_URL=$NEXT_PUBLIC_SOCKET_URL

RUN cd apps/web && node ../../node_modules/next/dist/bin/next build

FROM oven/bun:1.4.0-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# server.js escucha en localhost si no se le indica lo contrario, lo que dentro
# del contenedor lo vuelve inalcanzable desde fuera.
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

# El bundle standalone ya trae su propio node_modules podado: solo lo que el
# server usa en runtime. No se copia /app/node_modules.
COPY --from=builder /app/apps/web/.next/standalone ./
# .next/static y public quedan fuera del standalone a proposito: Next espera
# que se copien aparte (normalmente los sirve un CDN).
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

EXPOSE 3000
CMD ["bun", "apps/web/server.js"]
