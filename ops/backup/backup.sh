#!/usr/bin/env bash
# Nightly PostgreSQL dump, encrypted before storage, 14 days kept (M0 steps 11.1 to 11.4).
#
# Required environment:
#   DATABASE_URL       connection string of the database to dump
#   BACKUP_DIR         folder where encrypted dumps are written (France, server side)
#   BACKUP_KEY_FILE    file holding the encryption passphrase, on the server only, never in Git
# Optional:
#   RETENTION_DAYS     default 14
#   PG_DUMP_CMD        default pg_dump (used to run the dump in another container for tests)
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${BACKUP_DIR:?BACKUP_DIR is required}"
: "${BACKUP_KEY_FILE:?BACKUP_KEY_FILE is required (the key stays on the server)}"

RETENTION_DAYS="${RETENTION_DAYS:-14}"
PG_DUMP_CMD="${PG_DUMP_CMD:-pg_dump}"

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
out="$BACKUP_DIR/y-$stamp.dump.enc"
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

mkdir -p "$BACKUP_DIR"

# Custom format, no owner or privilege statements: the restore does not need the original roles.
$PG_DUMP_CMD --dbname="$DATABASE_URL" --format=custom --no-owner --no-privileges > "$tmp"

openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -in "$tmp" -out "$out" -pass "file:$BACKUP_KEY_FILE"

# Keep the last RETENTION_DAYS days only (step 11.4).
find "$BACKUP_DIR" -maxdepth 1 -name 'y-*.dump.enc' -mtime +"$RETENTION_DAYS" -delete

echo "$out"
