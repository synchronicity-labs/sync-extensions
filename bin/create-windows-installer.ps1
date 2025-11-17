# PowerShell installer script for DaVinci Resolve plugin on Windows
# Usage: .\bin\create-windows-installer.ps1 [version]
# Example: .\bin\create-windows-installer.ps1 0.9.44

param(
    [string]$Version = ""
)

$ErrorActionPreference = "Stop"

# Get script directory
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoDir = Split-Path -Parent $ScriptDir

# Get version from package.json if not provided
if ([string]::IsNullOrEmpty($Version)) {
    $PackageJson = Get-Content "$RepoDir\package.json" | ConvertFrom-Json
    $Version = $PackageJson.version
}

Write-Host "Creating Windows installer for version $Version..." -ForegroundColor Cyan

# Paths
$ResolveZipPath = "$RepoDir\dist\sync-resolve-plugin-v${Version}.zip"
$InstallerName = "sync-resolve-installer-v${Version}"
$InstallerPath = "$RepoDir\dist\${InstallerName}.exe"
$InstallerScriptPath = "$RepoDir\dist\install-resolve-plugin.ps1"
$TempDir = "$RepoDir\dist\.windows-installer-build"
$PluginDir = "$TempDir\sync.resolve"
$TargetDir = "${env:ProgramData}\Blackmagic Design\DaVinci Resolve\Support\Workflow Integration Plugins"

# Check if ZIP exists
if (-not (Test-Path $ResolveZipPath)) {
    Write-Host "Error: Resolve ZIP file not found: $ResolveZipPath" -ForegroundColor Red
    Write-Host "Please run 'npm run build:davinci' first" -ForegroundColor Yellow
    exit 1
}

# Clean up previous build
if (Test-Path $TempDir) {
    Remove-Item -Recurse -Force $TempDir
}
New-Item -ItemType Directory -Path $TempDir | Out-Null

# Extract ZIP
Write-Host "Extracting plugin..." -ForegroundColor Cyan
Expand-Archive -Path $ResolveZipPath -DestinationPath $TempDir -Force

# Rename resolve folder to sync.resolve
if (Test-Path "$TempDir\resolve") {
    Move-Item "$TempDir\resolve" $PluginDir
} else {
    Write-Host "Warning: Expected 'resolve' folder not found in ZIP" -ForegroundColor Yellow
}

# Create PowerShell installer script
$InstallerScript = @"
# sync. DaVinci Resolve Plugin Installer
# Run this script as Administrator to install the plugin

`$ErrorActionPreference = "Stop"

Write-Host "sync. DaVinci Resolve Plugin Installer" -ForegroundColor Cyan
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host ""

# Check for admin privileges
`$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not `$isAdmin) {
    Write-Host "Error: This installer requires Administrator privileges." -ForegroundColor Red
    Write-Host "Please right-click and select 'Run as Administrator'" -ForegroundColor Yellow
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

`$TargetDir = "`${env:ProgramData}\Blackmagic Design\DaVinci Resolve\Support\Workflow Integration Plugins"
`$PluginName = "sync.resolve"
`$SourceDir = Split-Path -Parent `$MyInvocation.MyCommand.Path
`$SourcePlugin = Join-Path `$SourceDir `$PluginName
`$TargetPlugin = Join-Path `$TargetDir `$PluginName

Write-Host "Installing plugin to: `$TargetDir" -ForegroundColor Green
Write-Host ""

# Create target directory if it doesn't exist
if (-not (Test-Path `$TargetDir)) {
    Write-Host "Creating target directory..." -ForegroundColor Yellow
    New-Item -ItemType Directory -Path `$TargetDir -Force | Out-Null
}

# Remove existing plugin if present
if (Test-Path `$TargetPlugin) {
    Write-Host "Removing existing plugin..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force `$TargetPlugin
}

# Copy plugin
Write-Host "Copying plugin files..." -ForegroundColor Yellow
Copy-Item -Recurse -Force `$SourcePlugin `$TargetPlugin

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
"@

Set-Content -Path $InstallerScriptPath -Value $InstallerScript -Encoding UTF8

# Copy plugin to temp directory for packaging
Copy-Item -Recurse -Force $PluginDir "$TempDir\sync.resolve"

# Create README
$ReadmeContent = @"
sync. DaVinci Resolve Plugin - Installation Instructions
========================================================

INSTALLATION:
1. Right-click on "install-resolve-plugin.ps1" and select "Run with PowerShell"
2. If prompted, click "Yes" to allow the script to run
3. You may need to run as Administrator (right-click > Run as Administrator)
4. Follow the on-screen instructions
5. Restart DaVinci Resolve

MANUAL INSTALLATION (Alternative):
1. Copy the "sync.resolve" folder to:
   $TargetDir
2. Restart DaVinci Resolve

FINDING THE PLUGIN:
After restarting DaVinci Resolve, find the plugin in:
  Workspace > Workflow Integration > sync.

TROUBLESHOOTING:
- Ensure DaVinci Resolve is closed before installing
- You may need Administrator privileges to install to ProgramData
- Check that the plugin folder is in the correct location
- Visit https://sync.so for support

Version: $Version
"@

Set-Content -Path "$TempDir\README.txt" -Value $ReadmeContent -Encoding UTF8

# Create a simple batch file wrapper for easier execution
$BatchFile = @"
@echo off
echo sync. DaVinci Resolve Plugin Installer
echo =======================================
echo.
echo This will install the plugin. You may be prompted for Administrator privileges.
echo.
pause
powershell -ExecutionPolicy Bypass -File "%~dp0install-resolve-plugin.ps1"
pause
"@

Set-Content -Path "$TempDir\Install.bat" -Value $BatchFile -Encoding ASCII

# Package everything into a ZIP file (Windows users can extract and run installer)
$InstallerZipPath = "$RepoDir\dist\${InstallerName}.zip"
if (Test-Path $InstallerZipPath) {
    Remove-Item -Force $InstallerZipPath
}

Write-Host "Creating installer package..." -ForegroundColor Cyan
Compress-Archive -Path "$TempDir\*" -DestinationPath $InstallerZipPath -Force

# Get file size
$InstallerSize = (Get-Item $InstallerZipPath).Length
$InstallerSizeMB = [math]::Round($InstallerSize / 1MB, 2)

Write-Host ""
Write-Host "✅ Windows installer package created: $InstallerZipPath ($InstallerSizeMB MB)" -ForegroundColor Green
Write-Host ""
Write-Host "The installer package contains:" -ForegroundColor Cyan
Write-Host "  - sync.resolve folder (plugin)"
Write-Host "  - install-resolve-plugin.ps1 (PowerShell installer script)"
Write-Host "  - Install.bat (Batch file wrapper)"
Write-Host "  - README.txt (installation instructions)"
Write-Host ""
Write-Host "Users can:" -ForegroundColor Cyan
Write-Host "  1. Extract the ZIP file"
Write-Host "  2. Run Install.bat or install-resolve-plugin.ps1"
Write-Host "  3. Restart DaVinci Resolve"

# Clean up temp directory
Remove-Item -Recurse -Force $TempDir

Write-Host ""
Write-Host "Done!" -ForegroundColor Green
