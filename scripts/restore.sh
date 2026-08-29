#!/usr/bin/env bash
# Restores a pg_dump custom-format backup (scripts/backup.sh) into the
# database at DATABASE_URL. Destructive: --clean drops existing objects
# before recreating them, so this OVERWRITES whatever is currently in that
# database. Never point this at production without a fresh backup of the
# current state first, and never run it against the wrong DATABASE_URL.
#
# Usage:
#   scripts/restore.sh path/to/blue_collar_20260101T000000Z.dump
#   scripts/restore.sh path/to/backup.dump --yes   # skip the confirmation prompt (for scripted/CI use)
#
# Env vars:
#   DATABASE_URL   required — read from .env if not already set

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

BACKUP_FILE="${1:-}"
SKIP_CONFIRM="${2:-}"

if [ -z "$BACKUP_FILE" ]; then
  echo "Usage: scripts/restore.sh <backup-file> [--yes]" >&2
  exit 1
fi
if [ ! -f "$BACKUP_FILE" ]; then
  echo "Backup file not found: $BACKUP_FILE" >&2
  exit 1
fi

if [ -z "${DATABASE_URL:-}" ] && [ -f .env ]; then
  # shellcheck disable=SC1091
  DATABASE_URL=$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d'=' -f2- | tr -d '"')
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is not set (checked env and .env). Aborting." >&2
  exit 1
fi

# Mask credentials before ever printing the connection string.
MASKED_URL=$(echo "$DATABASE_URL" | sed -E 's#(://[^:]+):[^@]+@#\1:****@#')

if [ "$SKIP_CONFIRM" != "--yes" ]; then
  echo "This will DROP and recreate objects in the database at:"
  echo "  $MASKED_URL"
  echo "using $BACKUP_FILE"
  read -r -p "Type 'restore' to continue: " CONFIRM
  if [ "$CONFIRM" != "restore" ]; then
    echo "Aborted."
    exit 1
  fi
fi

echo "Restoring $BACKUP_FILE ..."
pg_restore --dbname="$DATABASE_URL" --clean --if-exists --no-owner --no-privileges "$BACKUP_FILE"
echo "Restore complete."
