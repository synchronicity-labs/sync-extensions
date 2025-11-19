# CEP to UXP Migration Summary

This repository has been migrated from CEP (Common Extensibility Platform) to UXP (Unified Extensibility Platform).

## Key Changes

### 1. Build System
- **Removed**: `vite-cep-plugin` and CEP-specific build configuration
- **Added**: Custom UXP build configuration in `vite.config.ts`
- **Removed**: ExtendScript JSX compilation (`vite.es.config.ts`)
- **Added**: UXP host script compilation using esbuild

### 2. Manifest
- **Removed**: `cep.config.ts` (CEP manifest configuration)
- **Added**: `manifest.json` (UXP manifest)
- **Added**: `uxp.config.ts` (UXP build configuration)

### 3. Host Scripts
- **Removed**: ExtendScript JSX files (`src/jsx/`)
- **Added**: UXP JavaScript host scripts (`src/uxp/`)
  - `src/uxp/index.ts` - Main entry point
  - `src/uxp/ppro.ts` - Premiere Pro functions
  - `src/uxp/aeft.ts` - After Effects functions

### 4. Client Code
- **Removed**: CSInterface dependencies
- **Added**: UXP communication layer (`src/js/lib/utils/uxp.ts`)
- **Updated**: `main.tsx` - Removed CEP initialization
- **Updated**: `useNLE.ts` - Uses UXP APIs instead of CEP
- **Updated**: Host detection - Uses UXP APIs

### 5. Build Scripts
- **Updated**: `package.json` scripts
  - `build:adobe` → `build:uxp`
  - `prezxp` → `preuxp`
  - Removed ZXP-specific scripts

### 6. GitHub Actions
- **Updated**: `.github/workflows/release.yml`
  - Builds UXP extensions instead of ZXP
  - Creates platform-specific ZIP packages
  - Automated release workflow

### 7. Documentation
- **Updated**: `README.md` - UXP installation instructions
- **Removed**: References to ZXP Installer

## File Structure Changes

### Removed Files
- `cep.config.ts`
- `vite.es.config.ts`
- `src/jsx/` (ExtendScript files - converted to UXP)

### New Files
- `manifest.json` (UXP manifest)
- `uxp.config.ts` (UXP configuration)
- `src/uxp/` (UXP host scripts)
- `src/js/lib/utils/uxp.ts` (UXP communication layer)
- `src/js/lib/utils/init-uxp.ts` (UXP initialization)

### Modified Files
- `vite.config.ts` - Complete rewrite for UXP
- `package.json` - Removed CEP dependencies
- `src/js/main/main.tsx` - Removed CEP initialization
- `src/js/main/App.tsx` - Removed CSInterface checks
- `src/js/shared/hooks/useNLE.ts` - Uses UXP APIs
- `src/js/shared/utils/clientHostDetection.ts` - Uses UXP APIs
- `src/js/lib/utils/bolt.ts` - UXP version
- `src/js/lib/utils/cep.ts` - UXP compatibility layer

## API Changes

### Host Script Communication
**Before (CEP)**:
```typescript
const cs = new CSInterface();
cs.evalScript(`host["${ns}"].${functionName}(${args})`, callback);
```

**After (UXP)**:
```typescript
const result = await callUXPFunction(functionName, ...args);
```

### File System
**Before (CEP)**:
```javascript
var file = File.openDialog('Select file');
```

**After (UXP)**:
```typescript
const file = await fs.getFileForOpening({ types: fileFilter });
```

### Host Detection
**Before (CEP)**:
```typescript
const env = cs.getHostEnvironment();
```

**After (UXP)**:
```typescript
const host = require("uxp").host;
const appName = host.app.name;
```

## Build Process

1. **Development**: `npm run dev` - Starts Vite dev server
2. **Build UXP**: `npm run build:uxp` - Builds UXP extension
3. **Build Resolve**: `npm run build:davinci` - Builds Resolve plugin
4. **Release**: `./bin/release.sh` - Creates release packages

## Testing

To test the UXP extension:
1. Build: `npm run build:uxp`
2. Install using Adobe UXP Developer Tool
3. Load in After Effects or Premiere Pro 2024+

## Notes

- Some ExtendScript functions may need additional UXP API implementation
- UXP APIs differ from CEP - some functionality may need reimplementation
- Host script functions marked with "TODO" need UXP API implementation
- The migration maintains backward compatibility where possible
