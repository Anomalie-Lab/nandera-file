#!/bin/sh
set -e

export PORT="${APP_PORT:-3000}"
export HOSTNAME=0.0.0.0
export PGDATA="${PGDATA:-/var/lib/postgresql/data}"
export POSTGRES_USER="${POSTGRES_USER:-nandera}"
export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-nandera}"
export POSTGRES_DB="${POSTGRES_DB:-nandera}"
export DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:5432/${POSTGRES_DB}"

PG_BIN=$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | tail -n1)
if [ -z "$PG_BIN" ]; then
  echo "PostgreSQL binaries not found"
  exit 1
fi
export PATH="$PG_BIN:$PATH"

mkdir -p "$PGDATA"
chown -R postgres:postgres /var/lib/postgresql

if [ ! -s "$PGDATA/PG_VERSION" ]; then
  echo "Initializing local Postgres at $PGDATA"
  runuser -u postgres -- initdb -D "$PGDATA" --locale=C --encoding=UTF8 --auth-local=trust --auth-host=md5
  {
    echo "listen_addresses = '127.0.0.1'"
    echo "port = 5432"
  } >> "$PGDATA/postgresql.conf"
  echo "host all all 127.0.0.1/32 md5" >> "$PGDATA/pg_hba.conf"
fi

runuser -u postgres -- pg_ctl -D "$PGDATA" -o "-c listen_addresses=127.0.0.1 -c port=5432" -w start

i=0
until runuser -u postgres -- pg_isready -h 127.0.0.1 -p 5432; do
  i=$((i + 1))
  if [ "$i" -ge 30 ]; then
    echo "Postgres did not become ready in time"
    runuser -u postgres -- pg_ctl -D "$PGDATA" -m fast stop || true
    exit 1
  fi
  echo "Waiting for Postgres ($i/30)..."
  sleep 1
done

runuser -u postgres -- psql -d postgres -tc "SELECT 1 FROM pg_roles WHERE rolname='${POSTGRES_USER}'" | grep -q 1 \
  || runuser -u postgres -- psql -d postgres -c "CREATE USER ${POSTGRES_USER} WITH PASSWORD '${POSTGRES_PASSWORD}' SUPERUSER;"

runuser -u postgres -- psql -d postgres -tc "SELECT 1 FROM pg_database WHERE datname='${POSTGRES_DB}'" | grep -q 1 \
  || runuser -u postgres -- psql -d postgres -c "CREATE DATABASE ${POSTGRES_DB} OWNER ${POSTGRES_USER};"

npx prisma db push --skip-generate
npx tsx prisma/seed.ts

child=""
shutdown() {
  if [ -n "$child" ]; then
    kill "$child" 2>/dev/null || true
    wait "$child" 2>/dev/null || true
  fi
  runuser -u postgres -- pg_ctl -D "$PGDATA" -m fast -w stop || true
}
trap shutdown TERM INT

npx next start -H "$HOSTNAME" -p "$PORT" &
child=$!
wait "$child"
status=$?
shutdown
exit "$status"
