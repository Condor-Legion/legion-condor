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

# --ignore-scripts: el "prepare" raiz compila @legion/shared, cuyas fuentes
# todavia no estan copiadas. Se compila explicitamente mas abajo.
# --filter: instala solo el subgrafo de este servicio (sin las deps de los
# otros dos). --include-workspace-root aporta prisma/typescript de la raiz.
# El cache mount conserva el store entre builds: cuando cambia una dependencia
# el install se rehace, pero contra el store local en vez de contra la red.
RUN --mount=type=cache,id=pnpm-store,sharing=locked,target=/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts --prefer-offline \
      --filter @legion/api... --include-workspace-root

# Prisma antes que las fuentes: generate depende del schema y de node_modules,
# de nada mas. Si estuviera despues de COPY apps/api, cada cambio de codigo de
# la API lo reejecutaria, y como --ignore-scripts saltea el postinstall de
# @prisma/engines cada reejecucion vuelve a bajar los engines de la red.
COPY prisma ./prisma
RUN pnpm exec prisma generate

# Fuentes: el dir completo de la app, no una lista de archivos. Sigue aislando
# el cache por servicio y evita que un config nuevo quede sin copiar en silencio.
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
RUN pnpm run --filter @legion/shared build

COPY apps/api ./apps/api
RUN pnpm exec tsc -p apps/api/tsconfig.build.json

# Copia real de deps de shared para el runner (Bun no sigue symlinks de pnpm)
RUN mkdir -p /tmp/shared-deps/node_modules && \
  cp -rL node_modules/zod /tmp/shared-deps/node_modules/ && \
  cp -rL node_modules/pino /tmp/shared-deps/node_modules/ && \
  cp -rL node_modules/pino-pretty /tmp/shared-deps/node_modules/

FROM oven/bun:1.4.0-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# node_modules entero del builder: el entrypoint corre "prisma migrate deploy"
# al arrancar, y el CLI de prisma es devDependency de la raiz.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared ./packages/shared
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /tmp/shared-deps/node_modules ./shared-deps-tmp
RUN rm -rf packages/shared/node_modules && mv shared-deps-tmp packages/shared/node_modules

COPY apps/api/docker-entrypoint.sh /app/docker-entrypoint.sh
RUN sed -i 's/\r$//' /app/docker-entrypoint.sh && chmod +x /app/docker-entrypoint.sh

EXPOSE 3001
ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["bun", "run", "apps/api/dist/index.js"]
