# Build & Development Guide

Development guide for sync. Extensions, built with React, TypeScript, and Vite using the `bolt-cep` boilerplate.

## Prerequisites

- Node.js 18+ (for development)
- Adobe After Effects 2024+ or Premiere Pro 2024+
- CEP extension installation permissions
- Package manager: NPM, Yarn, or PNPM

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
│   ├── jsx/                   # ExtendScript source files
│   │   ├── aeft/              # After Effects ExtendScript
│   │   ├── ppro/              # Premiere Pro ExtendScript
│   │   └── index.ts           # Main ExtendScript entry
│   └── server/                # Node.js backend server
│       ├── routes/            # API routes
│       ├── services/          # Business logic
│       └── utils/             # Server utilities
├── bin/                       # Bundled Node.js binaries
├── cep.config.ts             # CEP configuration
├── vite.config.ts            # Vite configuration
└── vite.es.config.ts         # ExtendScript build config
```

## Development Setup

### Install Dependencies

```bash
npm install
```

### Development Mode

Start the development server with hot reload:

```bash
npm run dev
```

This will:
- Start Vite dev server with HMR on port 3001
- Start the Node.js backend server
- Watch for changes in both JS and ExtendScript files
- Create a symlink to the extension folder

The extension will be available at `http://localhost:3001` for testing in the browser.

**⚠️ Enable PlayerDebugMode**

Adobe CEP's PlayerDebugMode must be enabled on your machine to test `npm run build` or `npm run dev` builds. Only an installed ZXP with `npm run zxp` will work without PlayerDebugMode enabled.

- Enable this easily with the [aescripts ZXP Installer](https://aescripts.com/learn/zxp-installer/) > Settings > Debug > Enable Debugging
- Or enable manually per OS by following the CEP Cookbook Instructions: [Adobe CEP 12 Cookbook](https://github.com/Adobe-CEP/CEP-Resources/blob/master/CEP_12.x/Documentation/CEP%2012%20HTML%20Extension%20Cookbook.md#debugging-unsigned-extensions)

## Build Commands

### Build for Development

Build both the UI and ExtendScript files:

```bash
npm run build
```

This will:
- Build React components to `dist/cep/`
- Compile ExtendScript files to JSXBIN format
- Copy assets, server, and binaries to output directories
- Create a symlink to the extension folder

### Build ZXP Package

Build and package the extension as a ZXP for distribution:

```bash
npm run zxp
```

This will:
- Build the extension with production settings
- Sign the ZXP with your certificate (requires `ZXP_PASSWORD` in `src/server/.env`)
- Output to `dist/zxp/com.sync.extension.zxp`

**Requirements:**
- `ZXP_PASSWORD` must be set in `src/server/.env`
- Certificate must be configured in `cep.config.ts`

### Build ZIP Package

Build a ZIP archive with the ZXP and additional assets:

```bash
npm run zip
```

### Preview Production Build

Preview the production build:

```bash
npm run preview
```

### Lint Code

Check for linting errors:

```bash
npm run lint
```

## Configuration

### Extension Configuration

Edit `cep.config.ts` to modify:
- Extension IDs and versions
- Panel display names and dimensions
- Host application requirements
- Build settings
- ZXP signing configuration

### Server Configuration

The `src/server/` directory contains a Node.js backend that handles:
- File uploads and processing
- API communication
- Job management
- Telemetry

Server configuration is in `src/server/config.js`.

### Environment Variables

Create `src/server/.env` with the following variables:

```env
# ZXP Signing (required for building ZXP)
ZXP_PASSWORD=your_certificate_password

# R2 Storage (optional)
R2_ACCESS_KEY=your_r2_access_key
R2_SECRET_KEY=your_r2_secret_key
R2_BUCKET=your_bucket_name
R2_ENDPOINT=your_r2_endpoint

# PostHog Analytics (optional)
POSTHOG_KEY=your_posthog_key
POSTHOG_HOST=https://us.i.posthog.com
```

## Release Process

### Creating a Release

1. **Update version and build ZXP:**
   ```bash
   ./bin/release.sh 0.9.45 "Release message"
   ```

   This script will:
   - Update `package.json` version
   - Create sanitized `.env` file (without `ZXP_PASSWORD`)
   - Build and sign the ZXP
   - Verify the ZXP signature and structure
   - Generate checksums
   - Commit changes and create git tag

2. **Push to GitHub:**
   ```bash
   git push origin HEAD
   git push origin v0.9.45
   ```

3. **GitHub Actions will automatically:**
   - Upload the ZXP to GitHub Releases
   - Include checksums for verification

### DaVinci Resolve Build (WIP)

For the DaVinci Resolve workflow integration:

```bash
./bin/local-resolve-release.sh
```

This installs the Resolve plugin to:
`/Library/Application Support/Blackmagic Design/DaVinci Resolve/Workflow Integration Plugins/sync.resolve`

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

Host scripts are located in `src/jsx/` and compiled to JSXBIN format. These scripts handle:
- Communication with Adobe host applications
- File system operations
- Timeline manipulation
- Export functions

App-specific code is split into modules:
- `aeft/aeft.ts` - After Effects specific functions
- `ppro/ppro.ts` - Premiere Pro specific functions

## Build System

### Vite Configuration

- **vite.config.ts**: Main build config for React UI
- **vite.es.config.ts**: ExtendScript compilation config

### Bolt-CEP Plugin

The `vite-cep-plugin` handles:
- CEP manifest generation
- Asset copying
- JSXBIN compilation
- ZXP packaging and signing

## Troubleshooting

### Extension Not Loading

1. Check CEP debugging is enabled (see Development Mode section)
2. Verify extension paths are correct
3. Check Adobe application console for errors
4. Ensure Node.js binaries are present in `bin/` directory

### Server Not Starting

1. Verify server dependencies are installed: `cd src/server && npm install`
2. Check server logs in extension debug console
3. Ensure port 3000 is available
4. Check `src/server/.env` file exists and is configured

### Build Errors

1. Clear `dist/` and `node_modules/`
2. Reinstall dependencies: `npm ci`
3. Check TypeScript errors: `npm run lint`
4. Verify `ZXP_PASSWORD` is set in `src/server/.env` for ZXP builds

### ZXP Signing Issues

1. Verify `ZXP_PASSWORD` is correct in `src/server/.env`
2. Check certificate configuration in `cep.config.ts`
3. Ensure TSA URLs are accessible (for timestamping)
4. Check ZXPSignCmd permissions: `chmod +x node_modules/vite-cep-plugin/lib/bin/ZXPSignCmd`

## Contributing

1. Create a feature branch
2. Make changes
3. Test thoroughly in both After Effects and Premiere Pro
4. Run linting: `npm run lint`
5. Submit a pull request

