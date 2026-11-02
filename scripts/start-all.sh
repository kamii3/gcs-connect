#!/usr/bin/env bash
set -e

# ==============================================================================
# GCS CONNECT — Complete Platform Startup Script
# 'Connect Freely. Communicate Securely.'
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${ROOT_DIR}"

COLOR_RESET="\033[0m"
COLOR_EMERALD="\033[38;2;0;168;121m"
COLOR_MINT="\033[38;2;182;241;217m"
COLOR_MUTED="\033[38;2;138;162;150m"
COLOR_YELLOW="\033[33m"
COLOR_RED="\033[31m"

echo -e "${COLOR_EMERALD}"
echo "========================================================================"
echo "    GCS CONNECT — ENTERPRISE SECURE PLATFORM LAUNCHER"
echo "           'Connect Freely. Communicate Securely.'"
echo "========================================================================"
echo -e "${COLOR_RESET}"

# 1. MariaDB Check / Startup
echo -e "[1/4] Checking MariaDB database service on port 3307..."
if ss -tulpn 2>/dev/null | grep -q ":3307 "; then
    echo -e "  ${COLOR_MINT}✓ MariaDB is already running on port 3307.${COLOR_RESET}"
else
    echo -e "  ${COLOR_MUTED}Starting local MariaDB daemon on port 3307...${COLOR_RESET}"
    /usr/sbin/mariadbd \
      --datadir="${ROOT_DIR}/.mysql_dev" \
      --port=3307 \
      --socket="${ROOT_DIR}/.mysql_dev/mysql.sock" \
      --pid-file="${ROOT_DIR}/.mysql_dev/mariadb.pid" \
      --bind-address=127.0.0.1 > /dev/null 2>&1 &
    sleep 2
    if ss -tulpn 2>/dev/null | grep -q ":3307 "; then
        echo -e "  ${COLOR_MINT}✓ MariaDB started successfully.${COLOR_RESET}"
    else
        echo -e "  ${COLOR_RED}✗ Failed to start MariaDB. Please check logs.${COLOR_RESET}"
        exit 1
    fi
fi

# 2. Express Backend Check / Startup
echo -e "[2/4] Checking Express/Socket.IO API hub on port 3001..."
if curl -s http://127.0.0.1:3001/api/health 2>/dev/null | grep -q "ONLINE"; then
    echo -e "  ${COLOR_MINT}✓ Express backend API is already active on port 3001.${COLOR_RESET}"
else
    echo -e "  ${COLOR_MUTED}Starting Express backend API server...${COLOR_RESET}"
    nohup npm run server > "${ROOT_DIR}/storage/backend.log" 2>&1 &
    sleep 3
    if curl -s http://127.0.0.1:3001/api/health 2>/dev/null | grep -q "ONLINE"; then
        echo -e "  ${COLOR_MINT}✓ Express backend API initialized successfully.${COLOR_RESET}"
    else
        echo -e "  ${COLOR_RED}✗ Express backend failed to respond. Check storage/backend.log.${COLOR_RESET}"
        exit 1
    fi
fi

# 3. Next.js Frontend Check / Startup
echo -e "[3/4] Checking Next.js production frontend on port 3000..."
if curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/ 2>/dev/null | grep -q "200"; then
    echo -e "  ${COLOR_MINT}✓ Next.js frontend is already active on port 3000.${COLOR_RESET}"
else
    echo -e "  ${COLOR_MUTED}Starting Next.js production server...${COLOR_RESET}"
    nohup npm run start > "${ROOT_DIR}/storage/frontend.log" 2>&1 &
    sleep 2
    if curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/ 2>/dev/null | grep -q "200"; then
        echo -e "  ${COLOR_MINT}✓ Next.js frontend is running.${COLOR_RESET}"
    else
        echo -e "  ${COLOR_RED}✗ Next.js failed to respond. Check storage/frontend.log.${COLOR_RESET}"
        exit 1
    fi
fi

# 4. Open in Default Browser
echo -e "[4/4] Opening GCS CONNECT in your browser..."
TARGET_URL="http://localhost:3000"

if command -v xdg-open > /dev/null 2>&1; then
    DISPLAY="${DISPLAY:-:0}" xdg-open "${TARGET_URL}" > /dev/null 2>&1 || true
elif command -v chromium > /dev/null 2>&1; then
    chromium "${TARGET_URL}" > /dev/null 2>&1 &
elif command -v firefox > /dev/null 2>&1; then
    firefox "${TARGET_URL}" > /dev/null 2>&1 &
fi

echo ""
echo -e "${COLOR_EMERALD}========================================================================${COLOR_RESET}"
echo -e "${COLOR_MINT}             GCS CONNECT IS NOW RUNNING AND ACCESSIBLE!${COLOR_RESET}"
echo -e "${COLOR_EMERALD}========================================================================${COLOR_RESET}"
echo -e "  • Chat Web App       : ${COLOR_MINT}http://localhost:3000${COLOR_RESET}"
echo -e "  • Admin Console      : ${COLOR_MINT}http://localhost:3000/admin${COLOR_RESET}"
echo -e "  • Registration       : ${COLOR_MINT}http://localhost:3000/register${COLOR_RESET}"
echo -e "  • Backend API Health : ${COLOR_MINT}http://localhost:3000/api/health${COLOR_RESET}"
echo ""
echo -e "${COLOR_YELLOW}  Admin Login Credentials:${COLOR_RESET}"
echo -e "    Email    : ${COLOR_MINT}admin@globalcrestsolutions.com${COLOR_RESET}"
echo -e "    Password : ${COLOR_MINT}ChangeMeOnFirstLogin2026!${COLOR_RESET}"
echo -e "${COLOR_EMERALD}========================================================================${COLOR_RESET}"
