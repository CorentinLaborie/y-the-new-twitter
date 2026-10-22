#!/usr/bin/env bash
# Restores an encrypted dump into a scratch database and compares row counts with the source (M0 steps 12.1 and 12.2).
#
# Required environment:
#   BACKUP_FILE            encrypted dump to restore (made by backup.sh)
#   BACKUP_KEY_FILE        file holding the encryption passphrase
#   RESTORE_DATABASE_URL   scratch database; it must never be the production or the development database
#   SOURCE_DATABASE_URL    database the dump was taken from, for the row-count comparison
# Optional:
#   PG_RESTORE_CMD, PSQL_CMD   default pg_restore and psql (overridable for tests in a container)
set -euo pipefail

: "${BACKUP_FILE:?BACKUP_FILE is required}"
: "${BACKUP_KEY_FILE:?BACKUP_KEY_FILE is required}"
: "${RESTORE_DATABASE_URL:?RESTORE_DATABASE_URL is required}"
: "${SOURCE_DATABASE_URL:?SOURCE_DATABASE_URL is required}"

PG_RESTORE_CMD="${PG_RESTORE_CMD:-pg_restore}"
PSQL_CMD="${PSQL_CMD:-psql}"

# Tables compared between the source and the restored copy.
TABLES="users questions replies"

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in "$BACKUP_FILE" -out "$tmp" -pass "file:$BACKUP_KEY_FILE"

# Clean the scratch database first, so the restore starts from an empty schema.
$PG_RESTORE_CMD --dbname="$RESTORE_DATABASE_URL" --clean --if-exists --no-owner --no-privileges < "$tmp"

status=0
for table in $TABLES; do
  source_count="$($PSQL_CMD "$SOURCE_DATABASE_URL" -tAc "select count(*) from $table")"
  restored_count="$($PSQL_CMD "$RESTORE_DATABASE_URL" -tAc "select count(*) from $table")"
  if [ "$source_count" = "$restored_count" ]; then
    echo "OK    $table: $restored_count rows"
  else
    echo "DIFF  $table: source $source_count, restored $restored_count"
    status=1
  fi
done

exit "$status"
