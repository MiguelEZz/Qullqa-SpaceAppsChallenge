# Imagen de producción de Qullqa. Dos destinos:
#   --target api  → API Fastify (corre las migraciones al arrancar)
#   --target worker → cerebro: ejecuta las corridas en cola
#   --target web  → Caddy con la PWA construida + HTTPS automático con el dominio
FROM node:24-slim AS base
RUN npm i -g pnpm@10.34.9
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile

FROM base AS web-build
RUN pnpm -F @qullqa/web build

FROM caddy:2 AS web
COPY infra/Caddyfile.prod /etc/caddy/Caddyfile
COPY --from=web-build /app/apps/web/dist /srv/web

FROM base AS api
WORKDIR /app/apps/api
ENV NODE_ENV=production
EXPOSE 3000
CMD ["pnpm", "exec", "tsx", "src/server.ts"]

FROM base AS worker
WORKDIR /app/apps/worker
ENV NODE_ENV=production
CMD ["pnpm", "exec", "tsx", "src/worker.ts"]
