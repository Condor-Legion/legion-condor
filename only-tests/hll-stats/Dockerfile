FROM node:20-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY apps/hll-stats/package.json apps/hll-stats/tsconfig.json apps/hll-stats/ ./apps/hll-stats/
COPY packages/shared/package.json packages/shared/tsconfig.json packages/shared/ ./packages/shared/
COPY prisma ./prisma
COPY tsconfig.base.json ./
RUN pnpm install --frozen-lockfile || pnpm install
COPY . .
RUN pnpm exec prisma generate
RUN pnpm run --filter @legion/shared build
RUN pnpm exec tsc -p apps/hll-stats/tsconfig.build.json
# Copia real de zod para el runner (Bun no sigue symlinks de pnpm)
RUN mkdir -p /tmp/shared-deps/node_modules && cp -rL node_modules/zod /tmp/shared-deps/node_modules/

FROM oven/bun:1-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared ./packages/shared
COPY --from=builder /app/apps/hll-stats/dist ./apps/hll-stats/dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /tmp/shared-deps/node_modules ./shared-deps-tmp
RUN rm -rf packages/shared/node_modules && mv shared-deps-tmp packages/shared/node_modules
CMD ["bun", "run", "apps/hll-stats/dist/index.js"]
