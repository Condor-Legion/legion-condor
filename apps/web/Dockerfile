FROM node:20-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
COPY package.json pnpm-workspace.yaml .npmrc ./
COPY apps/web/package.json apps/web/tsconfig.json apps/web/next.config.js apps/web/postcss.config.js apps/web/tailwind.config.ts apps/web/ ./apps/web/
COPY packages/shared/package.json packages/shared/tsconfig.json packages/shared/ ./packages/shared/
COPY tsconfig.base.json ./
RUN pnpm install --frozen-lockfile || pnpm install
COPY . .
RUN pnpm run --filter @legion/shared build
RUN cd apps/web && node ../../node_modules/next/dist/bin/next build

FROM oven/bun:1-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/apps/web/.next ./.next
COPY --from=builder /app/apps/web/public ./public
COPY --from=builder /app/apps/web/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 3000
CMD ["bun", "node_modules/next/dist/bin/next", "start", "-p", "3000"]
