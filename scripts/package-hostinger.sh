#!/usr/bin/env bash
# ==============================================================================
# GCS CONNECT — Hostinger Manual Deployment Packager
# Builds Next.js frontend, compiles unified server.js, and creates a Hostinger Web App upload archive
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

echo "=== [1/3] Building GCS CONNECT for Production ==="
npm run build

echo "=== [2/3] Assembling Hostinger Deployment Package ==="
for required in server.js package.json package-lock.json next.config.mjs .next prisma public; do
  if [ ! -e "$required" ]; then
    echo "[ERROR] Required build output is missing: $required" >&2
    exit 1
  fi
done

mkdir -p dist
PACKAGE="$PROJECT_ROOT/dist/hostinger-upload.zip"
rm -f "$PACKAGE"
zip -qr "$PACKAGE" \
  server.js server.ts package.json package-lock.json next.config.mjs \
  postcss.config.js tailwind.config.js tsconfig.json next-env.d.ts \
  .next prisma public src scripts/build-server.js \
  storage/encrypted_media/.gitkeep storage/vault/.gitkeep .env.example \
  -x "src/**/*.test.ts" "src/**/*.test.tsx"

echo "=== [3/3] Package Complete ==="
echo "Artifact: $PACKAGE ($(du -h "$PACKAGE" | cut -f1))"
echo "Upload this archive through Hostinger hPanel: Websites > Create site > Web App > Upload your website files."
