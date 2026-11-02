#!/usr/bin/env bash
# ==============================================================================
# GCS CONNECT — Automated Database Backup & Encryption Script
# Phase 14: Hostinger Production Deployment Automation
# Global Crest Solutions (GCS)
# ==============================================================================

set -euo pipefail

# ANSI Colors
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'
BOLD='\033[1m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

BACKUP_DIR="${BACKUP_DIR:-$PROJECT_ROOT/backups}"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_SQL="$BACKUP_DIR/gcs_connect_${TIMESTAMP}.sql"
BACKUP_GZ="$BACKUP_SQL.gz"
BACKUP_ENC="$BACKUP_GZ.enc"

echo -e "${CYAN}${BOLD}[1/4] Initializing database backup at $(date)...${NC}"

# Source environment variables
if [ -f "$PROJECT_ROOT/.env" ]; then
  set -a
  source "$PROJECT_ROOT/.env"
  set +a
fi

# Parse DATABASE_URL (format: mysql://USER:PASS@HOST:PORT/DBNAME)
DB_URL="${DATABASE_URL:-}"
if [ -z "$DB_URL" ]; then
  echo -e "${RED}[ERROR] DATABASE_URL environment variable is not defined.${NC}"
  exit 1
fi

# Extract DB credentials using regex
PROTO="$(echo "$DB_URL" | grep :// | sed -e's,^\(.*://\).*,\1,g')"
URL="$(echo "$DB_URL" | sed -e "s,$PROTO,,g")"
USER_PASS="$(echo "$URL" | grep @ | cut -d@ -f1 || true)"
DB_USER="$(echo "$USER_PASS" | cut -d: -f1)"
DB_PASS="$(echo "$USER_PASS" | cut -d: -f2)"
HOST_PORT_DB="$(echo "$URL" | sed -e "s,$USER_PASS@,,g")"
HOST_PORT="$(echo "$HOST_PORT_DB" | cut -d/ -f1)"
DB_HOST="$(echo "$HOST_PORT" | cut -d: -f1)"
DB_PORT="$(echo "$HOST_PORT" | cut -d: -f2 -s || echo 3306)"
DB_NAME="$(echo "$HOST_PORT_DB" | cut -d/ -f2 | cut -d? -f1)"

# Choose dump utility
DUMP_CMD="mysqldump"
if command -v mariadb-dump &> /dev/null; then
  DUMP_CMD="mariadb-dump"
elif ! command -v mysqldump &> /dev/null; then
  echo -e "${RED}[ERROR] Neither mysqldump nor mariadb-dump was found in PATH.${NC}"
  exit 1
fi

echo -e "${CYAN}[2/4] Dumping database '${DB_NAME}' from ${DB_HOST}:${DB_PORT}...${NC}"

# Dump schema & data with single-transaction for InnoDB consistency
$DUMP_CMD \
  --host="$DB_HOST" \
  --port="$DB_PORT" \
  --user="$DB_USER" \
  --password="$DB_PASS" \
  --single-transaction \
  --quick \
  --routines \
  --triggers \
  "$DB_NAME" > "$BACKUP_SQL"

echo -e "${GREEN}  ✓ Raw SQL dump completed: $(du -h "$BACKUP_SQL" | cut -f1)${NC}"

# Gzip compression
gzip -9 "$BACKUP_SQL"
echo -e "${GREEN}  ✓ Gzip compression completed: $(du -h "$BACKUP_GZ" | cut -f1)${NC}"

# Step 3: OpenSSL AES-256-CBC Encryption
echo -e "${CYAN}[3/4] Encrypting archive with OpenSSL AES-256-CBC...${NC}"

ENCRYPTION_PASS="${BACKUP_ENCRYPTION_KEY:-${JWT_SECRET:-gcs_fallback_encryption_key_2026}}"

openssl enc -aes-256-cbc -salt -pbkdf2 -iter 100000 \
  -in "$BACKUP_GZ" \
  -out "$BACKUP_ENC" \
  -pass "pass:$ENCRYPTION_PASS"

# Remove unencrypted gzip archive
rm -f "$BACKUP_GZ"

# Compute SHA-256 integrity checksum
SHA256=$(sha256sum "$BACKUP_ENC" | cut -d' ' -f1)
echo "$SHA256  $(basename "$BACKUP_ENC")" > "$BACKUP_ENC.sha256"

echo -e "${GREEN}  ✓ Encrypted backup created: $(basename "$BACKUP_ENC")${NC}"
echo -e "${GREEN}  ✓ Archive SHA-256: ${SHA256}${NC}"

# Step 4: Prune backups older than 30 days
echo -e "${CYAN}[4/4] Pruning backups older than 30 days in $BACKUP_DIR...${NC}"
find "$BACKUP_DIR" -name "gcs_connect_*.sql.gz.enc*" -mtime +30 -exec rm -f {} +
echo -e "${GREEN}  ✓ Retention policy enforced (30 days).${NC}"

echo -e "\n${GREEN}${BOLD}✓ Backup successfully completed at $(date).${NC}\n"
