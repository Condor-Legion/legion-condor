FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json tsconfig.base.json ./ 
COPY apps/web/package.json apps/web/tsconfig.json apps/web/next.config.js apps/web/postcss.config.js apps/web/tailwind.config.ts ./apps/web/
COPY packages/shared/package.json packages/shared/tsconfig.json ./packages/shared/
RUN npm install
COPY . .
RUN npm run build -w @legion/shared
RUN npm run build -w @legion/web

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/apps/web/.next ./.next
COPY --from=builder /app/apps/web/public ./public
COPY --from=builder /app/apps/web/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 3000
CMD ["node", "node_modules/next/dist/bin/next", "start", "-p", "3000"]
