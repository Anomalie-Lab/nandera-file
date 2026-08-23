#!/bin/sh
set -e

export PORT="${APP_PORT:-3000}"
export HOSTNAME=0.0.0.0
export PGDATA="${PGDATA:-/var/lib/postgresql/data}"
export POSTGRES_USER="${POSTGRES_USER:-nandera}"
export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-nandera}"
export POSTGRES_DB="${POSTGRES_DB:-nandera}"
# * = acessível pelo IP do host quando a porta 5432 está publicada.
export POSTGRES_LISTEN_ADDRESSES="${POSTGRES_LISTEN_ADDRESSES:-*}"

# Default: banco embutido. EasyPanel com Postgres separado: defina DATABASE_URL
# apontando para o host do serviço (não 127.0.0.1) ou EMBEDDED_POSTGRES=0.
EMBEDDED_POSTGRES="${EMBEDDED_POSTGRES:-1}"
case "$EMBEDDED_POSTGRES" in
  0|false|FALSE|no|NO) EMBEDDED_POSTGRES=0 ;;
  *) EMBEDDED_POSTGRES=1 ;;
esac

if [ -n "$DATABASE_URL" ]; then
  db_host=$(printf '%s' "$DATABASE_URL" | sed -n 's#.*@\([^:/]*\).*#\1#p')
  case "$db_host" in
    127.0.0.1|localhost|"") ;;
    *) EMBEDDED_POSTGRES=0 ;;
  esac
fi

start_embedded_postgres() {
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
      echo "listen_addresses = '${POSTGRES_LISTEN_ADDRESSES}'"
      echo "port = 5432"
    } >> "$PGDATA/postgresql.conf"
    echo "host all all 127.0.0.1/32 md5" >> "$PGDATA/pg_hba.conf"
  fi

  if [ "$POSTGRES_LISTEN_ADDRESSES" != "127.0.0.1" ] && [ "$POSTGRES_LISTEN_ADDRESSES" != "localhost" ]; then
    grep -q "0.0.0.0/0" "$PGDATA/pg_hba.conf" \
      || echo "host all all 0.0.0.0/0 md5" >> "$PGDATA/pg_hba.conf"
  fi

  runuser -u postgres -- pg_ctl -D "$PGDATA" -o "-c listen_addresses=${POSTGRES_LISTEN_ADDRESSES} -c port=5432" -w start

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
  runuser -u postgres -- psql -d postgres -c "ALTER USER ${POSTGRES_USER} WITH PASSWORD '${POSTGRES_PASSWORD}';"

  runuser -u postgres -- psql -d postgres -tc "SELECT 1 FROM pg_database WHERE datname='${POSTGRES_DB}'" | grep -q 1 \
    || runuser -u postgres -- psql -d postgres -c "CREATE DATABASE ${POSTGRES_DB} OWNER ${POSTGRES_USER};"

  export DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:5432/${POSTGRES_DB}"
}

if [ "$EMBEDDED_POSTGRES" -eq 0 ]; then
  if [ -z "$DATABASE_URL" ]; then
    echo "External Postgres requires DATABASE_URL (or unset EMBEDDED_POSTGRES)"
    exit 1
  fi
  echo "Using external Postgres (embedded server disabled)"
else
  start_embedded_postgres
fi

npx prisma db push --skip-generate
npx tsx prisma/seed.ts

export PRISMA_STUDIO_PORT="${PRISMA_STUDIO_PORT:-5555}"
app=""
studio=""
shutdown() {
  if [ -n "$app" ]; then
    kill "$app" 2>/dev/null || true
    wait "$app" 2>/dev/null || true
  fi
  if [ -n "$studio" ]; then
    kill "$studio" 2>/dev/null || true
    wait "$studio" 2>/dev/null || true
  fi
  if [ "$EMBEDDED_POSTGRES" -eq 1 ]; then
    runuser -u postgres -- pg_ctl -D "$PGDATA" -m fast -w stop || true
  fi
}
trap shutdown TERM INT

echo "Starting Prisma Studio on 0.0.0.0:${PRISMA_STUDIO_PORT}"
npx prisma studio --hostname 0.0.0.0 --port "$PRISMA_STUDIO_PORT" --browser none &
studio=$!

npx next start -H "$HOSTNAME" -p "$PORT" &
app=$!
wait "$app"
status=$?
shutdown
exit "$status"
