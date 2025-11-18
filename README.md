# sync. extensions

Extensions for After Effects, Premiere Pro, DaVinci Resolve, and Final Cut Pro. Built with React, TypeScript, and Vite using the `bolt-cep` boilerplate.

## Installation

### Adobe Applications (After Effects & Premiere Pro)

1. Download the latest release from [GitHub Releases](https://github.com/your-org/sync-extensions/releases)
2. Install the ZXP file using [ZXP Installer](https://aescripts.com/learn/zxp-installer/)
3. Restart After Effects or Premiere Pro
4. Find the extension in **Window > Extensions > sync.**

### DaVinci Resolve

1. Download the latest release from [GitHub Releases](https://github.com/your-org/sync-extensions/releases)
2. Extract the `sync-resolve-plugin-*.zip` file
3. Copy the `sync.resolve` folder to:
   - **macOS**: `/Library/Application Support/Blackmagic Design/DaVinci Resolve/Workflow Integration Plugins/`
   - **Windows**: `C:\ProgramData\Blackmagic Design\DaVinci Resolve\Support\Workflow Integration Plugins\`
4. Restart DaVinci Resolve
5. Find the plugin in **Workspace > Workflow Integration > sync.**

### Final Cut Pro

1. Download the latest release from [GitHub Releases](https://github.com/your-org/sync-extensions/releases)
2. Install the workflow extension (installation instructions TBD)
3. Restart Final Cut Pro
4. Find the extension in **Window > Extensions > sync.**

## Features

- **Video and audio upload** - Upload files directly or use URLs
- **Timeline export** - Export video/audio from timeline using in/out points
- **AI-powered lipsync generation** - Multiple model options with quality/speed tradeoffs
- **Job history and tracking** - View all generations with status and progress
- **Save and insert** - Save outputs to project or insert directly into timeline
- **Settings management** - Configure API keys, models, and save locations
- **Text-to-speech** - Generate audio from text with voice cloning support

## Supported Applications

- **After Effects** 2024 or later
- **Premiere Pro** 2024 or later
- **DaVinci Resolve** (all versions with Workflow Integration support)
- **Final Cut Pro** (Workflow Extension support - macOS only)
- Works on both **Windows** and **macOS** (FCPX macOS only)

## Documentation

- **[Getting Started Guide](./docs/getting_started.md)** - Complete setup and workflow guide
- **[Saving and Inserting Jobs](./docs/save-insert.md)** - Learn how to save and insert completed jobs
- **[Using In/Out Points](./docs/use-in-out.md)** - Export video/audio from timeline ranges
- **[Debug Guide](./docs/debug.md)** - Enable logging and troubleshoot issues
- **[Hot Reload](./docs/hot-reload.md)** - Development workflow for contributors

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

### Save/Insert Not Working

1. Ensure you have an active sequence/timeline/composition
2. Check that your project is saved (for project folder saves)
3. Verify the job is completed (not still processing)
4. Check write permissions to save location
5. See [Save/Insert Guide](./docs/save-insert.md) for detailed troubleshooting

### Export In/Out Not Working

1. Ensure in/out points are set on your timeline
2. Verify you have an active sequence/timeline/composition
3. Check that export size doesn't exceed 1GB limit
4. See [In/Out Points Guide](./docs/use-in-out.md) for detailed instructions

## Quick Start

1. **Install** the extension/plugin (see Installation above)
2. **Get API key** from [sync.media](https://sync.media) (or your API provider)
3. **Configure** settings in the extension (Settings tab)
4. **Select media** - Upload files, export from timeline, or enter URLs
5. **Generate** - Click Lipsync button and wait for completion
6. **Use result** - Save to project or insert into timeline

For detailed instructions, see the [Getting Started Guide](./docs/getting_started.md).

## Security & Trust

- Package is digitally signed and verified
- SHA256 checksums are provided in releases for integrity verification
- Verify checksums: `sha256sum -c checksums.txt` (Linux/macOS) or `certutil -hashfile com.sync.extension.zxp SHA256` (Windows)

## License

See LICENSE file for details.
