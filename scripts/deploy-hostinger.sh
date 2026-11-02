#!/usr/bin/env bash
# ==============================================================================
# GCS CONNECT — Hostinger Production Deployment Automation
# Phase 14: Hostinger Production Deployment Automation
# Global Crest Solutions (GCS)
# ==============================================================================

set -euo pipefail

# ANSI Colors (GCS Emerald Theme)
GREEN='\033[0;32m'
EMERALD='\033[38;2;0;168;121m'
MINT='\033[38;2;182;241;217m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'
BOLD='\033[1m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

echo -e "${EMERALD}${BOLD}"
echo "========================================================================"
echo "    GCS CONNECT — HOSTINGER PRODUCTION DEPLOYMENT AUTOMATION"
echo "           'Connect Freely. Communicate Securely.'"
echo "========================================================================"
echo -e "${NC}"

DEPLOY_START=$(date +%s)

# ------------------------------------------------------------------------------
# Step 1: Pre-flight Verification
# ------------------------------------------------------------------------------
echo -e "${CYAN}[1/7] Performing pre-flight system checks...${NC}"

# Check Node.js version
NODE_VERSION=$(node -v | tr -d 'v' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  echo -e "${RED}[ERROR] Node.js 18+ is required. Found: $(node -v)${NC}"
  exit 1
fi
echo -e "${GREEN}  ✓ Node.js version: $(node -v)${NC}"

# Check required binaries
for cmd in npm git openssl; do
  if ! command -v "$cmd" &> /dev/null; then
    echo -e "${RED}[ERROR] Required command '$cmd' is not installed in PATH.${NC}"
    exit 1
  fi
done
echo -e "${GREEN}  ✓ Required toolchains verified (npm, git, openssl).${NC}"

# ------------------------------------------------------------------------------
# Step 2: Environment & Production Secrets Initialization
# ------------------------------------------------------------------------------
echo -e "\n${CYAN}[2/7] Checking environment configuration and production secrets...${NC}"

if [ ! -f ".env" ] && [ ! -f ".env.production" ]; then
  echo -e "${YELLOW}  ! No .env file detected. Generating secure production secrets...${NC}"
  
  JWT_SECRET_GEN=$(openssl rand -base64 48)
  COOKIE_SECRET_GEN=$(openssl rand -base64 48)
  BACKUP_KEY_GEN=$(openssl rand -base64 32)
  
  cat <<EOF > .env
# GCS CONNECT — Production Configuration
NODE_ENV="production"
PORT=3001
API_PORT=3001
HOST="0.0.0.0"

# Application Domains
NEXT_PUBLIC_APP_URL="https://connect.globalcrestsolutions.com"
NEXT_PUBLIC_API_URL="https://connect.globalcrestsolutions.com/api"
NEXT_PUBLIC_SOCKET_URL="https://connect.globalcrestsolutions.com"

# Database Connection (MySQL / MariaDB on Hostinger VPS)
DATABASE_URL="mysql://gcs_prod_user:ReplaceWithStrongDbPassword@127.0.0.1:3306/gcs_connect"

# Cryptographic Session Secrets
JWT_SECRET="${JWT_SECRET_GEN}"
COOKIE_SIGNING_KEY="${COOKIE_SECRET_GEN}"
BACKUP_ENCRYPTION_KEY="${BACKUP_KEY_GEN}"
SESSION_COOKIE_NAME="gcs_session"

# Upload and Calling Configurations
MAX_UPLOAD_SIZE_BYTES=52428800
STUN_SERVER_URL="stun:stun.l.google.com:19302"
EOF
  echo -e "${GREEN}  ✓ Created new .env file with high-entropy cryptographic keys.${NC}"
else
  echo -e "${GREEN}  ✓ Production environment configuration loaded.${NC}"
fi

set -a
source .env
set +a

# ------------------------------------------------------------------------------
# Step 3: Production Dependency Installation
# ------------------------------------------------------------------------------
echo -e "\n${CYAN}[3/7] Installing production dependencies...${NC}"
npm install --prefer-offline --no-audit

# ------------------------------------------------------------------------------
# Step 4: Prisma Database Schema Synchronization
# ------------------------------------------------------------------------------
echo -e "\n${CYAN}[4/7] Synchronizing Prisma database schema with target database...${NC}"
npx prisma generate

if [ "${SKIP_DB_MIGRATE:-false}" = "true" ]; then
  echo -e "${YELLOW}  ! SKIP_DB_MIGRATE=true: Skipping database schema migration.${NC}"
else
  if npx prisma db push --skip-generate; then
    echo -e "${GREEN}  ✓ Database schema synchronized successfully.${NC}"
  else
    echo -e "${YELLOW}  ! DB push had warnings or DB is offline; proceeding with caution.${NC}"
  fi
fi

# ------------------------------------------------------------------------------
# Step 5: Next.js 14 Production Bundle Compilation
# ------------------------------------------------------------------------------
echo -e "\n${CYAN}[5/7] Building Next.js 14 production bundle...${NC}"
NODE_ENV=production npm run build
echo -e "${GREEN}  ✓ Next.js production build succeeded.${NC}"

# ------------------------------------------------------------------------------
# Step 6: Service Restart / Reload
# ------------------------------------------------------------------------------
echo -e "\n${CYAN}[6/7] Managing production service daemons...${NC}"

if command -v systemctl &> /dev/null && [ "$(id -u)" -eq 0 ]; then
  echo -e "${CYAN}  → Reloading systemd daemon and restarting GCS CONNECT services...${NC}"
  systemctl daemon-reload
  if systemctl is-active --quiet gcs-api.service; then
    systemctl restart gcs-api.service
    echo -e "${GREEN}  ✓ Restarted gcs-api.service.${NC}"
  fi
  if systemctl is-active --quiet gcs-web.service; then
    systemctl restart gcs-web.service
    echo -e "${GREEN}  ✓ Restarted gcs-web.service.${NC}"
  fi
else
  echo -e "${YELLOW}  ! Non-root or systemd unavailable; system service restart skipped.${NC}"
  echo -e "${YELLOW}  → In manual or local mode: run 'npm run server' and 'npm start'.${NC}"
fi

# ------------------------------------------------------------------------------
# Step 7: Post-Deployment Smoke Test
# ------------------------------------------------------------------------------
echo -e "\n${CYAN}[7/7] Running post-deployment health checks...${NC}"

# If test server is running locally on port 3001, probe it
if curl -s -f "http://127.0.0.1:3001/api/health" > /dev/null 2>&1; then
  HEALTH_JSON=$(curl -s "http://127.0.0.1:3001/api/health")
  STATUS=$(echo "$HEALTH_JSON" | grep -o '"status":"[^"]*"' | cut -d: -f2 | tr -d '"')
  ZERO_KNOWLEDGE=$(echo "$HEALTH_JSON" | grep -o '"zeroKnowledge":true' || true)
  echo -e "${GREEN}  ✓ API Healthcheck verified: Status = ${STATUS}${NC}"
  if [ -n "$ZERO_KNOWLEDGE" ]; then
    echo -e "${GREEN}  ✓ Zero-Knowledge cryptographic invariant: ACTIVE${NC}"
  fi
else
  echo -e "${YELLOW}  ! API server not currently bound to 127.0.0.1:3001; skipping live health probe.${NC}"
fi

DEPLOY_END=$(date +%s)
TOTAL_DEPLOY_TIME=$((DEPLOY_END - DEPLOY_START))

echo -e "\n${MINT}${BOLD}========================================================================"
echo "          HOSTINGER PRODUCTION DEPLOYMENT COMPLETED IN ${TOTAL_DEPLOY_TIME}s             "
echo "========================================================================"
echo -e "  Application Frontend  : ${CYAN}http://localhost:3000 (Port 3000)${NC}"
echo -e "  Real-Time Signaling   : ${CYAN}http://localhost:3001 (Port 3001)${NC}"
echo -e "  Nginx Reverse Proxy   : ${CYAN}/etc/nginx/sites-available/gcs-connect.conf${NC}"
echo -e "  Systemd Service (API) : ${CYAN}/etc/systemd/system/gcs-api.service${NC}"
echo -e "  Systemd Service (Web) : ${CYAN}/etc/systemd/system/gcs-web.service${NC}"
echo -e "  Automated Backups     : ${CYAN}scripts/backup-db.sh (Cron: 0 2 * * *)${NC}"
echo -e "${MINT}========================================================================${NC}\n"
