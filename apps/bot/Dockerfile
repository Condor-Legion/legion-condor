FROM node:20-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY apps/bot/package.json apps/bot/tsconfig.json apps/bot/ ./apps/bot/
COPY packages/shared/package.json packages/shared/tsconfig.json packages/shared/ ./packages/shared/
COPY tsconfig.base.json ./
RUN pnpm install --frozen-lockfile || pnpm install
COPY . .
RUN pnpm run --filter @legion/shared build
RUN pnpm exec tsc -p apps/bot/tsconfig.build.json
# Copia real de zod para el runner (Bun no sigue symlinks de pnpm)
RUN mkdir -p /tmp/shared-deps/node_modules && cp -rL node_modules/zod /tmp/shared-deps/node_modules/

FROM oven/bun:1-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared ./packages/shared
COPY --from=builder /app/apps/bot/dist ./apps/bot/dist
COPY --from=builder /tmp/shared-deps/node_modules ./shared-deps-tmp
RUN rm -rf packages/shared/node_modules && mv shared-deps-tmp packages/shared/node_modules
EXPOSE 3001
CMD ["bun", "run", "apps/bot/dist/index.js"]
