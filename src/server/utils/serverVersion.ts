import fs from 'fs';
import path from 'path';
import { EXT_ROOT, MANIFEST_PATH } from '../serverConfig';
// Re-export shared version utilities (pure functions that work in any environment)
export { parseBundleVersion, normalizeVersion, compareSemver } from '../../shared/version';

export async function getCurrentVersion(): Promise<string> {
  try {
    // Try primary manifest location (bolt-cep standard)
    try {
      if (fs.existsSync(MANIFEST_PATH)) {
        const xml = fs.readFileSync(MANIFEST_PATH, 'utf8');
        const version = parseBundleVersion(xml);
        if (version) return version;
      }
    } catch (_) { }

    // Fallback: check parent directory for manifest (if server is in subdirectory)
    try {
      const parentManifest = path.join(EXT_ROOT, '..', 'CSXS', 'manifest.xml');
      if (fs.existsSync(parentManifest)) {
        const xml = fs.readFileSync(parentManifest, 'utf8');
        const version = parseBundleVersion(xml);
        if (version) return version;
      }
    } catch (_) { }

    // Legacy: check extensions subdirectory structure
    const extensionsDir = path.join(EXT_ROOT, 'extensions');
    if (fs.existsSync(extensionsDir)) {
      const subdirs = fs.readdirSync(extensionsDir);
      for (const subdir of subdirs) {
        const manifestPath = path.join(extensionsDir, subdir, 'CSXS', 'manifest.xml');
        try {
          if (fs.existsSync(manifestPath)) {
            const xml = fs.readFileSync(manifestPath, 'utf8');
            const version = parseBundleVersion(xml);
            if (version) return version;
          }
        } catch (_) { }
      }
    }

    return '';
  } catch (_) { return ''; }
}

