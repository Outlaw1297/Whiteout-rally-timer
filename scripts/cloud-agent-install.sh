#!/usr/bin/env bash
set -euo pipefail

# Idempotent Cloud Agent bootstrap: OS Postgres + npm deps.
# Safe to re-run; does not start long-lived servers.

if ! command -v psql >/dev/null 2>&1; then
  sudo apt-get update
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y postgresql postgresql-contrib
fi

if [ -f package-lock.json ]; then
  npm ci
else
  npm install
fi
