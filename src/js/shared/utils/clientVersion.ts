// Version is imported from package.json at build time
// This is a fallback that can be overridden at runtime if needed
export const APP_VERSION = "0.9.44";

// Re-export shared version utilities
export { parseBundleVersion } from '../../../shared/version';

/**
 * Get extension version from manifest.json dynamically (UXP)
 * Reads manifest.json from the extension root
 */
export async function getExtensionVersion(): Promise<string> {
  try {
    // Try to get extension path from UXP
    if (typeof window !== "undefined") {
      try {
        const { storage } = (window as any).require?.("uxp");
        if (storage && storage.localFileSystem) {
          const fs = storage.localFileSystem;
          const pluginFolder = await fs.getPluginFolder();
          const manifestFile = await fs.getFileForReading(pluginFolder.nativePath + "/manifest.json");
          
          if (await manifestFile.exists()) {
            const manifestText = await manifestFile.read();
            const manifest = JSON.parse(manifestText);
            if (manifest && manifest.version) {
              return manifest.version;
            }
          }
        }
      } catch (e) {
        // UXP API not available, try fallback
      }
      
      // Fallback: try to read manifest.json via fetch
      try {
        const response = await fetch("./manifest.json");
        if (response.ok) {
          const manifest = await response.json();
          if (manifest && manifest.version) {
            return manifest.version;
          }
        }
      } catch (fetchError) {
        // Ignore fetch errors
      }
    }
  } catch (_) {
    // Ignore errors
  }
  
  // Fallback to default version
  return APP_VERSION;
}
