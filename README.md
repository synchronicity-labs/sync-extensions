# sync. Extensions

Adobe CEP extensions for After Effects and Premiere Pro, built with React, TypeScript, and Vite using the `bolt-cep` boilerplate.

## Project Structure

```
sync-extensions/
├── src/
│   ├── js/
│   │   ├── panels/           # Panel-specific code
│   │   │   ├── ae/           # After Effects panel
│   │   │   └── ppro/         # Premiere Pro panel
│   │   ├── shared/            # Shared code
│   │   │   ├── components/   # React components
│   │   │   ├── hooks/         # React hooks
│   │   │   ├── styles/        # Sass stylesheets
│   │   │   └── utils/         # Utility functions
│   │   ├── assets/            # Static assets (icons)
│   │   └── lib/              # Third-party libraries
├── server/                    # Node.js backend server
├── bin/                       # Bundled Node.js binaries
├── host/                      # Compiled ExtendScript files
├── cep.config.ts             # CEP configuration
├── vite.config.ts            # Vite configuration
└── vite.es.config.ts         # ExtendScript build config
```

## Prerequisites

- Node.js 18+ (for development)
- Adobe After Effects 2024+ or Premiere Pro 2024+
- CEP extension installation permissions

## Development

### Install Dependencies

```bash
npm install
```

### Development Mode

Start the development server with hot reload:

```bash
npm run dev
```

The extension will be available at `http://localhost:3001` for testing.

### Build

Build both the UI and ExtendScript files:

```bash
npm run build:all
```

This will:
- Build React components to `dist/`
- Compile ExtendScript files to `host/`
- Copy assets, server, and binaries to output directories

### Build ExtendScript Only

```bash
npm run build:es
```

### Preview

Preview the production build:

```bash
npm run preview
```

## Installation

### Development Installation

1. Build the extensions:
   ```bash
   npm run build:all
   ```

2. Copy the built extension folders to Adobe CEP extensions directory:
   - **macOS**: `~/Library/Application Support/Adobe/CEP/extensions/`
   - **Windows**: `C:\Users\<username>\AppData\Roaming\Adobe\CEP\extensions\`

3. Enable CEP debugging (if needed):
   - Create file: `~/Library/Application Support/Adobe/CEP/extensions/.debug` (macOS)
   - Or: `C:\Users\<username>\AppData\Roaming\Adobe\CEP\extensions\debug` (Windows)
   - Add: `{"debug":["*"]}`

4. Restart Adobe application

### Production Installation

Production builds are packaged as ZXP files and signed via GitHub Actions. See `.github/workflows/sign-zxp.yml` for the build and signing process.

## Configuration

### Extension Configuration

Edit `cep.config.ts` to modify:
- Extension IDs and versions
- Panel display names and dimensions
- Host application requirements
- Build settings

### Server Configuration

The `server/` directory contains a Node.js backend that handles:
- File uploads and processing
- API communication
- Job management
- Telemetry

Server configuration is in `server/src/config.js`.

## Project Structure Details

### React Components

- **Header.tsx**: Main navigation header with tab switcher
- **SourcesTab.tsx**: Video/audio upload and selection interface
- **HistoryTab.tsx**: Job history and status display
- **SettingsTab.tsx**: Extension settings and API key management
- **BottomBar.tsx**: Model selector and lipsync button
- **ModelSelector.tsx**: Model selection modal
- **URLInputModal.tsx**: URL input modal for remote media
- **TTSVoiceSelector.tsx**: Text-to-speech voice selection

### React Hooks

- **useCore.ts**: Core functionality (auth, server status, offline checking)
- **useNLE.ts**: Host application integration (AE/PPRO communication)
- **useMedia.ts**: Media selection and upload management
- **useHistory.ts**: Job history management
- **useSettings.ts**: Settings persistence
- **useJobs.ts**: Job creation and status tracking
- **useCost.ts**: Cost estimation
- **useRecording.ts**: Video/audio recording
- **useTTS.ts**: Text-to-speech functionality
- **useServerAutoStart.ts**: Server auto-start logic

### ExtendScript

Host scripts are located in `host/` and compiled to JSXBIN format. These scripts handle:
- Communication with Adobe host applications
- File system operations
- Timeline manipulation
- Export functions

## Build System

### Vite Configuration

- **vite.config.ts**: Main build config for React UI
- **vite.es.config.ts**: ExtendScript compilation config

### Bolt-CEP Plugin

The `vite-cep-plugin` handles:
- CEP manifest generation
- Asset copying
- JSXBIN compilation

## Troubleshooting

### Extension Not Loading

1. Check CEP debugging is enabled
2. Verify extension paths are correct
3. Check Adobe application console for errors
4. Ensure Node.js binaries are present in `bin/` directory

### Server Not Starting

1. Verify server dependencies are installed: `cd server && npm install`
2. Check server logs in extension debug console
3. Ensure port 3000 is available

### Build Errors

1. Clear `dist/` and `node_modules/`
2. Reinstall dependencies: `npm ci`
3. Check TypeScript errors: `npm run lint`

## Contributing

1. Create a feature branch
2. Make changes
3. Test thoroughly in both After Effects and Premiere Pro
4. Submit a pull request

## License

See LICENSE file for details.
