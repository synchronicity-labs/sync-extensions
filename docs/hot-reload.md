# Hot Reloading Guide

This guide explains how hot reloading works for both Adobe CEP extensions and DaVinci Resolve plugin development.

## Quick Start

Run `npm run dev` to start development with hot reloading for both CEP and Resolve:

```bash
npm run dev
```

This starts:
1. **Vite dev server** (port 3001) - Hot reloads React UI for both CEP and Resolve
2. **Node server** (port 3000) - Backend API server
3. **Resolve plugin builder** - Watches and rebuilds Resolve plugin files

## How Hot Reloading Works

### Adobe CEP Extensions (Premiere Pro / After Effects)

**UI Changes (React/TypeScript in `src/js/`):**
- ✅ **Automatic hot reload** via Vite HMR
- Changes to React components, hooks, styles, etc. reload instantly
- No restart needed

**ExtendScript Changes (`src/jsx/`):**
- ⚠️ **Requires restart** - ExtendScript files are compiled to JSXBIN
- Changes are detected and rebuilt automatically
- Restart the Adobe application to see changes

### DaVinci Resolve Plugin

**UI Changes (React/TypeScript in `src/js/`):**
- ✅ **Automatic hot reload** via Vite HMR
- The Electron window loads from `http://localhost:3001/main/` in dev mode
- React components, hooks, styles reload instantly
- No restart needed

**Backend Changes (`src/resolve/backend.ts`, `preload.ts`, etc.):**
- ✅ **Auto-rebuild** - Files are watched and rebuilt automatically
- ⚠️ **Requires plugin restart** - Restart the Resolve plugin window to see changes
- Changes to `backend.ts`, `preload.ts`, and static scripts trigger rebuilds

**Python API Changes (`src/resolve/python/`):**
- ✅ **Auto-rebuild** - Python files are watched and copied automatically
- ⚠️ **Requires plugin restart** - Restart the Resolve plugin window to see changes

## Development Workflow

### For CEP Development:
1. Run `npm run dev`
2. Open Premiere Pro or After Effects
3. Open the extension panel
4. Edit files in `src/js/` - changes reload automatically
5. Edit files in `src/jsx/` - rebuilds automatically, restart app to see changes

### For Resolve Development:
1. Run `npm run dev`
2. Open DaVinci Resolve
3. Open the plugin panel (Workspace > Workflow Integration > sync.)
4. Edit files in `src/js/` - changes reload automatically in the Electron window
5. Edit files in `src/resolve/` - rebuilds automatically, restart plugin window to see changes

## File Watching

The Resolve plugin builder watches these files:
- `src/resolve/**/*.ts` - TypeScript files (backend.ts, preload.ts, static scripts)
- `src/resolve/**/*.py` - Python API files
- `src/resolve/**/*.json` - Configuration files
- `src/resolve/**/*.sh` - Shell scripts

When these files change, they are automatically:
1. Compiled (TypeScript → JavaScript)
2. Copied to `dist/resolve/`
3. Ready for the plugin to use (after restart)

## Troubleshooting

### UI changes not reloading:
- Check that Vite dev server is running on port 3001
- Check browser console for HMR errors
- Try hard refresh (Cmd+Shift+R / Ctrl+Shift+R)

### Backend changes not rebuilding:
- Check console for file watcher messages
- Verify `chokidar` is installed (`npm install`)
- Check that files are being saved (not just edited)

### Resolve plugin not updating:
- Restart the Resolve plugin window (close and reopen)
- Check `dist/resolve/` directory for updated files
- Check console logs for rebuild messages

## Manual Rebuild

If automatic rebuilding isn't working:

```bash
# Rebuild Resolve plugin manually
npm run dev:resolve-build

# Rebuild everything
npm run build
```

## Production Builds

Production builds don't use hot reloading:

```bash
# Build Adobe extension
npm run build:adobe

# Build Resolve plugin
npm run build:davinci

# Build both
npm run build
```

