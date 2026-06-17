#!/usr/bin/env bash
#
# create-dmg.sh — Reliable DMG creation for Tauri apps
#
# Usage:
#   create-dmg.sh <app-bundle-path> <output-dmg-path> [--volicon icon.icns]
#
# Example:
#   create-dmg.sh "target/release/bundle/macos/MyApp.app" "MyApp_1.0.0_aarch64.dmg"
#
# This is an alternative to Tauri's built-in DMG bundler (bundle_dmg.sh / create-dmg fork)
# which is known to fail on CI (https://github.com/tauri-apps/tauri/issues/3055).

set -euo pipefail

# --- Colors for output ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*" >&2; }

# --- Argument parsing ---
APP_BUNDLE=""
DMG_OUTPUT=""
VOLUME_ICON=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --volicon)
      VOLUME_ICON="$2"
      shift 2
      ;;
    -h|--help)
      echo "Usage: $0 <app-bundle> <output-dmg> [--volicon icon.icns]"
      exit 0
      ;;
    *)
      if [[ -z "$APP_BUNDLE" ]]; then
        APP_BUNDLE="$1"
      elif [[ -z "$DMG_OUTPUT" ]]; then
        DMG_OUTPUT="$1"
      else
        error "Unexpected argument: $1"
        exit 1
      fi
      shift
      ;;
  esac
done

# --- Validation ---
if [[ -z "$APP_BUNDLE" ]] || [[ -z "$DMG_OUTPUT" ]]; then
  error "Usage: $0 <app-bundle> <output-dmg> [--volicon icon.icns]"
  exit 1
fi

if [[ ! -d "$APP_BUNDLE" ]]; then
  error "App bundle not found: $APP_BUNDLE"
  exit 1
fi

if [[ -n "$VOLUME_ICON" ]] && [[ ! -f "$VOLUME_ICON" ]]; then
  error "Volume icon not found: $VOLUME_ICON"
  exit 1
fi

# --- Paths ---
APP_BUNDLE="$(cd "$(dirname "$APP_BUNDLE")" && pwd)/$(basename "$APP_BUNDLE")"
DMG_OUTPUT="$(cd "$(dirname "$DMG_OUTPUT")" && pwd)/$(basename "$DMG_OUTPUT")" 2>/dev/null || DMG_OUTPUT="$(pwd)/$(basename "$DMG_OUTPUT")"

APP_NAME=$(basename "$APP_BUNDLE" .app)
DMG_NAME=$(basename "$DMG_OUTPUT" .dmg)
VOLUME_NAME="$APP_NAME"

TEMP_DIR=$(mktemp -d -t create-dmg)
TEMP_DMG=$(mktemp -u -t temp-dmg).dmg
STAGING_DIR="$TEMP_DIR/staging"

cleanup() {
  if [[ -d "$TEMP_DIR" ]]; then
    rm -rf "$TEMP_DIR"
  fi
  if [[ -f "$TEMP_DMG" ]]; then
    rm -f "$TEMP_DMG"
  fi
}
trap cleanup EXIT

mkdir -p "$STAGING_DIR"

# --- Stage the content ---
info "Copying $APP_NAME.app..."
ditto "$APP_BUNDLE" "$STAGING_DIR/$APP_NAME.app"

info "Creating /Applications symlink..."
ln -s /Applications "$STAGING_DIR/Applications"

# Volume icon
if [[ -n "$VOLUME_ICON" ]]; then
  info "Setting volume icon..."
  cp "$VOLUME_ICON" "$STAGING_DIR/.VolumeIcon.icns"
  # SetFile -c icnC may not be available; try it but don't fail
  if command -v SetFile &>/dev/null; then
    SetFile -c icnC "$STAGING_DIR/.VolumeIcon.icns" || warn "SetFile failed (non-critical)"
  else
    warn "SetFile not found; volume icon visual attribute not set (non-critical)"
  fi
fi

# --- Calculate DMG size ---
info "Calculating disk image size..."
STAGING_SIZE=$(du -sk "$STAGING_DIR" | awk '{print $1}')
# Add 50% overhead for filesystem metadata + free space
DMG_SIZE_MB=$(( (STAGING_SIZE * 3 / 2) / 1024 + 50 ))

# --- Create raw DMG ---
info "Creating temporary disk image (${DMG_SIZE_MB}MB)..."
hdiutil create \
  -srcfolder "$STAGING_DIR" \
  -volname "$VOLUME_NAME" \
  -fs HFS+ \
  -format UDRW \
  -size "${DMG_SIZE_MB}m" \
  "$TEMP_DMG"

# --- Mount and set icon visibility ---
info "Mounting disk image..."
MOUNT_INFO=$(hdiutil attach -readwrite -noverify -noautoopen -nobrowse "$TEMP_DMG" 2>/dev/null)
DEV_NAME=$(echo "$MOUNT_INFO" | grep "^/dev/" | sed '1q' | awk '{print $1}')
MOUNT_DIR=$(echo "$MOUNT_INFO" | grep "/Volumes/" | awk '{$1=""; $2=""; print $0}' | xargs)

if [[ -z "$DEV_NAME" ]] || [[ -z "$MOUNT_DIR" ]]; then
  error "Failed to mount disk image"
  exit 1
fi

info "Mounted at: $MOUNT_DIR"

# Enable custom icon (if we set .VolumeIcon.icns)
if [[ -f "$STAGING_DIR/.VolumeIcon.icns" ]]; then
  # Use SetFile if available (preferred) or bless if not
  if command -v SetFile &>/dev/null; then
    SetFile -a C "$MOUNT_DIR" || warn "SetFile -a C failed (non-critical)"
  else
    warn "SetFile not found; skipping icon activation"
  fi
fi

# Hide the background icon file
if [[ -d "$MOUNT_DIR/.background" ]]; then
  if command -v SetFile &>/dev/null; then
    SetFile -a V "$MOUNT_DIR/.background" || true
  fi
fi

# --- Bless for Finder (sets the background, icon size, etc. if we used AppleScript) ---
# Skip blessing in CI since we don't have Finder access
if [[ "${CI:-}" != "true" ]]; then
  info "Blessing disk image for Finder..."
  bless --folder "$MOUNT_DIR" --openfolder "$MOUNT_DIR" 2>/dev/null || true
fi

# --- Detach ---
info "Detaching disk image..."
hdiutil detach "$DEV_NAME" -quiet 2>/dev/null || {
  warn "detach failed, retrying after sleep..."
  sleep 2
  hdiutil detach "$DEV_NAME" -force -quiet 2>/dev/null || warn "force detach also failed"
}

# --- Convert to compressed read-only DMG ---
info "Compressing disk image..."
if [[ -f "$DMG_OUTPUT" ]]; then
  rm -f "$DMG_OUTPUT"
fi

hdiutil convert \
  -format UDZO \
  -imagekey zlib-level=9 \
  -o "$DMG_OUTPUT" \
  "$TEMP_DMG"

# --- Finalize ---
FINAL_SIZE=$(du -h "$DMG_OUTPUT" | awk '{print $1}')
info "DMG created successfully: $DMG_OUTPUT ($FINAL_SIZE)"

# Output the DMG path for use in CI
echo "DMG_PATH=$DMG_OUTPUT"
