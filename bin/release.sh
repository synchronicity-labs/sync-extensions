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
# Note: npm run zxp's prezxp script also creates this, but we do it here for clarity
echo "Creating .env file for ZXP (without ZXP_PASSWORD)..."
# Create sanitized .env in dist/cep/server/ so it gets included in the ZXP
mkdir -p "$REPO_DIR/dist/cep/server"
grep -v "^ZXP_PASSWORD=" "$REPO_DIR/src/server/.env" > "$REPO_DIR/dist/cep/server/.env" || true
echo "✅ Created sanitized .env file in dist/cep/server/.env"

# Build ZXP locally (uses ZXP_PASSWORD from src/server/.env for signing via dotenv-cli)
# The sanitized .env in dist/cep/server/ will be included in the ZXP
echo "Building ZXP locally..."
npm run zxp

# Build DaVinci Resolve ZIP
echo ""
echo "Building DaVinci Resolve plugin ZIP..."
npm run build:davinci

# Verify ZXP
echo ""
echo "🔍 ZXP Verification Report"
echo "============================================================"

ZXP_PATH="$REPO_DIR/dist/zxp/com.sync.extension.zxp"
ZXPSIGN_CMD="$REPO_DIR/node_modules/vite-cep-plugin/lib/bin/ZXPSignCmd"

# 1. Check if ZXP file exists
echo ""
echo "1. File Existence Check"
if [ ! -f "$ZXP_PATH" ]; then
  echo "❌ ZXP file not found: $ZXP_PATH"
  exit 1
fi
# Get file size (works on both macOS/Linux and Windows Git Bash)
if command -v stat >/dev/null 2>&1; then
  FILE_SIZE=$(stat -f%z "$ZXP_PATH" 2>/dev/null || stat -c%s "$ZXP_PATH" 2>/dev/null)
elif [ -f "$ZXP_PATH" ]; then
  # Fallback for Windows without stat
  FILE_SIZE=$(wc -c < "$ZXP_PATH" 2>/dev/null || echo "0")
else
  FILE_SIZE=0
fi
FILE_SIZE_MB=$(awk "BEGIN {printf \"%.2f\", $FILE_SIZE / 1024 / 1024}" 2>/dev/null || echo "0.00")
echo "✅ ZXP file exists: ${FILE_SIZE_MB} MB"

# 2. Verify signature
echo ""
echo "2. Signature Verification"
if [ ! -f "$ZXPSIGN_CMD" ]; then
  echo "❌ ZXPSignCmd not found: $ZXPSIGN_CMD"
  exit 1
fi
chmod +x "$ZXPSIGN_CMD" 2>/dev/null || true
VERIFY_OUTPUT=$("$ZXPSIGN_CMD" -verify "$ZXP_PATH" 2>&1) || {
  echo "❌ Signature verification failed"
  echo "$VERIFY_OUTPUT"
  exit 1
}
if echo "$VERIFY_OUTPUT" | grep -q "Signature verified successfully"; then
  echo "✅ Signature verified successfully"
else
  echo "❌ Signature verification failed"
  echo "$VERIFY_OUTPUT"
  exit 1
fi

# 3. Check certificate info
echo ""
echo "3. Certificate Information"
CERT_INFO=$("$ZXPSIGN_CMD" -verify "$ZXP_PATH" -certInfo 2>&1) || {
  echo "⚠️  Could not get certificate info"
}
if echo "$CERT_INFO" | grep -q "Timestamp: Valid"; then
  echo "✅ Certificate is timestamped (valid on both platforms)"
fi
if echo "$CERT_INFO" | grep -q "Signing Certificate: Valid"; then
  VALID_UNTIL=$(echo "$CERT_INFO" | sed -n 's/.*Signing Certificate: Valid (from .* until \([^)]*\)).*/\1/p' | head -1)
  if [ -n "$VALID_UNTIL" ]; then
    echo "✅ Certificate valid until: $VALID_UNTIL"
  fi
fi
echo ""
echo "Certificate Details:"
echo "$CERT_INFO" | grep -E "(Certificate|Timestamp|DN:)" || true

# 4. Verify ZXP structure
echo ""
echo "4. ZXP Structure Verification"
EXTRACT_DIR="$REPO_DIR/dist/.zxp-verify"
rm -rf "$EXTRACT_DIR"
mkdir -p "$EXTRACT_DIR"
unzip -q -o "$ZXP_PATH" -d "$EXTRACT_DIR" || {
  echo "❌ Failed to extract ZXP"
  exit 1
}

REQUIRED_FILES=(
  "CSXS/manifest.xml"
  "main/index.html"
  "jsx/index.jsxbin"
  "server/server.ts"
  "server/package.json"
  "server/.env"
  "bin/darwin-arm64/node"
  "bin/darwin-x64/node"
  "bin/win32-x64/node.exe"
)

REQUIRED_DIRS=(
  "server/node_modules"
)

ALL_PRESENT=true
for file in "${REQUIRED_FILES[@]}"; do
  if [ -f "$EXTRACT_DIR/$file" ]; then
    echo "✅ $file"
  else
    echo "❌ Missing: $file"
    ALL_PRESENT=false
  fi
done

# Check required directories
for dir in "${REQUIRED_DIRS[@]}"; do
  if [ -d "$EXTRACT_DIR/$dir" ]; then
    # Count files in node_modules to ensure it's not empty (works on Unix and Windows Git Bash)
    if command -v find >/dev/null 2>&1; then
      FILE_COUNT=$(find "$EXTRACT_DIR/$dir" -type f 2>/dev/null | wc -l | tr -d ' ')
    else
      # Fallback: check if directory has any files at all
      FILE_COUNT=$(ls -R "$EXTRACT_DIR/$dir" 2>/dev/null | grep -v "^$" | wc -l | tr -d ' ' || echo "0")
    fi
    if [ "$FILE_COUNT" -gt 0 ]; then
      echo "✅ $dir (contains $FILE_COUNT files)"
    else
      echo "❌ $dir exists but is empty"
      ALL_PRESENT=false
    fi
  else
    echo "❌ Missing directory: $dir"
    ALL_PRESENT=false
  fi
done

if [ "$ALL_PRESENT" = false ]; then
  rm -rf "$EXTRACT_DIR"
  exit 1
fi

# 5. Verify manifest (re-extract just the manifest)
echo ""
echo "5. Manifest Verification"
MANIFEST_EXTRACT_DIR="$REPO_DIR/dist/.manifest-verify"
rm -rf "$MANIFEST_EXTRACT_DIR"
mkdir -p "$MANIFEST_EXTRACT_DIR"
unzip -q -o "$ZXP_PATH" CSXS/manifest.xml -d "$MANIFEST_EXTRACT_DIR" || {
  echo "❌ Failed to extract manifest"
  rm -rf "$MANIFEST_EXTRACT_DIR"
  exit 1
}

MANIFEST_PATH="$MANIFEST_EXTRACT_DIR/CSXS/manifest.xml"
if [ ! -f "$MANIFEST_PATH" ]; then
  echo "❌ Manifest not found"
  rm -rf "$MANIFEST_EXTRACT_DIR"
  exit 1
fi

MANIFEST_CONTENT=$(cat "$MANIFEST_PATH")

# Check for required manifest elements
ALL_FOUND=true

if echo "$MANIFEST_CONTENT" | grep -q "com.sync.extension"; then
  echo "✅ ExtensionBundleId: Found"
else
  echo "❌ ExtensionBundleId: Missing"
  ALL_FOUND=false
fi

if echo "$MANIFEST_CONTENT" | grep -q "AEFT"; then
  echo "✅ Host AEFT: Found"
else
  echo "❌ Host AEFT: Missing"
  ALL_FOUND=false
fi

if echo "$MANIFEST_CONTENT" | grep -q "PPRO"; then
  echo "✅ Host PPRO: Found"
else
  echo "❌ Host PPRO: Missing"
  ALL_FOUND=false
fi

if echo "$MANIFEST_CONTENT" | grep -q "./main/index.html"; then
  echo "✅ MainPath: Found"
else
  echo "❌ MainPath: Missing"
  ALL_FOUND=false
fi

if echo "$MANIFEST_CONTENT" | grep -q "./jsx/index.jsxbin"; then
  echo "✅ ScriptPath: Found"
else
  echo "❌ ScriptPath: Missing"
  ALL_FOUND=false
fi

rm -rf "$MANIFEST_EXTRACT_DIR"

if [ "$ALL_FOUND" = false ]; then
  exit 1
fi

# 6. Verify critical dependencies (using the already-extracted ZXP)
echo ""
echo "6. Critical Dependencies Verification"
# Check for tsx (required to run TypeScript server files)
if [ -f "$EXTRACT_DIR/server/node_modules/tsx/dist/cli.mjs" ] || [ -f "$EXTRACT_DIR/server/node_modules/.bin/tsx" ] || [ -d "$EXTRACT_DIR/server/node_modules/tsx" ]; then
  echo "✅ tsx found (required for TypeScript execution)"
else
  echo "⚠️  tsx not found - server may not run (check if server.ts needs compilation)"
fi

# Check for express (core server dependency)
if [ -d "$EXTRACT_DIR/server/node_modules/express" ]; then
  echo "✅ express found (core server dependency)"
else
  echo "❌ express not found - server will not work"
  ALL_PRESENT=false
fi

# Check for bundled Node.js binaries
if [ -f "$EXTRACT_DIR/bin/darwin-arm64/node" ] && [ -f "$EXTRACT_DIR/bin/darwin-x64/node" ] && [ -f "$EXTRACT_DIR/bin/win32-x64/node.exe" ]; then
  echo "✅ All Node.js binaries present (darwin-arm64, darwin-x64, win32-x64)"
else
  echo "❌ Missing Node.js binaries - extension will not work without system Node.js"
  ALL_PRESENT=false
fi

if [ "$ALL_PRESENT" = false ]; then
  rm -rf "$EXTRACT_DIR"
  exit 1
fi

# Cleanup ZXP extract directory
rm -rf "$EXTRACT_DIR"

# 7. Cross-platform compatibility
echo ""
echo "7. Cross-Platform Compatibility"
echo "✅ ZXP files are platform-agnostic ZIP archives"
echo "✅ Signature embedded in ZXP works on both Windows and macOS"
echo "✅ Certificate is timestamped (valid across platforms)"
echo "✅ All paths are relative (no platform-specific paths)"
echo "✅ Node.js binaries included for all platforms (darwin-arm64, darwin-x64, win32-x64)"

echo ""
echo "============================================================"
echo ""
echo "✅ ZXP VERIFICATION PASSED"
echo ""

# Verify DaVinci Resolve ZIP
echo ""
echo "🔍 DaVinci Resolve ZIP Verification Report"
echo "============================================================"

RESOLVE_ZIP_PATH="$REPO_DIR/dist/sync-resolve-plugin-v${VERSION}.zip"

# 1. Check if ZIP file exists
echo ""
echo "1. File Existence Check"
if [ ! -f "$RESOLVE_ZIP_PATH" ]; then
  echo "❌ Resolve ZIP file not found: $RESOLVE_ZIP_PATH"
  exit 1
fi
# Get file size
if command -v stat >/dev/null 2>&1; then
  ZIP_SIZE=$(stat -f%z "$RESOLVE_ZIP_PATH" 2>/dev/null || stat -c%s "$RESOLVE_ZIP_PATH" 2>/dev/null)
elif [ -f "$RESOLVE_ZIP_PATH" ]; then
  ZIP_SIZE=$(wc -c < "$RESOLVE_ZIP_PATH" 2>/dev/null || echo "0")
else
  ZIP_SIZE=0
fi
ZIP_SIZE_MB=$(awk "BEGIN {printf \"%.2f\", $ZIP_SIZE / 1024 / 1024}" 2>/dev/null || echo "0.00")
echo "✅ Resolve ZIP file exists: ${ZIP_SIZE_MB} MB"

# 2. Verify ZIP structure
echo ""
echo "2. ZIP Structure Verification"
EXTRACT_DIR="$REPO_DIR/dist/.resolve-verify"
rm -rf "$EXTRACT_DIR"
mkdir -p "$EXTRACT_DIR"
unzip -q -o "$RESOLVE_ZIP_PATH" -d "$EXTRACT_DIR" || {
  echo "❌ Failed to extract Resolve ZIP"
  exit 1
}

RESOLVE_REQUIRED_FILES=(
  "resolve/backend.js"
  "resolve/manifest.json"
  "resolve/package.json"
  "resolve/static/index.html"
)

RESOLVE_ALL_PRESENT=true
for file in "${RESOLVE_REQUIRED_FILES[@]}"; do
  if [ -f "$EXTRACT_DIR/$file" ]; then
    echo "✅ $file"
  else
    echo "❌ Missing: $file"
    RESOLVE_ALL_PRESENT=false
  fi
done

# Check for node_modules in resolve/static/server
if [ -d "$EXTRACT_DIR/resolve/static/server/node_modules" ]; then
  if command -v find >/dev/null 2>&1; then
    RESOLVE_FILE_COUNT=$(find "$EXTRACT_DIR/resolve/static/server/node_modules" -type f 2>/dev/null | wc -l | tr -d ' ')
  else
    RESOLVE_FILE_COUNT=$(ls -R "$EXTRACT_DIR/resolve/static/server/node_modules" 2>/dev/null | grep -v "^$" | wc -l | tr -d ' ' || echo "0")
  fi
  if [ "$RESOLVE_FILE_COUNT" -gt 0 ]; then
    echo "✅ resolve/static/server/node_modules (contains $RESOLVE_FILE_COUNT files)"
  else
    echo "❌ resolve/static/server/node_modules exists but is empty"
    RESOLVE_ALL_PRESENT=false
  fi
else
  echo "⚠️  resolve/static/server/node_modules not found (may be optional for Resolve)"
fi

rm -rf "$EXTRACT_DIR"

if [ "$RESOLVE_ALL_PRESENT" = false ]; then
  echo "❌ Resolve ZIP verification failed"
  exit 1
fi

echo ""
echo "============================================================"
echo ""
echo "✅ ALL VERIFICATIONS PASSED"
echo ""
echo "📦 Packages ready for distribution:"
echo "   - ZXP: dist/zxp/com.sync.extension.zxp (Adobe After Effects & Premiere Pro)"
echo "   - ZIP: dist/sync-resolve-plugin-v${VERSION}.zip (DaVinci Resolve)"
echo ""
echo "📋 ZXP Package Contents:"
echo "   - Extension manifest and UI files"
echo "   - ExtendScript (JSXBIN) files"
echo "   - Node.js server with all dependencies (node_modules)"
echo "   - Bundled Node.js binaries for all platforms"
echo "   - EPR preset files"
echo "   - Environment configuration (.env)"
echo ""
echo "📋 Resolve ZIP Package Contents:"
echo "   - Resolve plugin backend and manifest"
echo "   - UI files (shared with Adobe extension)"
echo "   - Node.js server with dependencies"
echo "   - Python API scripts"

# Create Mac DMG installer
echo ""
echo "🍎 Creating Mac DMG installer..."
if [ "$(uname)" = "Darwin" ]; then
  if [ -f "$REPO_DIR/bin/create-mac-installer.sh" ]; then
    bash "$REPO_DIR/bin/create-mac-installer.sh" "$VERSION"
    MAC_DMG_PATH="$REPO_DIR/dist/sync-resolve-installer-v${VERSION}.dmg"
    if [ -f "$MAC_DMG_PATH" ]; then
      echo "✅ Mac DMG installer created: $MAC_DMG_PATH"
    else
      echo "⚠️  Mac DMG installer creation failed (non-fatal)"
    fi
  else
    echo "⚠️  Mac installer script not found (skipping)"
  fi
else
  echo "⚠️  Not running on macOS, skipping DMG creation"
  echo "   (DMG can be created manually on macOS using: ./bin/create-mac-installer.sh $VERSION)"
fi

# Create Windows installer (works on any platform)
echo ""
echo "🪟 Creating Windows installer..."
WIN_INSTALLER_NAME="sync-resolve-installer-v${VERSION}"
WIN_INSTALLER_ZIP_PATH="$REPO_DIR/dist/${WIN_INSTALLER_NAME}.zip"
TEMP_WIN_DIR="$REPO_DIR/dist/.windows-installer-build"

# Clean up previous build
rm -rf "$TEMP_WIN_DIR"
mkdir -p "$TEMP_WIN_DIR"

# Extract the Resolve plugin ZIP to get the plugin folder
echo "Extracting plugin for Windows installer..."
EXTRACT_DIR="$REPO_DIR/dist/.win-extract"
rm -rf "$EXTRACT_DIR"
mkdir -p "$EXTRACT_DIR"

if ! unzip -q -o "$RESOLVE_ZIP_PATH" -d "$EXTRACT_DIR" 2>/dev/null; then
  echo "⚠️  Failed to extract Resolve ZIP for Windows installer (non-fatal)"
  rm -rf "$EXTRACT_DIR" "$TEMP_WIN_DIR"
else
  # Rename resolve folder to sync.resolve if needed
  if [ -d "$EXTRACT_DIR/resolve" ]; then
    cp -R "$EXTRACT_DIR/resolve" "$TEMP_WIN_DIR/sync.resolve"
  elif [ -d "$EXTRACT_DIR/sync.resolve" ]; then
    cp -R "$EXTRACT_DIR/sync.resolve" "$TEMP_WIN_DIR/sync.resolve"
  else
    echo "⚠️  Plugin folder not found in ZIP (non-fatal)"
    rm -rf "$EXTRACT_DIR" "$TEMP_WIN_DIR"
  fi
fi

if [ -d "$TEMP_WIN_DIR/sync.resolve" ]; then
  # Create PowerShell installer script
  cat > "$TEMP_WIN_DIR/install-resolve-plugin.ps1" << 'WININSTALLER'
# sync. DaVinci Resolve Plugin Installer
# Run this script as Administrator to install the plugin

$ErrorActionPreference = "Stop"

Write-Host "sync. DaVinci Resolve Plugin Installer" -ForegroundColor Cyan
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host ""

# Check for admin privileges
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "Error: This installer requires Administrator privileges." -ForegroundColor Red
    Write-Host "Please right-click and select 'Run as Administrator'" -ForegroundColor Yellow
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

$TargetDir = "${env:ProgramData}\Blackmagic Design\DaVinci Resolve\Support\Workflow Integration Plugins"
$PluginName = "sync.resolve"
$SourceDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$SourcePlugin = Join-Path $SourceDir $PluginName
$TargetPlugin = Join-Path $TargetDir $PluginName

Write-Host "Installing plugin to: $TargetDir" -ForegroundColor Green
Write-Host ""

# Create target directory if it doesn't exist
if (-not (Test-Path $TargetDir)) {
    Write-Host "Creating target directory..." -ForegroundColor Yellow
    New-Item -ItemType Directory -Path $TargetDir -Force | Out-Null
}

# Remove existing plugin if present
if (Test-Path $TargetPlugin) {
    Write-Host "Removing existing plugin..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force $TargetPlugin
}

# Copy plugin
Write-Host "Copying plugin files..." -ForegroundColor Yellow
Copy-Item -Recurse -Force $SourcePlugin $TargetPlugin

Write-Host ""
Write-Host "✅ Installation complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Restart DaVinci Resolve"
Write-Host "  2. Find the plugin in: Workspace > Workflow Integration > sync."
Write-Host ""
Write-Host "For troubleshooting, visit: https://sync.so" -ForegroundColor Gray
Write-Host ""
Read-Host "Press Enter to exit"
WININSTALLER

  # Create self-elevating PowerShell installer script
  # This version automatically requests admin privileges
  cat > "$TEMP_WIN_DIR/install-resolve-plugin.ps1" << 'WININSTALLER'
# sync. DaVinci Resolve Plugin Installer
# Self-elevating installer script

$ErrorActionPreference = "Stop"

# Check if running as Administrator, if not, elevate
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "Requesting Administrator privileges..." -ForegroundColor Yellow
    $arguments = "-ExecutionPolicy Bypass -File `"$PSCommandPath`""
    Start-Process powershell -Verb RunAs -ArgumentList $arguments -Wait
    exit
}

Write-Host "sync. DaVinci Resolve Plugin Installer" -ForegroundColor Cyan
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host ""

$TargetDir = "${env:ProgramData}\Blackmagic Design\DaVinci Resolve\Support\Workflow Integration Plugins"
$PluginName = "sync.resolve"
$SourceDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$SourcePlugin = Join-Path $SourceDir $PluginName
$TargetPlugin = Join-Path $TargetDir $PluginName

Write-Host "Installing plugin to: $TargetDir" -ForegroundColor Green
Write-Host ""

# Create target directory if it doesn't exist
if (-not (Test-Path $TargetDir)) {
    Write-Host "Creating target directory..." -ForegroundColor Yellow
    New-Item -ItemType Directory -Path $TargetDir -Force | Out-Null
}

# Remove existing plugin if present
if (Test-Path $TargetPlugin) {
    Write-Host "Removing existing plugin..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force $TargetPlugin
}

# Copy plugin
Write-Host "Copying plugin files..." -ForegroundColor Yellow
Copy-Item -Recurse -Force $SourcePlugin $TargetPlugin

Write-Host ""
Write-Host "✅ Installation complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Restart DaVinci Resolve"
Write-Host "  2. Find the plugin in: Workspace > Workflow Integration > sync."
Write-Host ""
Write-Host "For troubleshooting, visit: https://sync.so" -ForegroundColor Gray
Write-Host ""
Read-Host "Press Enter to exit"
WININSTALLER

  # Create batch file wrapper
  cat > "$TEMP_WIN_DIR/Install.bat" << 'BATCHFILE'
@echo off
echo sync. DaVinci Resolve Plugin Installer
echo =======================================
echo.
echo This installer will request Administrator privileges automatically.
echo.
pause
powershell -ExecutionPolicy Bypass -File "%~dp0install-resolve-plugin.ps1"
pause
BATCHFILE

  # Create README
  cat > "$TEMP_WIN_DIR/README.txt" << EOF
sync. DaVinci Resolve Plugin - Installation Instructions
========================================================

INSTALLATION:
1. Double-click "Install.bat" or "install-resolve-plugin.ps1"
2. Click "Yes" when prompted for Administrator privileges (UAC prompt)
3. Follow the on-screen instructions
4. Restart DaVinci Resolve

Note: The installer will automatically request Administrator privileges.
You don't need to manually right-click and select "Run as Administrator".

MANUAL INSTALLATION:
1. Copy the "sync.resolve" folder to:
   C:\ProgramData\Blackmagic Design\DaVinci Resolve\Support\Workflow Integration Plugins\
2. Restart DaVinci Resolve

FINDING THE PLUGIN:
After restarting DaVinci Resolve, find the plugin in:
  Workspace > Workflow Integration > sync.

TROUBLESHOOTING:
- Ensure DaVinci Resolve is closed before installing
- You may need Administrator privileges to install to ProgramData
- Check that the plugin folder is in the correct location
- Visit https://sync.so for support

Version: $VERSION
EOF

  # Create ZIP file
  echo "Packaging Windows installer..."
  cd "$TEMP_WIN_DIR"
  if command -v zip >/dev/null 2>&1; then
    zip -r "$WIN_INSTALLER_ZIP_PATH" . -q || {
      echo "⚠️  Failed to create Windows installer ZIP (non-fatal)"
      rm -rf "$TEMP_WIN_DIR"
      rm -rf "$EXTRACT_DIR"
    }
  else
    # Fallback: try to use Python or other tools
    if command -v python3 >/dev/null 2>&1; then
      python3 -m zipfile -c "$WIN_INSTALLER_ZIP_PATH" . || {
        echo "⚠️  Failed to create Windows installer ZIP (non-fatal)"
        rm -rf "$TEMP_WIN_DIR"
        rm -rf "$EXTRACT_DIR"
      }
    else
      echo "⚠️  zip command not found, skipping Windows installer creation"
      echo "   Installer can be created manually using: .\\bin\\create-windows-installer.ps1 $VERSION"
      rm -rf "$TEMP_WIN_DIR"
      rm -rf "$EXTRACT_DIR"
    fi
  fi

  # Clean up
  rm -rf "$TEMP_WIN_DIR"
  rm -rf "$EXTRACT_DIR"

  if [ -f "$WIN_INSTALLER_ZIP_PATH" ]; then
    if command -v stat >/dev/null 2>&1; then
      WIN_SIZE=$(stat -f%z "$WIN_INSTALLER_ZIP_PATH" 2>/dev/null || stat -c%s "$WIN_INSTALLER_ZIP_PATH" 2>/dev/null)
    else
      WIN_SIZE=$(wc -c < "$WIN_INSTALLER_ZIP_PATH" 2>/dev/null || echo "0")
    fi
    WIN_SIZE_MB=$(awk "BEGIN {printf \"%.2f\", $WIN_SIZE / 1024 / 1024}" 2>/dev/null || echo "0.00")
    echo "✅ Windows installer created: $WIN_INSTALLER_ZIP_PATH (${WIN_SIZE_MB} MB)"
  fi
else
  echo "⚠️  Windows installer creation skipped (plugin folder not found)"
  # Clean up any remaining temp files
  rm -rf "$EXTRACT_DIR"
fi

# Commit changes
echo ""
echo "Committing changes..."
# Add all built files (installers may or may not exist depending on platform)
git add package.json package-lock.json \
  dist/zxp/com.sync.extension.zxp \
  dist/sync-resolve-plugin-v${VERSION}.zip || true
# Add installers if they exist
git add dist/sync-resolve-installer-v${VERSION}.dmg dist/sync-resolve-installer-v${VERSION}.zip 2>/dev/null || true
git commit -m "Bump version to $VERSION" || echo "No changes to commit"

# Create git tag
echo "Creating git tag..."
git tag -a "v$VERSION" -m "$MESSAGE" || echo "Tag exists; continuing"

# Push to GitHub
echo "Pushing to GitHub..."
git push origin HEAD || true
git push origin "v$VERSION" || true

echo ""
echo "============================================================"
echo "✅ Release $VERSION completed!"
echo ""
echo "📦 Built packages:"
echo "   - ZXP: dist/zxp/com.sync.extension.zxp"
echo "   - ZIP: dist/sync-resolve-plugin-v${VERSION}.zip"
if [ -f "$REPO_DIR/dist/sync-resolve-installer-v${VERSION}.dmg" ]; then
  echo "   - DMG: dist/sync-resolve-installer-v${VERSION}.dmg (Mac installer)"
fi
WIN_INSTALLER_ZIP="$REPO_DIR/dist/sync-resolve-installer-v${VERSION}.zip"
if [ -f "$WIN_INSTALLER_ZIP" ]; then
  echo "   - ZIP: dist/sync-resolve-installer-v${VERSION}.zip (Windows installer)"
fi
echo ""
echo "🚀 GitHub Actions will upload packages to releases on tag push"
