# Create Windows MSI installer for DaVinci Resolve plugin
# Requires WiX Toolset (https://wixtoolset.org/) or can use Inno Setup
# This script creates an MSI using WiX if available, otherwise falls back to Inno Setup or improved PowerShell installer

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
$InstallerMsiPath = "$RepoDir\dist\${InstallerName}.msi"
$InstallerExePath = "$RepoDir\dist\${InstallerName}-setup.exe"
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

if (-not (Test-Path $PluginDir)) {
    Write-Host "Error: Plugin folder not found after extraction" -ForegroundColor Red
    exit 1
}

# Try WiX Toolset first (most standard)
$WixCandle = Get-Command candle.exe -ErrorAction SilentlyContinue
$WixLight = Get-Command light.exe -ErrorAction SilentlyContinue

if ($WixCandle -and $WixLight) {
    Write-Host "Using WiX Toolset to create MSI installer..." -ForegroundColor Green
    
    # Create WiX source file
    $WixSource = @"
<?xml version="1.0" encoding="UTF-8"?>
<Wix xmlns="http://schemas.microsoft.com/wix/2006/wi">
    <Product Id="*" Name="sync. DaVinci Resolve Plugin" Language="1033" Version="$Version" Manufacturer="sync." UpgradeCode="A1B2C3D4-E5F6-4A5B-8C9D-0E1F2A3B4C5D">
        <Package InstallerVersion="200" Compressed="yes" InstallScope="perMachine" />
        
        <MajorUpgrade DowngradeErrorMessage="A newer version of sync. DaVinci Resolve Plugin is already installed." />
        
        <MediaTemplate />
        
        <Feature Id="ProductFeature" Title="sync. DaVinci Resolve Plugin" Level="1">
            <ComponentGroupRef Id="PluginFiles" />
        </Feature>
        
        <ComponentGroup Id="PluginFiles" Directory="INSTALLFOLDER">
            <Component Id="PluginFolder" Guid="*">
                <CreateFolder>
                    <Permission User="Everyone" GenericAll="yes" />
                </CreateFolder>
                <RemoveFolder Id="RemovePluginFolder" On="uninstall" />
            </Component>
            <Component Id="PluginFiles" Guid="*" Directory="INSTALLFOLDER">
                <File Source="$PluginDir\*" />
            </Component>
        </ComponentGroup>
        
        <Directory Id="TARGETDIR" Name="SourceDir">
            <Directory Id="CommonFiles6432Folder">
                <Directory Id="BlackmagicDesign" Name="Blackmagic Design">
                    <Directory Id="DaVinciResolve" Name="DaVinci Resolve">
                        <Directory Id="Support" Name="Support">
                            <Directory Id="WorkflowIntegrationPlugins" Name="Workflow Integration Plugins">
                                <Directory Id="INSTALLFOLDER" Name="sync.resolve">
                                </Directory>
                            </Directory>
                        </Directory>
                    </Directory>
                </Directory>
            </Directory>
        </Directory>
    </Product>
</Wix>
"@
    
    $WixSourcePath = "$TempDir\installer.wxs"
    Set-Content -Path $WixSourcePath -Value $WixSource
    
    # Compile and link
    $WixObjPath = "$TempDir\installer.wixobj"
    & candle.exe -out "$WixObjPath" "$WixSourcePath"
    & light.exe -out "$InstallerMsiPath" "$WixObjPath" -ext WixUIExtension
    
    if (Test-Path $InstallerMsiPath) {
        Write-Host "✅ MSI installer created: $InstallerMsiPath" -ForegroundColor Green
        Remove-Item -Recurse -Force $TempDir
        exit 0
    }
}

# Fallback: Create improved PowerShell installer with self-elevation
Write-Host "Creating self-elevating PowerShell installer (MSI not available)..." -ForegroundColor Yellow

# Create installer script that self-elevates
$InstallerScript = @"
# sync. DaVinci Resolve Plugin Installer
# Self-elevating installer script

`$ErrorActionPreference = "Stop"

# Check if running as Administrator, if not, elevate
`$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not `$isAdmin) {
    Write-Host "Requesting Administrator privileges..." -ForegroundColor Yellow
    `$arguments = "-ExecutionPolicy Bypass -File `"`$PSCommandPath`""
    Start-Process powershell -Verb RunAs -ArgumentList `$arguments -Wait
    exit
}

Write-Host "sync. DaVinci Resolve Plugin Installer" -ForegroundColor Cyan
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host ""

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

Set-Content -Path "$TempDir\install-resolve-plugin.ps1" -Value $InstallerScript -Encoding UTF8

# Create batch file wrapper
$BatchFile = @"
@echo off
echo sync. DaVinci Resolve Plugin Installer
echo =======================================
echo.
echo This installer will request Administrator privileges automatically.
echo.
pause
powershell -ExecutionPolicy Bypass -File "%~dp0install-resolve-plugin.ps1"
pause
"@

Set-Content -Path "$TempDir\Install.bat" -Value $BatchFile -Encoding ASCII

# Create README
$ReadmeContent = @"
sync. DaVinci Resolve Plugin - Installation Instructions
========================================================

INSTALLATION:
1. Double-click "Install.bat" or "install-resolve-plugin.ps1"
2. Click "Yes" when prompted for Administrator privileges
3. Follow the on-screen instructions
4. Restart DaVinci Resolve

MANUAL INSTALLATION:
1. Copy the "sync.resolve" folder to:
   C:\ProgramData\Blackmagic Design\DaVinci Resolve\Support\Workflow Integration Plugins\
2. You may need Administrator privileges
3. Restart DaVinci Resolve

FINDING THE PLUGIN:
After restarting DaVinci Resolve, find the plugin in:
  Workspace > Workflow Integration > sync.

TROUBLESHOOTING:
- Ensure DaVinci Resolve is closed before installing
- The installer will request Administrator privileges automatically
- Check that the plugin folder is in the correct location
- Visit https://sync.so for support

Version: $Version
"@

Set-Content -Path "$TempDir\README.txt" -Value $ReadmeContent -Encoding UTF8

# Copy plugin to temp directory for packaging
Copy-Item -Recurse -Force $PluginDir "$TempDir\sync.resolve"

# Package everything into a ZIP file
$InstallerZipPath = "$RepoDir\dist\${InstallerName}.zip"
if (Test-Path $InstallerZipPath) {
    Remove-Item -Force $InstallerZipPath
}

Write-Host "Packaging installer..." -ForegroundColor Cyan
Compress-Archive -Path "$TempDir\*" -DestinationPath $InstallerZipPath -Force

# Get file size
$InstallerSize = (Get-Item $InstallerZipPath).Length
$InstallerSizeMB = [math]::Round($InstallerSize / 1MB, 2)

Write-Host ""
Write-Host "✅ Windows installer package created: $InstallerZipPath ($InstallerSizeMB MB)" -ForegroundColor Green
Write-Host ""
Write-Host "The installer package contains:" -ForegroundColor Cyan
Write-Host "  - sync.resolve folder (plugin)"
Write-Host "  - install-resolve-plugin.ps1 (self-elevating PowerShell installer)"
Write-Host "  - Install.bat (batch file wrapper)"
Write-Host "  - README.txt (installation instructions)"
Write-Host ""
Write-Host "Users can:" -ForegroundColor Cyan
Write-Host "  1. Extract the ZIP file"
Write-Host "  2. Run Install.bat (will auto-elevate to Administrator)"
Write-Host "  3. Restart DaVinci Resolve"

# Clean up temp directory
Remove-Item -Recurse -Force $TempDir

Write-Host ""
Write-Host "Done!" -ForegroundColor Green
