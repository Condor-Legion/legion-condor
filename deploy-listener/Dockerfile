FROM oven/bun:1-alpine

WORKDIR /app

# Necesario para: git pull (deploy.sh) y docker compose (build/up)
RUN apk add --no-cache git docker-cli docker-cli-compose

COPY deploy-listener/index.ts ./index.ts

ENV PORT=9000

EXPOSE 9000

CMD ["bun", "run", "/app/index.ts"]

