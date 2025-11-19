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

# Package UXP extension
echo "Packaging UXP extension..."
cd dist/uxp
zip -r "../release/uxp-sync-extension-v${VERSION}.zip" . -x "*.map" "*.log"
cd ../..

# Package Resolve plugin
echo "Packaging Resolve plugin..."
cd dist
zip -r "release/davinci-sync-extension-v${VERSION}.zip" resolve -x "*.map" "*.log"
cd ..

echo ""
echo "✅ Release packages created:"
echo "  - dist/release/uxp-sync-extension-v${VERSION}.zip"
echo "  - dist/release/davinci-sync-extension-v${VERSION}.zip"
echo ""
echo "To create a GitHub release:"
echo "  1. git tag v${VERSION}"
echo "  2. git push origin v${VERSION}"
echo ""
