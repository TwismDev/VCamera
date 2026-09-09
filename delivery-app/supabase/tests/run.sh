#!/usr/bin/env bash
# Applies the schema to a throwaway Postgres and runs the security suite
# against it. No Supabase account, no network, nothing to clean up by hand.
#
#   ./supabase/tests/run.sh
#
# Requires a local PostgreSQL 15+ (`initdb`, `pg_ctl`, `psql`).
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
base="${TMPDIR:-/tmp}/delivery-tracker-test-$$"
port="${PGPORT:-55432}"

# Postgres refuses to run as root, so drop to an unprivileged account if needed.
runner=""
if [ "$(id -u)" -eq 0 ]; then
  runner="$(id -un postgres 2>/dev/null || echo '')"
  if [ -z "$runner" ]; then
    echo "Run this as a non-root user, or create a 'postgres' user." >&2
    exit 1
  fi
fi

# `su` resets PATH, which drops the versioned Postgres bin dir on Debian/Ubuntu.
run() {
  if [ -n "$runner" ]; then
    su "$runner" -s /bin/bash -c "export PATH='$PATH'; $1"
  else
    bash -c "$1"
  fi
}

cleanup() {
  run "pg_ctl -D '$base/data' stop -m immediate" >/dev/null 2>&1 || true
  rm -rf "$base"
}
trap cleanup EXIT

mkdir -p "$base/data"
[ -n "$runner" ] && chown -R "$runner" "$base"

run "initdb -U postgres -A trust -D '$base/data'" >/dev/null
run "pg_ctl -D '$base/data' -o '-p $port -k $base' -l '$base/log' start" >/dev/null

for _ in $(seq 1 30); do
  psql -h "$base" -p "$port" -U postgres -tAc 'select 1' >/dev/null 2>&1 && break
  sleep 0.5
done

psql -h "$base" -p "$port" -U postgres -v ON_ERROR_STOP=1 -q \
  -f "$here/00_supabase_shim.sql" \
  -f "$here/../migrations/0001_schema.sql"

echo
echo "Re-applying the schema to confirm it is idempotent…"
psql -h "$base" -p "$port" -U postgres -v ON_ERROR_STOP=1 -q \
  -f "$here/../migrations/0001_schema.sql"

echo
psql -h "$base" -p "$port" -U postgres -v ON_ERROR_STOP=1 \
  -f "$here/01_security.sql"

echo
psql -h "$base" -p "$port" -U postgres -v ON_ERROR_STOP=1 \
  -f "$here/02_end_of_day.sql"
