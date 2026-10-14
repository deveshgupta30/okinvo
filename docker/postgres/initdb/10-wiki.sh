#!/bin/sh
# Runs once, on the first initialisation of the Postgres data directory (docker-entrypoint-initdb.d):
# creates the database the optional Wiki.js documentation site (compose profile `docs`,
# k8s overlays/with-docs) uses, owned by the same role as the app. On an existing install run the
# CREATE DATABASE by hand once; the script is skipped when the data directory already exists.
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<SQL
CREATE DATABASE wiki OWNER "$POSTGRES_USER";
SQL
