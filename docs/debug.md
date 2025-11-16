## Debugging and Logs

### Base directory
All runtime files (logs, state, cache, outputs, updates) are stored per‑user under the app data folder named `sync. extensions`.

- macOS: `~/Library/Application Support/sync. extensions`
- Windows: `%APPDATA%\sync. extensions` (typically `%USERPROFILE%\AppData\Roaming\sync. extensions`)
- Linux: `~/.config/sync. extensions`

Subfolders created on demand:
- `logs/`
- `cache/` (cleaned every 6 hours)
- `state/`
- `uploads/` (cleaned every 24 hours)
- `updates/`

### Enabling debug logs (simple flag file)
Debug logging is disabled by default. Enable it by creating a flag file:

- Create an empty file `logs/.debug` inside the base directory.

Disable by removing `logs/.debug`.

### Log file locations

#### Debug log files (require `logs/.debug` flag)
When enabled, components write to the `logs/` directory:

- **After Effects host**: `logs/sync_ae_debug.log`
  - Written by After Effects ExtendScript (`aeft.ts`)
  - Also receives UI logs when running in After Effects

- **Premiere host**: `logs/sync_ppro_debug.log`
  - Written by Premiere ExtendScript (`ppro.ts`)
  - Also receives UI logs when running in Premiere

- **Server**: `logs/sync_server_debug.log`
  - Written by the Node.js server process
  - Used when server runs standalone or host detection fails
  - Also receives UI logs when no specific host is detected

- **Resolve plugin**: `logs/sync_resolve_debug.log`
  - Written by the Resolve Electron backend (`backend.ts`)
  - Logs Resolve plugin initialization and Electron process events

#### Log rotation
Debug log files automatically rotate when they exceed 10MB:
- Current log: `sync_*_debug.log`
- Rotated logs: `sync_*_debug.log.1`, `sync_*_debug.log.2`, `sync_*_debug.log.3`
- Up to 3 rotated files are kept (oldest rotated files are deleted)

#### Error log file (always written, no flag required)
- **PostHog errors**: `logs/posthog-errors.log`
  - Critical PostHog telemetry errors
  - Written regardless of debug flag status
  - Falls back to system temp directory if `logs/` is unavailable

#### UI logging
UI components send logs to the server `/debug` endpoint, which:
- Checks for `logs/.debug` flag before writing
- Routes logs to the appropriate host-specific debug file based on `HOST_CONFIG`
- Logs appear in `sync_ae_debug.log`, `sync_ppro_debug.log`, or `sync_server_debug.log` depending on the host application

**Note**: Without the `logs/.debug` flag file, debug log files are not written (except `posthog-errors.log` which is always written).

### Quick start (macOS)
```bash
mkdir -p ~/Library/Application\ Support/sync.\ extensions/logs
touch ~/Library/Application\ Support/sync.\ extensions/logs/.debug
```

### Quick start (Windows / PowerShell)
```powershell
New-Item -ItemType Directory -Force "$env:APPDATA\sync. extensions\logs" | Out-Null
New-Item -ItemType File -Force "$env:APPDATA\sync. extensions\logs\.debug" | Out-Null
```

### Quick start (Linux)
```bash
mkdir -p ~/.config/sync.\ extensions/logs
touch ~/.config/sync.\ extensions/logs/.debug
```

### Disable logs
- macOS: `rm -f ~/Library/Application\ Support/sync.\ extensions/logs/.debug`
- Windows: `Remove-Item -Force "$env:APPDATA\sync. extensions\logs\.debug"`
- Linux: `rm -f ~/.config/sync.\ extensions/logs/.debug`

### Uploads and temporary files
- Transient render/transcode outputs are written under `uploads/` (automatically cleaned every 24 hours).
- Temporary copies (e.g., of macOS `TemporaryItems`) are kept in `cache/` (automatically cleaned every 6 hours).
