# PostgreSQL 16 + pg_bigm（日本語全文検索）。公式イメージには pg_bigm が入っていないためビルドする
FROM postgres:16

ARG PG_BIGM_VERSION=1.2-20250903
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends ca-certificates curl build-essential postgresql-server-dev-16; \
    curl -fsSL "https://github.com/pgbigm/pg_bigm/archive/refs/tags/v${PG_BIGM_VERSION}.tar.gz" | tar xz -C /tmp; \
    make -C "/tmp/pg_bigm-${PG_BIGM_VERSION}" USE_PGXS=1 install; \
    rm -rf "/tmp/pg_bigm-${PG_BIGM_VERSION}"; \
    apt-get purge -y --auto-remove curl build-essential postgresql-server-dev-16; \
    rm -rf /var/lib/apt/lists/*
