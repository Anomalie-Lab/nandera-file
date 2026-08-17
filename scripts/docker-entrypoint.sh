#!/bin/sh
set -e

mkdir -p /app/data

export DATABASE_URL="${DATABASE_URL:-file:/app/data/prod.db}"
# EasyPanel injeta PORT=80 (proxy no host). O app escuta só no container.
export PORT="${APP_PORT:-3000}"
export HOSTNAME=0.0.0.0

npx prisma db push --skip-generate
npx tsx prisma/seed.ts

exec npx next start -H "$HOSTNAME" -p "$PORT"
