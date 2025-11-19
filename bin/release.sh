#!/bin/bash
# Release script for UXP extension
# Builds and packages the extension for release

set -e

# Get version from package.json
VERSION=$(node -p "require('./package.json').version")

echo "Building UXP extension v${VERSION}..."

# Build UXP extension
echo "Building UXP extension..."
npm run build:uxp

# Build Resolve plugin
echo "Building Resolve plugin..."
npm run build:davinci

# Create release directory
mkdir -p dist/release

# Detect OS
OS_NAME="unknown"
if [[ "$OSTYPE" == "darwin"* ]]; then
  OS_NAME="macos"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
  OS_NAME="linux"
elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
  OS_NAME="windows"
fi

# Package UXP extension
echo "Packaging UXP extension..."
cd dist/uxp
zip -r "../release/uxp-sync-extension-v${VERSION}-${OS_NAME}.zip" . -x "*.map" "*.log" 2>/dev/null || \
  (cd .. && powershell -Command "Compress-Archive -Path uxp -DestinationPath release/uxp-sync-extension-v${VERSION}-${OS_NAME}.zip -Force" 2>/dev/null || echo "Packaging failed")
cd ../..

# Package Resolve plugin
echo "Packaging Resolve plugin..."
cd dist
zip -r "release/davinci-sync-extension-v${VERSION}-${OS_NAME}.zip" resolve -x "*.map" "*.log" 2>/dev/null || \
  (powershell -Command "Compress-Archive -Path resolve -DestinationPath release/davinci-sync-extension-v${VERSION}-${OS_NAME}.zip -Force" 2>/dev/null || echo "Packaging failed")
cd ..

echo ""
echo "✅ Release packages created:"
echo "  - dist/release/uxp-sync-extension-v${VERSION}-${OS_NAME}.zip"
echo "  - dist/release/davinci-sync-extension-v${VERSION}-${OS_NAME}.zip"
echo ""
echo "To create a GitHub release:"
echo "  1. git tag v${VERSION}"
echo "  2. git push origin v${VERSION}"
echo ""
