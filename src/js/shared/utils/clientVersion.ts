// Version is imported from package.json at build time
// This is a fallback that can be overridden at runtime if needed
export const APP_VERSION = "0.9.44";

// Re-export shared version utilities
export { parseBundleVersion } from '../../../shared/version';

/**
 * Get extension version from manifest.xml dynamically
 * Reads CSXS/manifest.xml from the extension root
 */
export async function getExtensionVersion(): Promise<string> {
  try {
    // Try to get extension path from CSInterface
    if (typeof window !== 'undefined' && (window as any).CSInterface) {
      const cs = new (window as any).CSInterface();
      const extPath = cs.getSystemPath((window as any).CSInterface.SystemPath.EXTENSION);
      
      if (extPath) {
        // Construct manifest path - normalize for Windows/Mac
        let manifestPath = `${extPath}/CSXS/manifest.xml`;
        
        // Try XMLHttpRequest first (better CEP support for file://)
        try {
          const xmlText = await new Promise<string>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', `file://${manifestPath}`, true);
            xhr.onload = () => {
              if (xhr.status === 0 || xhr.status === 200) {
                resolve(xhr.responseText);
              } else {
                reject(new Error(`HTTP ${xhr.status}`));
              }
            };
            xhr.onerror = () => reject(new Error('Network error'));
            xhr.send();
          });
          
          const version = parseBundleVersion(xmlText);
          if (version) {
            return version;
          }
        } catch (xhrError) {
          // Try relative path (manifest might be accessible relative to extension root)
          try {
            const relativePath = '../../CSXS/manifest.xml';
            const xmlText = await new Promise<string>((resolve, reject) => {
              const xhr = new XMLHttpRequest();
              xhr.open('GET', relativePath, true);
              xhr.onload = () => {
                if (xhr.status === 0 || xhr.status === 200) {
                  resolve(xhr.responseText);
                } else {
                  reject(new Error(`HTTP ${xhr.status}`));
                }
              };
              xhr.onerror = () => reject(new Error('Network error'));
              xhr.send();
            });
            
            const version = parseBundleVersion(xmlText);
            if (version) {
              return version;
            }
          } catch (relativeError) {
            // Fallback: try fetch API (may work in some CEP contexts)
            try {
              const response = await fetch(`file://${manifestPath}`);
              if (response.ok) {
                const xmlText = await response.text();
                const version = parseBundleVersion(xmlText);
                if (version) {
                  return version;
                }
              }
            } catch (fetchError) {
              // All methods failed
            }
          }
        }
      }
    }
  } catch (_) {
    // Ignore errors
  }
  
  // Fallback to default version
  return APP_VERSION;
}

