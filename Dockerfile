# EasyPanel: Source = Git/GitHub, Build = Dockerfile
# Postgres embutido no mesmo container. Volume persistente: /var/lib/postgresql/data
# App: porta 3000
FROM node:20-bookworm-slim AS deps
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-bookworm-slim AS builder
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build"
ENV SESSION_SECRET="build-time-session-secret-placeholder-min-32-chars"
ENV SESSION_SECURE="false"

RUN npx prisma generate \
  && npx next build

FROM node:20-bookworm-slim AS runner
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    openssl \
    ca-certificates \
    postgresql \
    postgresql-contrib \
  && rm -rf /var/lib/apt/lists/* \
  && for v in 14 15 16 17; do pg_dropcluster --stop "$v" main 2>/dev/null || true; done \
  && mkdir -p /var/lib/postgresql/data \
  && chown -R postgres:postgres /var/lib/postgresql

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV PGDATA=/var/lib/postgresql/data
ENV POSTGRES_USER=nandera
ENV POSTGRES_PASSWORD=nandera
ENV POSTGRES_DB=nandera
ENV DATABASE_URL="postgresql://nandera:nandera@127.0.0.1:5432/nandera"

COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/src ./src
COPY --from=builder /app/tsconfig.json ./
COPY --from=builder /app/scripts/docker-entrypoint.sh ./scripts/docker-entrypoint.sh

RUN chmod +x /app/scripts/docker-entrypoint.sh

VOLUME ["/var/lib/postgresql/data"]
EXPOSE 3000

ENTRYPOINT ["/app/scripts/docker-entrypoint.sh"]
