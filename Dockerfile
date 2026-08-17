# EasyPanel: Source = Git/GitHub, Build = Dockerfile
# Banco: serviço PostgreSQL separado. Env: DATABASE_URL=postgresql://user:pass@host:5432/db
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
# prisma generate não precisa de Postgres vivo; URL só satisfaz o schema.
ENV DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build"
# EasyPanel passa SESSION_SECRET como --build-arg, mas ARG sem ENV não entra no next build.
# Placeholder só para o prerender; o secret real vem das env do container em runtime.
ENV SESSION_SECRET="build-time-session-secret-placeholder-min-32-chars"
ENV SESSION_SECURE="false"

RUN npx prisma generate \
  && npx next build

FROM node:20-bookworm-slim AS runner
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/src ./src
COPY --from=builder /app/tsconfig.json ./
COPY --from=builder /app/scripts/docker-entrypoint.sh ./scripts/docker-entrypoint.sh

RUN chmod +x /app/scripts/docker-entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["/app/scripts/docker-entrypoint.sh"]
