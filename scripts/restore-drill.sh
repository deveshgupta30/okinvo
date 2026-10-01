#!/usr/bin/env bash
# Restore drill (IMPLEMENTATION_PLAN_v2.md §19): proves the backup pair restores to the same data.
#
#   fresh database + migrations → fixture (one issued invoice with a stored PDF) → backup.sh --now
#   → wipe (drop the schema, delete the storage directory) → restore.sh → row counts equal and the
#   PDF hashes to the Document row's sha256
#
# Needs: Docker, the compose.dev Postgres (`pnpm db:up`), pnpm deps and a generated Prisma client.
# backup.sh / restore.sh run in a stock postgres:18.6-alpine container attached to the compose.dev
# network, exactly as the production `backup` service does. The drill owns a database of its own
# (the name must contain "drill" — it is dropped and recreated every run) and a temporary storage
# root, so the developer's dev database and .data/storage are never touched.
set -euo pipefail
cd "$(dirname "$0")/.."

export DATABASE_URL="${DATABASE_URL:-postgresql://okinvo:okinvo@127.0.0.1:5432/okinvo_drill}"
NETWORK="${DRILL_NETWORK:-okinvo-dev_default}"
PG_IMAGE="${DRILL_PG_IMAGE:-postgres:18.6-alpine}"

# Credentials from DATABASE_URL (postgresql://user:pass@host:port/db)
url_part() { printf '%s' "$DATABASE_URL" | sed -E "s#^[a-z]+://([^:]+):([^@]+)@([^:/]+):?([0-9]*)/([^?]+).*#\\$1#"; }
PG_USER="$(url_part 1)"
PG_PASS="$(url_part 2)"
PG_DB="$(url_part 5)"
case "$PG_DB" in
  *drill*) ;;
  *) echo "restore-drill: refusing to use database '$PG_DB' — the name must contain 'drill' (it is dropped and recreated)" >&2; exit 2 ;;
esac

# Docker Desktop on Windows (Git Bash) wants C:/… host paths and no MSYS path mangling.
hostpath() { if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else printf '%s' "$1"; fi; }
export MSYS_NO_PATHCONV=1

DRILL_DIR="$(mktemp -d "${TMPDIR:-/tmp}/okinvo-drill.XXXXXX")"
mkdir -p "$DRILL_DIR/data/storage" "$DRILL_DIR/backups"
export STORAGE_DRIVER=local
export STORAGE_LOCAL_ROOT="$DRILL_DIR/data/storage"
trap 'rm -rf "$DRILL_DIR"' EXIT

run_in_pg() { # <args…>: a command inside the stock Postgres image on the dev network
  docker run --rm --network "$NETWORK" \
    -e PGHOST=postgres -e PGUSER="$PG_USER" -e PGPASSWORD="$PG_PASS" -e PGDATABASE="$PG_DB" \
    -e BACKUP_RETENTION_DAYS=30 \
    -v "$(hostpath "$PWD/docker/backup"):/backup:ro" \
    -v "$(hostpath "$DRILL_DIR/data"):/data" \
    -v "$(hostpath "$DRILL_DIR/backups"):/backups" \
    "$PG_IMAGE" "$@"
}
sql() { run_in_pg psql -v ON_ERROR_STOP=1 -q "$@"; }

echo "▸ 1/5 fresh database '$PG_DB', migrations, drill fixture"
sql -d postgres -c "DROP DATABASE IF EXISTS \"$PG_DB\"" -c "CREATE DATABASE \"$PG_DB\""
pnpm exec prisma migrate deploy >/dev/null
FIXTURE="$(node --import tsx --import ./scripts/lib/strip-server-only.mjs scripts/drill-fixture.ts)"
echo "   fixture: $FIXTURE"

echo "▸ 2/5 back up (pg_dump + storage tar)"
run_in_pg /bin/sh /backup/backup.sh --now
DUMP="$(ls "$DRILL_DIR"/backups/pg/*.dump | head -n 1)"
TGZ="$(ls "$DRILL_DIR"/backups/storage/*.tgz | head -n 1)"
grep -q '"ok":true' "$DRILL_DIR/backups/last-backup.json"
echo "   $(basename "$DUMP") $(basename "$TGZ")"

echo "▸ 3/5 wipe: drop the schema and the storage directory"
sql -c "DROP SCHEMA public CASCADE" -c "CREATE SCHEMA public"
rm -rf "$DRILL_DIR/data/storage"
if node --import tsx --import ./scripts/lib/strip-server-only.mjs scripts/drill-verify.ts "$FIXTURE" >/dev/null 2>&1; then
  echo "   wipe did not take effect" >&2
  exit 1
fi

echo "▸ 4/5 restore"
run_in_pg /bin/sh /backup/restore.sh "/backups/pg/$(basename "$DUMP")" "/backups/storage/$(basename "$TGZ")"

echo "▸ 5/5 verify row counts and the PDF hash"
node --import tsx --import ./scripts/lib/strip-server-only.mjs scripts/drill-verify.ts "$FIXTURE"
