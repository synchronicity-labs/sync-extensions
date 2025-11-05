#!/usr/bin/env bash
set -euo pipefail

# Release script for sync-extensions extension
# Usage: ./bin/release.sh [version] [message]
# Example: ./bin/release.sh 0.9.45 "Fixed ZXP signing"

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="${1:-}"
MESSAGE="${2:-Release $VERSION}"

if [ -z "$VERSION" ]; then
  echo "Usage: $0 <version> [message]"
  echo "Example: $0 0.9.45 'Fixed ZXP signing'"
  exit 1
fi

# Validate version format (semantic versioning)
if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Error: Version must be in format X.Y.Z (e.g., 0.9.45)"
  exit 1
fi

echo "Releasing version $VERSION..."

# Check for .env file
if [ ! -f "$REPO_DIR/src/server/.env" ]; then
  echo "Error: src/server/.env file not found"
  echo "Please create src/server/.env with ZXP_PASSWORD, R2, and PostHog credentials"
  exit 1
fi

# Update package.json version
echo "Updating package.json version..."
cd "$REPO_DIR"
npm version "$VERSION" --no-git-tag-version

# Create .env file without ZXP_PASSWORD for the ZXP
echo "Creating .env file for ZXP (without ZXP_PASSWORD)..."
# Create sanitized .env in dist/cep/server/ so it gets included in the ZXP
mkdir -p "$REPO_DIR/dist/cep/server"
grep -v "^ZXP_PASSWORD=" "$REPO_DIR/src/server/.env" > "$REPO_DIR/dist/cep/server/.env" || true
echo "✅ Created sanitized .env file in dist/cep/server/.env"

# Build ZXP locally (uses ZXP_PASSWORD from src/server/.env for signing)
# The sanitized .env in dist/cep/server/ will be included in the ZXP
echo "Building ZXP locally..."
npm run zxp

# Verify ZXP
echo "Verifying ZXP..."
node scripts/verify-zxp.mjs

# Generate checksums
echo "Generating checksums..."
cd dist/zxp
sha256sum *.zxp > checksums.txt
cd "$REPO_DIR"

# Commit changes
echo "Committing changes..."
git add package.json package-lock.json dist/zxp/com.sync.extension.zxp dist/zxp/checksums.txt
git commit -m "Bump version to $VERSION" || echo "No changes to commit"

# Create git tag
echo "Creating git tag..."
git tag -a "v$VERSION" -m "$MESSAGE" || echo "Tag exists; continuing"

# Push to GitHub
echo "Pushing to GitHub..."
git push origin HEAD || true
git push origin "v$VERSION" || true

echo ""
echo "✅ Release $VERSION completed!"
echo "📦 ZXP built locally: dist/zxp/com.sync.extension.zxp"
echo "🚀 GitHub Actions will upload ZXP to releases on tag push"
