FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json tsconfig.base.json prisma ./ 
COPY apps/api/package.json apps/api/tsconfig.json apps/api/ ./apps/api/
COPY packages/shared/package.json packages/shared/tsconfig.json packages/shared/ ./packages/shared/
RUN npm install
COPY . .
RUN npx prisma generate
RUN npm run build -w @legion/shared
RUN npm run build -w @legion/api

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared ./packages/shared
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/prisma ./prisma
EXPOSE 3001
CMD ["node", "apps/api/dist/index.js"]
