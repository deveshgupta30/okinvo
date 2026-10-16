#!/bin/sh
# okinvo restore (IMPLEMENTATION_PLAN_v2.md §16.4): put a database dump and a storage archive made
# by backup.sh back in place. Stop the app first - `docker compose stop app` - so nothing writes
# while the schema is replaced.
#
#   restore.sh <pg-dump> [<storage-tgz>]
#
# The dump is restored in one transaction with --clean, so a failure leaves the database as it
# was. The storage directory is unpacked beside the live one and swapped in only when the whole
# archive extracted.
set -eu

DATA_DIR="${DATA_DIR:-/data}"
export PGHOST="${PGHOST:-postgres}"
export PGPORT="${PGPORT:-5432}"
export PGUSER="${PGUSER:-${POSTGRES_USER:-okinvo}}"
export PGPASSWORD="${PGPASSWORD:-${POSTGRES_PASSWORD:-}}"
export PGDATABASE="${PGDATABASE:-${POSTGRES_DB:-okinvo}}"

dump="${1:-}"
tgz="${2:-}"
if [ -z "$dump" ] || [ ! -f "$dump" ]; then
  echo "usage: restore.sh <pg-dump> [<storage-tgz>]" >&2
  exit 2
fi

echo "okinvo restore: database $PGDATABASE from $dump"
pg_restore --clean --if-exists --no-owner --no-privileges --single-transaction \
  -d "$PGDATABASE" "$dump"

if [ -n "$tgz" ]; then
  [ -f "$tgz" ] || { echo "okinvo restore: $tgz not found" >&2; exit 2; }
  echo "okinvo restore: storage from $tgz"
  staging="$DATA_DIR/.restore-$$"
  rm -rf "$staging"
  mkdir -p "$staging"
  tar -xzf "$tgz" -C "$staging"
  [ -d "$staging/storage" ] || { echo "okinvo restore: archive has no storage/ directory" >&2; rm -rf "$staging"; exit 1; }
  rm -rf "$DATA_DIR/storage.previous"
  if [ -d "$DATA_DIR/storage" ]; then mv "$DATA_DIR/storage" "$DATA_DIR/storage.previous"; fi
  mv "$staging/storage" "$DATA_DIR/storage"
  rm -rf "$staging" "$DATA_DIR/storage.previous"
fi

echo "okinvo restore: done - start the app again (docker compose start app)"
