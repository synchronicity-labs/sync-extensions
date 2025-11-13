/**
 * Shared version utilities
 * Pure functions that work in both client and server environments
 */

/**
 * Parse ExtensionBundleVersion from manifest.xml XML content
 * Works with any XML string - no environment-specific APIs needed
 */
export function parseBundleVersion(xmlText: string): string {
  try {
    const match = /ExtensionBundleVersion\s*=\s*"([^"]+)"/i.exec(String(xmlText || ''));
    if (match && match[1]) {
      return match[1].trim();
    }
  } catch (_) {
    // Ignore errors
  }
  return '';
}

/**
 * Normalize version string (remove 'v' prefix, trim whitespace)
 * Pure function - works in any environment
 */
export function normalizeVersion(v: string): string {
  try {
    return String(v || '').trim().replace(/^v/i, '');
  } catch (_) {
    return '';
  }
}

/**
 * Compare two semantic version strings
 * Returns: -1 if a < b, 0 if a === b, 1 if a > b
 * Pure function - works in any environment
 */
export function compareSemver(a: string, b: string): number {
  const pa = normalizeVersion(a).split('.').map(x => parseInt(x, 10) || 0);
  const pb = normalizeVersion(b).split('.').map(x => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const ai = pa[i] || 0;
    const bi = pb[i] || 0;
    if (ai > bi) return 1;
    if (ai < bi) return -1;
  }
  return 0;
}

