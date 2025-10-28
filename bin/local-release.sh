#!/usr/bin/env bash
set -euo pipefail

# Local install script (macOS) to copy the latest panel files into
# the Adobe CEP user extensions directory for Premiere Pro and After Effects.
# Skips ZXP/signing. Intended for fast local testing.

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# CEP user extension dir (per-user)
CEP_USER_DIR="$HOME/Library/Application Support/Adobe/CEP/extensions"

# Extension bundle/ids from manifests
AE_BUNDLE_ID="com.sync.extension.ae"
AE_PANEL_ID="com.sync.extension.ae"
PPRO_BUNDLE_ID="com.sync.extension.ppro"
PPRO_PANEL_ID="com.sync.extension.ppro"

# Destination dirs
AE_DEST="$CEP_USER_DIR/$AE_PANEL_ID"
PPRO_DEST="$CEP_USER_DIR/$PPRO_PANEL_ID"

OPEN_LOGS="false"
for arg in "$@"; do
  case "$arg" in
    --open-logs)
      OPEN_LOGS="true" ;;
  esac
done

echo "Installing local build to Adobe CEP user extensions (macOS)"
echo "Repo: $REPO_DIR"
echo "CEP dir: $CEP_USER_DIR"

mkdir -p "$CEP_USER_DIR"

# Enable debug mode so unsigned extensions load in dev
enable_debug_mode() {
  local plist_dir="$HOME/Library/Preferences/"
  local plist_base="com.adobe.CSXS."
  # Common CSXS versions used by recent Adobe apps (12-16+)
  for ver in 12 13 14 15 16; do
    local plist="${plist_dir}${plist_base}${ver}.plist"
    # PlayerDebugMode needs to be integer 1 for some hosts; also set LogLevel high
    /usr/bin/defaults write "${plist%*.plist}" PlayerDebugMode -int 1 2>/dev/null || true
    /usr/bin/defaults write "${plist%*.plist}" LogLevel -int 6 2>/dev/null || true
  done
  echo "Enabled PlayerDebugMode=1 and LogLevel=6 in CSXS 12–16"
}

copy_common_files() {
  local dest="$1"
  mkdir -p "$dest"
  # Root files
  rsync -a --delete \
    "$REPO_DIR/index.html" \
    "$dest/"
  # Folders needed by both panels
  rsync -a --delete \
    "$REPO_DIR/ui/" "$dest/ui/"
  rsync -a --delete \
    "$REPO_DIR/lib/" "$dest/lib/" || true
  rsync -a --delete \
    "$REPO_DIR/icons/" "$dest/icons/" || true
  rsync -a --delete \
    "$REPO_DIR/host/" "$dest/host/" || true
  # Bundled Node binaries for local spawn
  rsync -a --delete \
    "$REPO_DIR/bin/" "$dest/bin/" || true
  # Copy .env if it exists
  if [ -f "$REPO_DIR/.env" ]; then
    rsync -a "$REPO_DIR/.env" "$dest/.env"
  fi
}

install_ae() {
  echo "\n→ Installing AE panel"
  local src_dir="$REPO_DIR/extensions/ae-extension"
  local manifest="$src_dir/CSXS/manifest.xml"
  if [ ! -f "$manifest" ]; then
    echo "AE manifest not found at $manifest" >&2
    exit 1
  fi
  mkdir -p "$AE_DEST/CSXS"
  copy_common_files "$AE_DEST"
  rsync -a "$src_dir/CSXS/manifest.xml" "$AE_DEST/CSXS/manifest.xml"
  # Copy local backend (server) with preinstalled deps
  if [ -d "$REPO_DIR/server" ]; then
    rsync -a --delete "$REPO_DIR/server/" "$AE_DEST/server/"
  fi
  # Override host detection with AE-specific file
  if [ -f "$src_dir/ui/host-detection.js" ]; then
    mkdir -p "$AE_DEST/ui"
    rsync -a "$src_dir/ui/host-detection.js" "$AE_DEST/ui/host-detection.js"
  fi
  # Ensure bundled node is executable if present
  { chmod +x "$AE_DEST/bin/darwin-arm64/node" 2>/dev/null || true; }
  { chmod +x "$AE_DEST/bin/darwin-x64/node" 2>/dev/null || true; }
  echo "AE installed to $AE_DEST"
}

install_ppro() {
  echo "\n→ Installing Premiere panel"
  local src_dir="$REPO_DIR/extensions/premiere-extension"
  local manifest="$src_dir/CSXS/manifest.xml"
  if [ ! -f "$manifest" ]; then
    echo "Premiere manifest not found at $manifest" >&2
    exit 1
  fi
  mkdir -p "$PPRO_DEST/CSXS"
  copy_common_files "$PPRO_DEST"
  rsync -a "$src_dir/CSXS/manifest.xml" "$PPRO_DEST/CSXS/manifest.xml"
  # Copy local backend (server) with preinstalled deps
  if [ -d "$REPO_DIR/server" ]; then
    rsync -a --delete "$REPO_DIR/server/" "$PPRO_DEST/server/"
  fi
  # Override host detection with Premiere-specific file
  if [ -f "$src_dir/ui/host-detection.js" ]; then
    mkdir -p "$PPRO_DEST/ui"
    rsync -a "$src_dir/ui/host-detection.js" "$PPRO_DEST/ui/host-detection.js"
  fi
  # Copy export presets (EPR)
  if [ -d "$src_dir/epr" ]; then
    rsync -a --delete "$src_dir/epr/" "$PPRO_DEST/epr/"
  fi
  # Ensure bundled node is executable if present
  { chmod +x "$PPRO_DEST/bin/darwin-arm64/node" 2>/dev/null || true; }
  { chmod +x "$PPRO_DEST/bin/darwin-x64/node" 2>/dev/null || true; }
  echo "Premiere installed to $PPRO_DEST"
}

post_instructions() {
  cat <<EOF

Done.

If the panel doesn't appear:
  - Quit Adobe apps fully, then relaunch
  - Ensure 'Enable Remote Debugging' is on in the host
  - Debug mode was enabled via PlayerDebugMode; if needed, reboot
  - Check CSXS logs: ~/Library/Logs/CSXS or inspect plist: ~/Library/Preferences/com.adobe.CSXS.*.plist

Panel IDs:
  - AE:    $AE_PANEL_ID
  - PPro:  $PPRO_PANEL_ID

Extensions live at:
  $CEP_USER_DIR

EOF
}

enable_debug_mode
install_ae
install_ppro
post_instructions

echo "Local install complete."

if [ "$OPEN_LOGS" = "true" ]; then
  LOG_DIR="$HOME/Library/Logs/CSXS"
  if [ -d "$LOG_DIR" ]; then
    echo "Opening CSXS logs at $LOG_DIR"
    open "$LOG_DIR" || true
  else
    echo "CSXS log directory not found at $LOG_DIR"
  fi
fi


