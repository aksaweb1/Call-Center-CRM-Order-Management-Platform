#!/bin/sh
# Nightly backup for Call Center CRM — Linux / Mac Side Laptop
# Crontab: 0 2 * * * /path/to/infra/backup.sh

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_DIR="$ROOT/backups"
mkdir -p "$BACKUP_DIR"
STAMP=$(date +%F)
FILE="$BACKUP_DIR/callcenter_${STAMP}.sql"

echo "[$(date)] Dumping DB to $FILE ..."
# Compose project name is callcenter-crm
DB_CONTAINER=$(docker ps --format "{{.Names}}" | grep -i db | head -1)
if [ -z "$DB_CONTAINER" ]; then DB_CONTAINER="callcenter-crm-db-1"; fi

docker exec "$DB_CONTAINER" pg_dump -U callcenter callcenter > "$FILE"
gzip -f "$FILE"
echo "Backup OK: $FILE.gz"
# keep last 14
find "$BACKUP_DIR" -name "callcenter_*.sql.gz" -mtime +14 -delete
