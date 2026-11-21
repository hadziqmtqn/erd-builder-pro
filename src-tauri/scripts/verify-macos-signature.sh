#!/usr/bin/env bash
#
# verify-macos-signature.sh — fail the build when a macOS .app is not signed as a whole bundle.
#
# Usage:
#   verify-macos-signature.sh <app-bundle-path>
#
# Without a bundle signature, only the main executable carries the linker's ad-hoc signature,
# and Gatekeeper rejects a downloaded app as "damaged" with no "Open Anyway" (BUG-092).

set -euo pipefail

APP_BUNDLE="${1:-}"
if [[ -z "$APP_BUNDLE" ]] || [[ ! -d "$APP_BUNDLE" ]]; then
  echo "App bundle not found: ${APP_BUNDLE:-<none>}" >&2
  exit 1
fi

if [[ ! -f "$APP_BUNDLE/Contents/_CodeSignature/CodeResources" ]]; then
  echo "Missing Contents/_CodeSignature/CodeResources: $APP_BUNDLE is not signed as a bundle" >&2
  exit 1
fi

codesign --verify --deep --strict --verbose=2 "$APP_BUNDLE"
codesign -dv "$APP_BUNDLE" 2>&1 | grep -E '^(Identifier|Format|CodeDirectory|Signature|TeamIdentifier)='
