#!/bin/bash
# Build script for Xcode project
# Copies UI files and sets up the project structure

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
FCPX_BUILD_DIR="$PROJECT_ROOT/dist/fcpx"
XCODE_DIR="$SCRIPT_DIR"

echo "🔨 Setting up Xcode project for FCPX workflow extension..."
echo "   Project root: $PROJECT_ROOT"
echo "   FCPX build dir: $FCPX_BUILD_DIR"

# Ensure dist/fcpx exists
if [ ! -d "$FCPX_BUILD_DIR" ]; then
    echo "❌ Error: dist/fcpx not found at $FCPX_BUILD_DIR"
    echo "   Run 'FCPX_BUILD=true npm run build' first"
    exit 1
fi

# Create Resources directory in extension
EXT_RESOURCES="$XCODE_DIR/sync-fcpx-extension/Resources"
mkdir -p "$EXT_RESOURCES/static"

# Copy UI files
echo "Copying UI files..."
cp -R "$FCPX_BUILD_DIR/static"/* "$EXT_RESOURCES/static/"

echo "✅ Xcode project files ready"
echo ""
echo "📋 Next steps:"
echo "1. Open sync-fcpx-extension.xcodeproj in Xcode"
echo "2. Build the project (Cmd+B)"
echo "3. Run the app to install to /Applications"
echo "4. Launch the app once to register the extension"
echo "5. Open Final Cut Pro and check Window > Extensions"

