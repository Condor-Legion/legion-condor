FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json tsconfig.base.json ./ 
COPY apps/bot/package.json apps/bot/tsconfig.json ./apps/bot/
COPY packages/shared/package.json packages/shared/tsconfig.json ./packages/shared/
RUN npm install
COPY . .
RUN npm run build -w @legion/shared
RUN npm run build -w @legion/bot

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/bot/dist ./apps/bot/dist
CMD ["node", "apps/bot/dist/index.js"]
