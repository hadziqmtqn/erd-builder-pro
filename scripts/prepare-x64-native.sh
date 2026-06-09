#!/bin/bash
# ---------------------------------------------------------------------------
# ERD Builder Pro — Prepare x86_64 Native Modules for Cross-Compilation
#
# After building the ARM64 DMG on a macos-latest (ARM64) runner, this script
# replaces the ARM64 better-sqlite3 native addon with the x86_64 version so
# that the second Tauri build (--target x86_64-apple-darwin) bundles the
# correct native binary.
#
# The better-sqlite3 npm package ships prebuilt binaries on GitHub Releases:
#   better-sqlite3-v{VERSION}-node-v{ABI}-darwin-x64.tar.gz
#
# Usage: bash scripts/prepare-x64-native.sh
# ---------------------------------------------------------------------------
set -euo pipefail

echo "=== Preparing native modules for x86_64 cross-compilation ==="

# Check we're in the project root
if [ ! -d "node_modules/better-sqlite3" ]; then
  echo "ERROR: node_modules/better-sqlite3 not found. Run 'npm ci' first."
  exit 1
fi

# Get versions
ABI=$(node -e "console.log(process.versions.modules)")
VERSION=$(node -e "console.log(require('./node_modules/better-sqlite3/package.json').version)")
ARCH=$(node -p "process.arch")

echo "  Node.js ABI:     v${ABI}"
echo "  better-sqlite3:  v${VERSION}"
echo "  Current arch:    ${ARCH}"

# Remove ARM64 build artifacts to force fresh extraction
rm -rf node_modules/better-sqlite3/build

# Download x86_64 prebuilt binary from GitHub Releases
FILENAME="better-sqlite3-v${VERSION}-node-v${ABI}-darwin-x64.tar.gz"
URL="https://github.com/WiseLibs/better-sqlite3/releases/download/v${VERSION}/${FILENAME}"

echo "  Downloading:     ${URL}"
curl -fL "$URL" -o /tmp/bs3-x64.tar.gz || {
  echo "ERROR: Failed to download x86_64 binary."
  echo "  URL: ${URL}"
  echo ""
  echo "Available Node.js binaries for this version:"
  curl -s "https://api.github.com/repos/WiseLibs/better-sqlite3/releases/tags/v${VERSION}" \
    | grep -o '"name": *"[^"]*node[^"]*darwin[^"]*"' | head -10
  exit 1
}

# Extract binary into the better-sqlite3 package directory.
# The tarball contains the binary at: build/Release/better_sqlite3.node
mkdir -p node_modules/better-sqlite3/build/Release
echo "  Extracting binary..."
tar -xzf /tmp/bs3-x64.tar.gz -C node_modules/better-sqlite3

# Verify
echo "  Verifying architecture..."
BINARY="node_modules/better-sqlite3/build/Release/better_sqlite3.node"
if [ ! -f "$BINARY" ]; then
  echo "ERROR: Binary not found after extraction at ${BINARY}"
  ls -la node_modules/better-sqlite3/build/Release/ 2>/dev/null || echo "  (build/Release does not exist)"
  exit 1
fi

file "$BINARY"

# Quick check: ensure it's x86_64
if ! file "$BINARY" | grep -q "x86_64"; then
  echo "WARNING: Binary is not x86_64! Checking for unexpected arch..."
  file "$BINARY"
fi

echo "=== x86_64 native modules ready! ==="
