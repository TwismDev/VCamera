#!/usr/bin/env bash
# Per-boot startup: bring up the local Postgres that supabase/tests/run.sh uses.
# Idempotent - does nothing if the server is already running.
set -euo pipefail

if ! pg_ctl -D "${PGDATA}" status >/dev/null 2>&1; then
  # Keep the unix socket inside the (writable) data dir; the default
  # /var/run/postgresql is not writable by an unprivileged user.
  pg_ctl -D "${PGDATA}" -o "-p ${PGPORT} -h ${PGHOST} -k ${PGDATA}" -l "${PGDATA}/server.log" -w start
fi
