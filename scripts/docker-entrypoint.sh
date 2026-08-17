#!/bin/sh
set -e

export PORT="${APP_PORT:-3000}"
export HOSTNAME=0.0.0.0

if [ -z "$DATABASE_URL" ]; then
  echo "DATABASE_URL is required (postgresql://user:pass@host:5432/dbname)"
  exit 1
fi

i=0
until npx prisma db push --skip-generate; do
  i=$((i + 1))
  if [ "$i" -ge 30 ]; then
    echo "Postgres did not become ready in time"
    exit 1
  fi
  echo "Waiting for Postgres ($i/30)..."
  sleep 2
done

npx tsx prisma/seed.ts

exec npx next start -H "$HOSTNAME" -p "$PORT"
