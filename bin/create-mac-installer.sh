#!/usr/bin/env bash
set -euo pipefail

# Create Mac DMG installer for DaVinci Resolve plugin
# Usage: ./bin/create-mac-installer.sh [version]
# Example: ./bin/create-mac-installer.sh 0.9.44

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="${1:-}"
if [ -z "$VERSION" ]; then
  VERSION=$(node -p "require('./package.json').version")
fi

echo "Creating Mac DMG installer for version $VERSION..."

# Paths
RESOLVE_ZIP_PATH="$REPO_DIR/dist/sync-resolve-plugin-v${VERSION}.zip"
DMG_NAME="sync-resolve-installer-v${VERSION}"
DMG_PATH="$REPO_DIR/dist/${DMG_NAME}.dmg"
TEMP_DMG_DIR="$REPO_DIR/dist/.dmg-build"
PLUGIN_DIR="$TEMP_DMG_DIR/sync.resolve"
TARGET_DIR="/Library/Application Support/Blackmagic Design/DaVinci Resolve/Workflow Integration Plugins"

# Check if ZIP exists
if [ ! -f "$RESOLVE_ZIP_PATH" ]; then
  echo "Error: Resolve ZIP file not found: $RESOLVE_ZIP_PATH"
  echo "Please run 'npm run build:davinci' first"
  exit 1
fi

# Clean up previous build
rm -rf "$TEMP_DMG_DIR"
rm -f "$DMG_PATH"

# Create temp directory structure
mkdir -p "$TEMP_DMG_DIR"

# Extract ZIP to temp directory
echo "Extracting plugin..."
unzip -q "$RESOLVE_ZIP_PATH" -d "$TEMP_DMG_DIR"
# ZIP contains a 'resolve' folder, rename to 'sync.resolve'
if [ -d "$TEMP_DMG_DIR/resolve" ]; then
  mv "$TEMP_DMG_DIR/resolve" "$PLUGIN_DIR"
else
  echo "Warning: Expected 'resolve' folder not found in ZIP"
fi

# Create README with installation instructions
cat > "$TEMP_DMG_DIR/README.txt" << EOF
sync. DaVinci Resolve Plugin - Installation Instructions
========================================================

INSTALLATION (Drag & Drop):
1. Double-click "Install sync.resolve.command" to install automatically
   OR
2. Drag the "sync.resolve" folder to the "Install Location" alias below

MANUAL INSTALLATION:
1. Copy the "sync.resolve" folder to:
   $TARGET_DIR
2. You may need to enter your administrator password

AFTER INSTALLATION:
1. Restart DaVinci Resolve completely
2. Find the plugin in: Workspace > Workflow Integration > sync.

TROUBLESHOOTING:
- Ensure DaVinci Resolve is closed before installing
- The plugin must be installed to /Library (system), not ~/Library (user)
- Visit https://sync.so for support

Version: $VERSION
EOF

# Create Applications symlink (standard DMG practice)
ln -s /Applications "$TEMP_DMG_DIR/Applications"

# Create Install Location alias (opens Finder to target directory)
# Note: We can't create a true Finder alias from command line easily,
# so we'll create a script instead
cat > "$TEMP_DMG_DIR/Install sync.resolve.command" << 'INSTALLSCRIPT'
#!/bin/bash
# sync. DaVinci Resolve Plugin Installer Script

TARGET_DIR="/Library/Application Support/Blackmagic Design/DaVinci Resolve/Workflow Integration Plugins"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_SOURCE="$SCRIPT_DIR/sync.resolve"
PLUGIN_TARGET="$TARGET_DIR/sync.resolve"

echo "sync. DaVinci Resolve Plugin Installer"
echo "======================================="
echo ""

# Check for admin privileges
if [ "$EUID" -ne 0 ]; then
    echo "This installer requires administrator privileges."
    echo "You will be prompted for your password."
    echo ""
    # Use sudo to run the copy
    sudo bash -c "
        mkdir -p \"$TARGET_DIR\"
        if [ -d \"$PLUGIN_TARGET\" ]; then
            rm -rf \"$PLUGIN_TARGET\"
        fi
        cp -R \"$PLUGIN_SOURCE\" \"$PLUGIN_TARGET\"
        echo '✅ Installation complete!'
    "
else
    mkdir -p "$TARGET_DIR"
    if [ -d "$PLUGIN_TARGET" ]; then
        rm -rf "$PLUGIN_TARGET"
    fi
    cp -R "$PLUGIN_SOURCE" "$PLUGIN_TARGET"
    echo "✅ Installation complete!"
fi

echo ""
echo "Next steps:"
echo "  1. Restart DaVinci Resolve"
echo "  2. Find the plugin in: Workspace > Workflow Integration > sync."
echo ""
read -p "Press Enter to exit..."
INSTALLSCRIPT

chmod +x "$TEMP_DMG_DIR/Install sync.resolve.command"

# Create Install Location folder with instructions
mkdir -p "$TEMP_DMG_DIR/Install Location"
cat > "$TEMP_DMG_DIR/Install Location/README.txt" << EOF
Install Location
================

Drag the "sync.resolve" folder here to install.

Target: $TARGET_DIR

Or double-click "Install sync.resolve.command" in the main window for automatic installation.
EOF

# Create DMG using hdiutil
echo "Creating DMG..."
hdiutil create -volname "sync. Resolve Plugin Installer" \
  -srcfolder "$TEMP_DMG_DIR" \
  -ov \
  -format UDZO \
  -fs HFS+ \
  "$DMG_PATH"

# Clean up temp directory
rm -rf "$TEMP_DMG_DIR"

# Get file size
if command -v stat >/dev/null 2>&1; then
  DMG_SIZE=$(stat -f%z "$DMG_PATH" 2>/dev/null || stat -c%s "$DMG_PATH" 2>/dev/null)
else
  DMG_SIZE=$(wc -c < "$DMG_PATH" 2>/dev/null || echo "0")
fi
DMG_SIZE_MB=$(awk "BEGIN {printf \"%.2f\", $DMG_SIZE / 1024 / 1024}" 2>/dev/null || echo "0.00")

echo ""
echo "✅ Mac DMG installer created: $DMG_PATH (${DMG_SIZE_MB} MB)"
echo ""
echo "The DMG contains:"
echo "  - sync.resolve folder (plugin)"
echo "  - README.txt (installation instructions)"
echo "  - Applications symlink"
echo "  - Install Location folder"
echo ""
echo "Users can:"
echo "  1. Open the DMG"
echo "  2. Drag sync.resolve to Install Location (or manually copy to $TARGET_DIR)"
echo "  3. Restart DaVinci Resolve"
