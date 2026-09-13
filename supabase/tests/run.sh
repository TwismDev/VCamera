#!/usr/bin/env bash
#
# Runs the database tests against a throwaway Postgres.
#
# These exercise the schema the way the app does: as a signed-in dispatcher or
# driver, with row level security enforced. They cover the job state machine,
# the position pipeline and the access rules that keep one team's work private.
#
#   ./supabase/tests/run.sh                  # against $PGHOST/$PGPORT
#   PGPORT=5433 ./supabase/tests/run.sh
#
# The target database is dropped and recreated, so never point this at a
# database with anything in it.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS="$HERE/../migrations"
DB="${TEST_DB:-delivery_tracker_test}"

psql -q -d postgres -c "drop database if exists ${DB};"
psql -q -d postgres -c "create database ${DB};"

echo "› building the schema"
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$HERE/00_harness.sql" > /dev/null
for migration in "$MIGRATIONS"/*.sql; do
  psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$migration" 2>&1 | grep -v "skipping" || true
done

failed=0
for suite in "$HERE"/[0-9][0-9]_*.sql; do
  case "$(basename "$suite")" in 00_harness.sql) continue ;; esac
  echo "› $(basename "$suite")"
  if ! psql -v ON_ERROR_STOP=1 -d "$DB" -f "$suite" 2>&1 | grep -E "pass |FAIL|ERROR"; then
    failed=1
  fi
done

if [ "$failed" -ne 0 ]; then
  echo "✗ database tests failed"
  exit 1
fi
echo "✓ database tests passed"
