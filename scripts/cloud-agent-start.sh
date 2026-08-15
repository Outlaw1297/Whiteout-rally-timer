#!/usr/bin/env bash
set -euo pipefail

# Per-boot: Postgres, local .env, schema deploy, then the Next.js custom server.

start_postgres() {
  if pg_isready -h 127.0.0.1 -p 5432 >/dev/null 2>&1; then
    return 0
  fi
  sudo service postgresql start 2>/dev/null || true
  if command -v pg_ctlcluster >/dev/null 2>&1; then
    sudo pg_ctlcluster 16 main start 2>/dev/null || true
  fi
  for _ in $(seq 1 30); do
    if pg_isready -h 127.0.0.1 -p 5432 >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  echo "PostgreSQL did not become ready on 127.0.0.1:5432" >&2
  return 1
}

ensure_database() {
  sudo -u postgres psql -v ON_ERROR_STOP=1 -c \
    "DO \$\$ BEGIN CREATE ROLE rally LOGIN PASSWORD 'rally'; EXCEPTION WHEN duplicate_object THEN NULL; END \$\$;"
  if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='rally_timer'" | grep -q 1; then
    sudo -u postgres psql -v ON_ERROR_STOP=1 -c "CREATE DATABASE rally_timer OWNER rally;"
  fi
  sudo -u postgres psql -v ON_ERROR_STOP=1 -d rally_timer -c "GRANT ALL ON SCHEMA public TO rally;"
}

start_postgres
ensure_database

if [ ! -f .env ]; then
  cp .env.example .env
fi

npx prisma generate
npm run db:deploy
