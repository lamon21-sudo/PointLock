#!/usr/bin/env bash
# =====================================================
# Database Backup Script
# =====================================================
# Creates a timestamped pg_dump backup of the database.
# Usage: ./scripts/backup-db.sh [output_directory]
#
# Requires: pg_dump, DATABASE_URL environment variable

set -euo pipefail

# ---- Configuration ----
OUTPUT_DIR="${1:-./backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FILENAME="backup_${TIMESTAMP}.dump"
FILEPATH="${OUTPUT_DIR}/${FILENAME}"

# ---- Validation ----
if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL environment variable is not set."
  echo "Set it via: export DATABASE_URL='postgresql://...'"
  exit 1
fi

if ! command -v pg_dump &> /dev/null; then
  echo "ERROR: pg_dump not found. Install PostgreSQL client tools."
  exit 1
fi

# ---- Create output directory ----
mkdir -p "$OUTPUT_DIR"

# ---- Run backup ----
echo "Starting backup..."
echo "  Target: ${FILEPATH}"

pg_dump "$DATABASE_URL" \
  --format=custom \
  --no-owner \
  --no-acl \
  --file="$FILEPATH"

# ---- Validate ----
FILESIZE=$(stat -f%z "$FILEPATH" 2>/dev/null || stat --printf="%s" "$FILEPATH" 2>/dev/null || echo "0")

if [ "$FILESIZE" -eq 0 ]; then
  echo "ERROR: Backup file is empty. Something went wrong."
  rm -f "$FILEPATH"
  exit 1
fi

echo "Backup complete!"
echo "  File: ${FILEPATH}"
echo "  Size: $(echo "scale=2; $FILESIZE / 1048576" | bc 2>/dev/null || echo "${FILESIZE} bytes")"
echo ""
echo "To restore: pg_restore --dbname=\$DATABASE_URL --no-owner --clean --if-exists ${FILEPATH}"
