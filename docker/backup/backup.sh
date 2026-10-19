#!/bin/sh
# okinvo backup (IMPLEMENTATION_PLAN_v2.md §16.4): a Postgres custom-format dump plus a tarball of
# the storage directory, written atomically into $BACKUP_DIR, pruned by age, and summarised in
# $BACKUP_DIR/last-backup.json which Settings → Data reads.
#
#   backup.sh --now      run one backup and exit non-zero on failure
#   backup.sh --daemon   install $BACKUP_CRON into busybox crond and run it in the foreground
#
# Runs on the stock postgres:18.6-alpine image (pg_dump, tar, crond are all there). Connection
# details come from PG* or, in Compose, from the POSTGRES_* values in .env.
set -eu

BACKUP_DIR="${BACKUP_DIR:-/backups}"
DATA_DIR="${DATA_DIR:-/data}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
CRON="${BACKUP_CRON:-0 2 * * *}"
STATUS="$BACKUP_DIR/last-backup.json"

export PGHOST="${PGHOST:-postgres}"
export PGPORT="${PGPORT:-5432}"
export PGUSER="${PGUSER:-${POSTGRES_USER:-okinvo}}"
export PGPASSWORD="${PGPASSWORD:-${POSTGRES_PASSWORD:-}}"
export PGDATABASE="${PGDATABASE:-${POSTGRES_DB:-okinvo}}"

now_iso() { date -u +%Y-%m-%dT%H:%M:%SZ; }

json_str() { # null for empty, else a JSON string (values here never contain quotes or backslashes)
  if [ -z "$1" ]; then printf 'null'; else printf '"%s"' "$1"; fi
}

write_status() { # ok startedAt dump tgz sizeBytes error
  mkdir -p "$BACKUP_DIR"
  {
    printf '{"ok":%s,"startedAt":"%s","finishedAt":"%s",' "$1" "$2" "$(now_iso)"
    printf '"pgDump":%s,"storageArchive":%s,' "$(json_str "$3")" "$(json_str "$4")"
    printf '"sizeBytes":%s,"retentionDays":%s,"error":%s}\n' "${5:-null}" "$RETENTION_DAYS" "$(json_str "$6")"
  } > "$STATUS.part"
  mv "$STATUS.part" "$STATUS"
}

prune() {
  find "$BACKUP_DIR/pg" "$BACKUP_DIR/storage" -type f -mtime +"$RETENTION_DAYS" -print -delete 2>/dev/null || true
}

run_backup() {
  started="$(now_iso)"
  ts="$(date -u +%Y%m%dT%H%M%SZ)"
  mkdir -p "$BACKUP_DIR/pg" "$BACKUP_DIR/storage"
  dump="$BACKUP_DIR/pg/okinvo-$ts.dump"
  tgz="$BACKUP_DIR/storage/storage-$ts.tgz"
  echo "okinvo backup: starting ($PGUSER@$PGHOST/$PGDATABASE → $dump, $DATA_DIR/storage → $tgz)"
  if ! pg_dump -Fc -f "$dump.part"; then
    rm -f "$dump.part"
    write_status false "$started" "" "" null "pg_dump failed"
    echo "okinvo backup: pg_dump failed" >&2
    return 1
  fi
  mv "$dump.part" "$dump"
  if [ -d "$DATA_DIR/storage" ]; then
    if ! tar -czf "$tgz.part" -C "$DATA_DIR" storage; then
      rm -f "$tgz.part"
      write_status false "$started" "$dump" "" null "storage tar failed"
      echo "okinvo backup: storage tar failed" >&2
      return 1
    fi
    mv "$tgz.part" "$tgz"
  else
    tgz=""
    echo "okinvo backup: no $DATA_DIR/storage directory (S3 driver?) - database only"
  fi
  size=$(stat -c %s "$dump")
  if [ -n "$tgz" ]; then size=$((size + $(stat -c %s "$tgz"))); fi
  prune
  write_status true "$started" "$dump" "$tgz" "$size" ""
  echo "okinvo backup: done ($size bytes)"
}

case "${1:-}" in
  --now)
    run_backup
    ;;
  --daemon)
    mkdir -p /etc/crontabs
    printf '%s /bin/sh /backup/backup.sh --now >> /proc/1/fd/1 2>&1\n' "$CRON" > /etc/crontabs/root
    echo "okinvo backup: schedule '$CRON' (UTC), retention $RETENTION_DAYS days, into $BACKUP_DIR"
    exec crond -f -l 6 -L /dev/stdout
    ;;
  *)
    echo "usage: backup.sh --now | --daemon" >&2
    exit 2
    ;;
esac
