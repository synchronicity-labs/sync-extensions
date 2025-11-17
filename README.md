# sync. extensions

Extensions for After Effects, Premiere Pro, and DaVinci Resolve. Built with React, TypeScript, and Vite using the `bolt-cep` boilerplate.

## Installation

### Adobe Applications (After Effects & Premiere Pro)

1. Download the latest release from [GitHub Releases](https://github.com/your-org/sync-extensions/releases)
2. Install the ZXP file using [ZXP Installer](https://aescripts.com/learn/zxp-installer/)
3. Restart After Effects or Premiere Pro
4. Find the extension in **Window > Extensions > sync.**

### DaVinci Resolve

#### Easy Installation (Recommended)

**macOS:**
1. Download `sync-resolve-installer-*.dmg` from [GitHub Releases](https://github.com/your-org/sync-extensions/releases)
2. Open the DMG file
3. Double-click "Install sync.resolve.command" and follow the prompts
4. Restart DaVinci Resolve
5. Find the plugin in **Workspace > Workflow Integration > sync.**

**Windows:**
1. Download `sync-resolve-installer-*.zip` from [GitHub Releases](https://github.com/your-org/sync-extensions/releases)
2. Extract the ZIP file
3. Right-click `Install.bat` and select "Run as Administrator"
4. Follow the on-screen instructions
5. Restart DaVinci Resolve
6. Find the plugin in **Workspace > Workflow Integration > sync.**

#### Manual Installation

1. Download `sync-resolve-plugin-*.zip` from [GitHub Releases](https://github.com/your-org/sync-extensions/releases)
2. Extract the ZIP file
3. Copy the `sync.resolve` folder to:
   - **macOS**: `/Library/Application Support/Blackmagic Design/DaVinci Resolve/Workflow Integration Plugins/`
   - **Windows**: `C:\ProgramData\Blackmagic Design\DaVinci Resolve\Support\Workflow Integration Plugins\`
4. Restart DaVinci Resolve
5. Find the plugin in **Workspace > Workflow Integration > sync.**

## Features

- Video and audio upload and processing
- AI-powered lipsync generation
- Job history and status tracking
- Settings and API key management
- Text-to-speech functionality

## Supported Applications

- **After Effects** 2024 or later
- **Premiere Pro** 2024 or later
- **DaVinci Resolve** (all versions with Workflow Integration support)
- Works on both **Windows** and **macOS**

## Troubleshooting

### Extension Not Loading (Adobe Applications)

1. Ensure you're using After Effects 2024+ or Premiere Pro 2024+
2. Check that the extension is properly installed via ZXP Installer
3. Restart the Adobe application
4. Check the Adobe application console for errors (Help > Enable Debugging)

### Plugin Not Loading (DaVinci Resolve)

1. Verify the plugin folder is in the correct location (see Installation section)
2. Ensure you have write permissions to the plugin directory
3. Restart DaVinci Resolve completely
4. Check that the plugin appears in **Workspace > Workflow Integration**
5. On macOS, ensure the plugin is in `/Library` (system) not `~/Library` (user)

### Server Not Starting

1. Check that port 3000 is available
2. Verify Node.js binaries are present in the extension/plugin
3. Check extension/plugin debug console for server errors

## Security & Trust

- Package is digitally signed and verified
- SHA256 checksums are provided in releases for integrity verification
- Verify checksums: `sha256sum -c checksums.txt` (Linux/macOS) or `certutil -hashfile com.sync.extension.zxp SHA256` (Windows)

## License

See LICENSE file for details.
