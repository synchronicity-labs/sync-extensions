/**
 * Client-side host detection utilities
 * Uses centralized host constants from shared/host.ts
 */

import { HOST_IDS, HOST_NAMES, type HostConfig, normalizeToHostId } from "../../../shared/host";
import { debugError } from "./debugLog";

// Re-export constants for convenience
export { HOST_IDS, HOST_NAMES };
export type { HostConfig };

/**
 * Detect host application using CSInterface
 * This is the single source of truth for client-side host detection
 */
export function detectHost(): HostConfig | null {
  try {
    // Check if HOST_CONFIG is already set (by main.tsx or other initialization)
    if (typeof window !== "undefined" && window.HOST_CONFIG) {
      // Validate it's a valid host
      try {
        normalizeToHostId(window.HOST_CONFIG.hostId);
        return window.HOST_CONFIG;
      } catch {
        // Invalid host ID, continue to detection
      }
    }

    // Check for forced host ID (for testing/debugging)
    if (typeof window !== "undefined" && window.__forceHostId) {
      try {
        const hostId = normalizeToHostId(window.__forceHostId);
        const config: HostConfig = {
          hostId,
          hostName: HOST_NAMES[hostId],
          isAE: hostId === HOST_IDS.AEFT,
        };
        window.HOST_CONFIG = config;
        return config;
      } catch {
        // Invalid forced host ID, continue to detection
      }
    }

    // Method 1: CSInterface getHostEnvironment
    if (typeof window !== "undefined" && window.CSInterface) {
      try {
        const cs = new window.CSInterface();
        const env = cs.getHostEnvironment?.();
        if (env) {
          const appName = (env.appName || "").toUpperCase();
          const appId = (env.appId || "").toUpperCase();
          
          // Check for After Effects
          if (
            appId.indexOf("AEFT") !== -1 ||
            appName.indexOf("AFTER EFFECTS") !== -1 ||
            appName.indexOf("AFTEREFFECTS") !== -1
          ) {
            const config: HostConfig = {
              hostId: HOST_IDS.AEFT,
              hostName: HOST_NAMES.AEFT,
              isAE: true,
            };
            window.HOST_CONFIG = config;
            return config;
          }
          
          // Check for Premiere Pro
          if (
            appId.indexOf("PPRO") !== -1 ||
            appName.indexOf("PREMIERE") !== -1 ||
            appName.indexOf("PREM") !== -1
          ) {
            const config: HostConfig = {
              hostId: HOST_IDS.PPRO,
              hostName: HOST_NAMES.PPRO,
              isAE: false,
            };
            window.HOST_CONFIG = config;
            return config;
          }
        }
      } catch {
        // CSInterface failed, try next method
      }
    }

    // Method 2: Check window.__adobe_cep__ directly
    if (typeof window !== "undefined" && window.__adobe_cep__) {
      try {
        const hostEnv = window.__adobe_cep__.getHostEnvironment();
        if (hostEnv) {
          const parsed = typeof hostEnv === "string" ? JSON.parse(hostEnv) : hostEnv;
          const appName = (parsed.appName || "").toUpperCase();
          const appId = (parsed.appId || "").toUpperCase();

          // Check for After Effects
          if (
            appId.indexOf("AEFT") !== -1 ||
            appName.indexOf("AFTER EFFECTS") !== -1 ||
            appName.indexOf("AFTEREFFECTS") !== -1
          ) {
            const config: HostConfig = {
              hostId: HOST_IDS.AEFT,
              hostName: HOST_NAMES.AEFT,
              isAE: true,
            };
            window.HOST_CONFIG = config;
            return config;
          }

          // Check for Premiere Pro
          if (
            appId.indexOf("PPRO") !== -1 ||
            appName.indexOf("PREMIERE") !== -1 ||
            appName.indexOf("PREM") !== -1
          ) {
            const config: HostConfig = {
              hostId: HOST_IDS.PPRO,
              hostName: HOST_NAMES.PPRO,
              isAE: false,
            };
            window.HOST_CONFIG = config;
            return config;
          }
        }
      } catch {
        // Method 2 failed, try next method
      }
    }

    // Method 3: Check for Resolve (Electron context or explicit Resolve markers)
    if (typeof window !== "undefined") {
      // Check if already set by Resolve host detection script
      if (window.HOST_CONFIG && window.HOST_CONFIG.hostId === HOST_IDS.RESOLVE) {
        return window.HOST_CONFIG;
      }
      
      // Check for Electron context (Resolve uses Electron)
      if (typeof process !== "undefined" && process.versions && process.versions.electron) {
        // Check if CSInterface is NOT available (Resolve doesn't have CEP)
        if (!window.CSInterface && !window.__adobe_cep__) {
          const config: HostConfig = {
            hostId: HOST_IDS.RESOLVE,
            hostName: HOST_NAMES.RESOLVE,
            isAE: false,
          };
          window.HOST_CONFIG = config;
          return config;
        }
      }
    }

    // Method 3.5: Check for FCPX (explicit FCPX markers or web view context)
    if (typeof window !== "undefined") {
      // Check if already set by FCPX host detection script
      if (window.HOST_CONFIG && window.HOST_CONFIG.hostId === HOST_IDS.FCPX) {
        return window.HOST_CONFIG;
      }
      
      // Check for FCPX web view context (FCPX extensions run in web view)
      // FCPX extensions don't have CSInterface or Electron, but may have FCPX-specific APIs
      if (!window.CSInterface && !window.__adobe_cep__ && typeof process === "undefined") {
        // Check if we're in a web view context that might be FCPX
        // This is a heuristic - actual detection should be done by host-detection.fcpx.ts
        // But we can check for FCPX-specific markers if they exist
        const userAgent = navigator.userAgent || "";
        if (userAgent.includes("Final Cut Pro") || userAgent.includes("FCPX")) {
          const config: HostConfig = {
            hostId: HOST_IDS.FCPX,
            hostName: HOST_NAMES.FCPX,
            isAE: false,
          };
          window.HOST_CONFIG = config;
          return config;
        }
      }
    }

    // Method 4: Check URL (fallback for development)
    if (typeof window !== "undefined" && window.location) {
      const url = window.location.href || "";
      if (url.includes("premiere") || url.includes("ppro")) {
        const config: HostConfig = {
          hostId: HOST_IDS.PPRO,
          hostName: HOST_NAMES.PPRO,
          isAE: false,
        };
        window.HOST_CONFIG = config;
        return config;
      }
      if (url.includes("aftereffects") || url.includes("aeft") || url.includes("ae")) {
        const config: HostConfig = {
          hostId: HOST_IDS.AEFT,
          hostName: HOST_NAMES.AEFT,
          isAE: true,
        };
        window.HOST_CONFIG = config;
        return config;
      }
      if (url.includes("resolve") || url.includes("davinci")) {
        const config: HostConfig = {
          hostId: HOST_IDS.RESOLVE,
          hostName: HOST_NAMES.RESOLVE,
          isAE: false,
        };
        window.HOST_CONFIG = config;
        return config;
      }
      if (url.includes("fcpx") || url.includes("finalcut") || url.includes("final-cut")) {
        const config: HostConfig = {
          hostId: HOST_IDS.FCPX,
          hostName: HOST_NAMES.FCPX,
          isAE: false,
        };
        window.HOST_CONFIG = config;
        return config;
      }
    }

    // Could not detect host
    return null;
  } catch (error) {
    // Log error but don't throw - let caller decide what to do
    debugError("[host-detection] Error in detectHost", error);
    return null;
  }
}

/**
 * Get the current host configuration
 * Returns null if host cannot be determined
 */
export function getHostConfig(): HostConfig | null {
  // First check if already set
  if (typeof window !== "undefined" && window.HOST_CONFIG) {
    try {
      normalizeToHostId(window.HOST_CONFIG.hostId);
      return window.HOST_CONFIG;
    } catch {
      // Invalid, re-detect
    }
  }
  
  // Try to detect
  return detectHost();
}

/**
 * Get the current host ID (uppercase format)
 * Throws an error if host cannot be determined
 */
export function getHostId(): string {
  const config = getHostConfig();
  if (!config) {
    throw new Error("Cannot determine host application (AEFT, PPRO, RESOLVE, or FCPX) - all detection methods failed");
  }
  return config.hostId;
}

