#!/usr/bin/env bash
# Takes a full, consistent Postgres backup via pg_dump's custom format
# (compressed, supports selective/parallel restore with pg_restore).
#
# Usage:
#   scripts/backup.sh
#
# Env vars:
#   DATABASE_URL             required — read from .env if not already set
#   BACKUP_DIR                default: ./backups
#   BACKUP_RETENTION_DAYS     default: 30 — older backups in BACKUP_DIR are pruned after a successful backup

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

if [ -z "${DATABASE_URL:-}" ] && [ -f .env ]; then
  # shellcheck disable=SC1091
  DATABASE_URL=$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d'=' -f2- | tr -d '"')
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is not set (checked env and .env). Aborting." >&2
  exit 1
fi

BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
mkdir -p "$BACKUP_DIR"

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_FILE="$BACKUP_DIR/blue_collar_${TIMESTAMP}.dump"

echo "Backing up database to $OUT_FILE ..."
pg_dump --dbname="$DATABASE_URL" --format=custom --compress=9 --file="$OUT_FILE"

SIZE=$(du -h "$OUT_FILE" | cut -f1)
echo "Backup complete: $OUT_FILE ($SIZE)"

if [ "$RETENTION_DAYS" -gt 0 ]; then
  DELETED=$(find "$BACKUP_DIR" -name 'blue_collar_*.dump' -mtime "+${RETENTION_DAYS}" -print -delete | wc -l)
  if [ "$DELETED" -gt 0 ]; then
    echo "Pruned $DELETED backup(s) older than ${RETENTION_DAYS} days."
  fi
fi
