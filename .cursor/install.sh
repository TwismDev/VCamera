#!/usr/bin/env bash
# Idempotent repository bootstrap for the Delivery Tracker (Expo + Supabase) app.
# Runs from /workspace after the source checkout. Node 22 and PostgreSQL 15 are
# provided by the base image.
set -euo pipefail
cd /workspace

# Install exact, locked dependencies.
npm ci

# One-time init of the local Postgres cluster used by supabase/tests/run.sh.
if [ ! -s "${PGDATA}/PG_VERSION" ]; then
  initdb -U "${PGUSER}" -A trust -D "${PGDATA}" >/dev/null
fi
