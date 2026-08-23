FROM oven/bun:1.4.0-alpine

WORKDIR /app

COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN bun install --frozen-lockfile

COPY apps ./apps
COPY packages ./packages
RUN bun run build:web
RUN mkdir -p /app/data && chown -R bun:bun /app/data

ENV NODE_ENV=production
ENV PORT=3000
ENV ROOMWAVE_DB_PATH=/app/data/roomwave.sqlite
ENV ROOMWAVE_SERVE_WEB=1

USER bun
EXPOSE 3000

CMD ["bun", "run", "apps/api/src/index.ts"]
