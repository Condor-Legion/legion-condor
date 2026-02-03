FROM node:20-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
COPY package.json pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/tsconfig.json apps/api/ ./apps/api/
COPY packages/shared/package.json packages/shared/tsconfig.json packages/shared/ ./packages/shared/
COPY prisma ./prisma
COPY tsconfig.base.json ./
RUN pnpm install
COPY . .
RUN pnpm exec prisma generate
RUN pnpm run --filter @legion/shared build
RUN pnpm exec tsc -p apps/api/tsconfig.build.json
# Copia real de zod para el runner (Bun no sigue symlinks de pnpm)
RUN mkdir -p /tmp/shared-deps/node_modules && cp -rL node_modules/zod /tmp/shared-deps/node_modules/

FROM oven/bun:1-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared ./packages/shared
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /tmp/shared-deps/node_modules ./shared-deps-tmp
RUN rm -rf packages/shared/node_modules && mv shared-deps-tmp packages/shared/node_modules
EXPOSE 3001
CMD ["bun", "run", "apps/api/dist/index.js"]
