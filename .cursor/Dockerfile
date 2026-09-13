FROM node:22-bookworm

# Node 22.18+ is required: the unit tests run TypeScript directly via
# `node --test` (native type stripping). node:22-bookworm tracks a newer 22.x.

ENV DEBIAN_FRONTEND=noninteractive

# PostgreSQL 15 (Debian bookworm) backs the database test suite
# (supabase/tests/run.sh). git + curl are required by fully custom images.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        postgresql \
        postgresql-client \
        git \
        curl \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# The PostgreSQL server binaries (initdb/pg_ctl/postgres) live in a versioned dir
# that is not on the default PATH, and a login shell resets PATH anyway. Symlink
# them into /usr/local/bin so the test runner finds them in any shell.
RUN PG_BIN="$(dirname "$(ls /usr/lib/postgresql/*/bin/initdb | head -1)")" \
    && for b in initdb pg_ctl postgres; do ln -sf "${PG_BIN}/${b}" "/usr/local/bin/${b}"; done

# Data dir for the local throwaway test cluster, owned by the runtime user.
RUN mkdir -p /var/lib/delivery-pg && chown -R node:node /var/lib/delivery-pg

# libpq connection defaults so supabase/tests/run.sh (plain psql) just works,
# plus the versioned bin dir for interactive use.
ENV PGDATA=/var/lib/delivery-pg \
    PGHOST=127.0.0.1 \
    PGPORT=5432 \
    PGUSER=postgres \
    PGDATABASE=postgres \
    PATH="/usr/lib/postgresql/15/bin:${PATH}"
