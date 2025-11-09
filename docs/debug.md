## Debugging and Logs

### Base directory
All runtime files (logs, state, cache, outputs, updates) are stored per‑user under the app data folder named `sync. extensions`.

- macOS: `~/Library/Application Support/sync. extensions`
- Windows: `%APPDATA%\sync. extensions`

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
When enabled, components write to the `logs/` directory:
- After Effects host: `logs/sync_ae_debug.log`
- Premiere host: `logs/sync_ppro_debug.log`
- Server auto-start and debug: `logs/sync_server_debug.log`

Note: Without the flag file, UI and host log files are not written.

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
### Disable logs
- MacOS: `rm -f ~/Library/Application\ Support/sync.\ extensions/logs/.debug`
- Windows: `Remove-Item -Force "$env:APPDATA\sync. extensions\logs\.debug"`

### Uploads and temporary files
- Transient render/transcode outputs are written under `uploads/` (automatically cleaned every 24 hours).
- Temporary copies (e.g., of macOS `TemporaryItems`) are kept in `cache/` (automatically cleaned every 6 hours).
