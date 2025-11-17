# DaVinci Resolve Installation Guide

This document describes the installation process for the sync. DaVinci Resolve plugin.

## Installation Methods

### Method 1: Easy Installation (Recommended)

#### macOS

1. Download `sync-resolve-installer-*.dmg` from GitHub Releases
2. Open the DMG file
3. Double-click "Install sync.resolve.command"
4. Enter your administrator password when prompted
5. Restart DaVinci Resolve
6. Find the plugin in **Workspace > Workflow Integration > sync.**

#### Windows

1. Download `sync-resolve-installer-*.zip` from GitHub Releases
2. Extract the ZIP file
3. Right-click `Install.bat` and select "Run as Administrator"
4. Follow the on-screen instructions
5. Restart DaVinci Resolve
6. Find the plugin in **Workspace > Workflow Integration > sync.**

### Method 2: Manual Installation

1. Download `sync-resolve-plugin-*.zip` from GitHub Releases
2. Extract the ZIP file
3. Copy the `sync.resolve` folder to:
   - **macOS**: `/Library/Application Support/Blackmagic Design/DaVinci Resolve/Workflow Integration Plugins/`
   - **Windows**: `C:\ProgramData\Blackmagic Design\DaVinci Resolve\Support\Workflow Integration Plugins\`
4. Restart DaVinci Resolve
5. Find the plugin in **Workspace > Workflow Integration > sync.**

## Installation Paths

### macOS
- **System-wide**: `/Library/Application Support/Blackmagic Design/DaVinci Resolve/Workflow Integration Plugins/`
- **User-specific** (not supported): `~/Library/Application Support/Blackmagic Design/DaVinci Resolve/Workflow Integration Plugins/`

### Windows
- **System-wide**: `C:\ProgramData\Blackmagic Design\DaVinci Resolve\Support\Workflow Integration Plugins\`

## Troubleshooting

### Plugin Not Appearing

1. **Verify installation path**: Ensure the plugin is in the correct location (see above)
2. **Check folder name**: The folder must be named exactly `sync.resolve` (not `resolve` or `sync-resolve`)
3. **Permissions**: On macOS, you may need administrator privileges to install to `/Library`
4. **Restart**: Completely quit and restart DaVinci Resolve (not just close the project)

### Server Not Starting

1. Check that Node.js binaries are present in `sync.resolve/static/bin/`
2. Verify Electron is installed in `sync.resolve/node_modules/electron/`
3. Check debug logs at:
   - **macOS**: `~/Library/Application Support/sync. extensions/logs/sync_resolve_debug.log`
   - **Windows**: `%APPDATA%\sync. extensions\logs\sync_resolve_debug.log`
4. Enable debug logging by creating the `.debug` file in the logs directory

### Python API Errors

1. Ensure Python 3 is installed and accessible
2. Check that `resolve_api.py` is executable (chmod +x on macOS/Linux)
3. Verify DaVinci Resolve Python API is available (usually installed with Resolve)

## Building Installers

### Mac DMG Installer

```bash
./bin/create-mac-installer.sh [version]
```

Creates a DMG file with:
- `sync.resolve` plugin folder
- `Install sync.resolve.command` installer script
- `README.txt` with instructions
- Applications symlink
- Install Location folder

### Windows Installer

```powershell
.\bin\create-windows-installer.ps1 [version]
```

Creates a ZIP file with:
- `sync.resolve` plugin folder
- `install-resolve-plugin.ps1` PowerShell installer script
- `Install.bat` batch file wrapper
- `README.txt` with instructions

## Release Process

The release script (`bin/release.sh`) automatically creates installers when run on the appropriate platform:

1. Builds the Resolve plugin ZIP
2. Creates Mac DMG installer (if on macOS)
3. Creates Windows installer (if PowerShell is available)
4. Commits and tags the release
5. GitHub Actions uploads all packages to releases

Installers are optional and platform-specific - the release will succeed even if installers can't be created on the build machine.
