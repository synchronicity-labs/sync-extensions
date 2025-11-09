# sync. Extensions

Adobe CEP extensions for After Effects and Premiere Pro.

## Installation

### Production Installation

1. Download the latest release from [GitHub Releases](https://github.com/your-org/sync-extensions/releases)
2. Install the ZXP file using [ZXP Installer](https://aescripts.com/learn/zxp-installer/)
3. Restart After Effects or Premiere Pro
4. Find the extension in **Window > Extensions > sync.**

## Features

- Video and audio upload and processing
- AI-powered lipsync generation
- Job history and status tracking
- Settings and API key management
- Text-to-speech functionality

## Supported Applications

- **After Effects** 2024 or later
- **Premiere Pro** 2024 or later
- Works on both **Windows** and **macOS**

## Troubleshooting

### Extension Not Loading

1. Ensure you're using After Effects 2024+ or Premiere Pro 2024+
2. Check that the extension is properly installed via ZXP Installer
3. Restart the Adobe application
4. Check the Adobe application console for errors (Help > Enable Debugging)

### Server Not Starting

1. Check that port 3000 is available
2. Verify Node.js binaries are present in the extension
3. Check extension debug console for server errors

## Security & Trust

- Package is digitally signed and verified
- SHA256 checksums are provided in releases for integrity verification
- Verify checksums: `sha256sum -c checksums.txt` (Linux/macOS) or `certutil -hashfile com.sync.extension.zxp SHA256` (Windows)

## License

See LICENSE file for details.
