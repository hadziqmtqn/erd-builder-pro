#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

echo "=== Building erdbpro CLI package ==="

# 1. Generate Prisma client for SQLite
echo "[1/5] Prisma client (SQLite)..."
rm -rf node_modules/.prisma/client
npx prisma generate --schema=prisma/schema.sqlite.prisma

# 2. Build full server bundle (all routes)
echo "[2/5] Server bundle (esbuild)..."
node scripts/build-server.js

# 3. Build frontend (same-origin API — VITE_API_URL empty so it calls localhost)
echo "[3/5] Frontend (Vite)..."
rm -rf dist
VITE_API_URL="" npx vite build

# 4. Assemble CLI package
echo "[4/5] Assembling cli/..."
rm -rf cli/dist-server cli/dist cli/prisma
cp -r dist-server cli/dist-server
cp -r dist cli/dist
mkdir -p cli/prisma
cp prisma/schema.sqlite.prisma cli/prisma/
cp dist-server/schema.sql cli/prisma/ 2>/dev/null || echo "  (schema.sql will be used from dist-server)"

# Ensure better-sqlite3 binary is compatible with local Node.js
# The bundled binary may have been compiled for a different Node version (e.g., Tauri Node 22 vs host Node 25).
# Rebuild against the current Node.js ABI using the prebuilt binary if available.
echo "[4.5/5] Rebuilding better-sqlite3 for local Node.js..."
if [ -d "cli/dist-server/node_modules/better-sqlite3" ]; then
  (cd cli/dist-server/node_modules/better-sqlite3 && npx --yes prebuild-install 2>/dev/null) || \
  npm_config_build_from_source=true npm rebuild better-sqlite3 --prefix cli/dist-server 2>/dev/null || \
  echo "  ⚠️  better-sqlite3 rebuild failed — use Node 22 LTS or PostgreSQL mode"
fi

# Compile menubar tray helper (macOS only, graceful if swiftc not available)
echo "[4.6/5] Compiling menubar tray..."
if command -v swiftc &>/dev/null; then
  cp public/favicon.svg cli/menubar/icon.svg 2>/dev/null || true
  swiftc -o cli/menubar/erdbpro-tray cli/menubar/ERDBProTray.swift 2>/dev/null && \
  chmod +x cli/menubar/erdbpro-tray && \
  echo "  ✅ Menubar tray compiled" || \
  echo "  ⚠️  Menubar tray compile skipped (optional)"
else
  echo "  ⚠️  swiftc not found — skipping menubar tray (optional)"
fi

# 5. Version sync
VERSION=$(node -p "require('./package.json').version")
node -e "
  const p = require('./cli/package.json');
  p.version = '$VERSION';
  require('fs').writeFileSync('./cli/package.json', JSON.stringify(p, null, 2) + '\n');
"

echo "=== Build complete ==="
echo "Package ready: cli/"
echo "Test: node cli/bin/erdbpro.js start --port 3101 --open"
