FROM node:22-bookworm

ENV DEBIAN_FRONTEND=noninteractive

# PostgreSQL 15 (Debian bookworm) backs the database test suite (npm run test:db),
# which spins up a throwaway cluster with initdb/pg_ctl/psql. git + curl are
# required by fully custom Cloud Agent images.
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

# Also expose the full versioned bin dir for interactive use.
ENV PATH="/usr/lib/postgresql/15/bin:${PATH}"
