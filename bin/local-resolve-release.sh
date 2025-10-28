#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PLUGIN_DIR="/Library/Application Support/Blackmagic Design/DaVinci Resolve/Workflow Integration Plugins/sync.resolve"

mkdir -p "$PLUGIN_DIR"

rsync -a --delete "$REPO_DIR/.resolve-workflow/" "$PLUGIN_DIR/"

find "$PLUGIN_DIR/static/bin" -type f -name 'node*' -exec chmod +x {} + 2>/dev/null || true
chmod +x "$PLUGIN_DIR/backend.js"

# Ensure manifest uses XML format Resolve expects
rm -f "$PLUGIN_DIR/manifest.json"
cp "$REPO_DIR/.resolve-workflow/manifest.xml" "$PLUGIN_DIR/manifest.xml"

cat <<MSG
Installed Resolve integration to:
  $PLUGIN_DIR

Restart Resolve to load the sync. workflow panel.
MSG
