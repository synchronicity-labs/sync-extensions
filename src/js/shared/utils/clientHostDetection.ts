/**
 * Client-side host detection utilities for UXP
 * Uses centralized host constants from shared/host.ts
 */

import { HOST_IDS, HOST_NAMES, type HostConfig, normalizeToHostId } from "../../../shared/host";
import { debugError } from "./debugLog";

// Re-export constants for convenience
export { HOST_IDS, HOST_NAMES };
export type { HostConfig };

/**
 * Detect host application using UXP APIs
 */
export function detectHost(): HostConfig | null {
  try {
    // Check if HOST_CONFIG is already set
    if (typeof window !== "undefined" && window.HOST_CONFIG) {
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

    // Method 1: UXP host API
    try {
      const uxp = require("uxp");
      if (uxp && uxp.host && uxp.host.app) {
        const appName = (uxp.host.app.name || "").toUpperCase();
        const appId = (uxp.host.app.id || "").toUpperCase();
        
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
      // UXP API failed, try next method
    }

    // Method 2: Check for Resolve (Electron context)
    if (typeof window !== "undefined") {
      if (window.HOST_CONFIG && window.HOST_CONFIG.hostId === HOST_IDS.RESOLVE) {
        return window.HOST_CONFIG;
      }
      
      if (typeof process !== "undefined" && process.versions && process.versions.electron) {
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

    // Method 3: Check URL (fallback for development)
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
    }

    // Could not detect host
    return null;
  } catch (error) {
    debugError("[host-detection] Error in detectHost", error);
    return null;
  }
}

/**
 * Get the current host configuration
 */
export function getHostConfig(): HostConfig | null {
  if (typeof window !== "undefined" && window.HOST_CONFIG) {
    try {
      normalizeToHostId(window.HOST_CONFIG.hostId);
      return window.HOST_CONFIG;
    } catch {
      // Invalid, re-detect
    }
  }
  
  return detectHost();
}

/**
 * Get the current host ID (uppercase format)
 */
export function getHostId(): string {
  const config = getHostConfig();
  if (!config) {
    throw new Error("Cannot determine host application (AEFT, PPRO, or RESOLVE) - all detection methods failed");
  }
  return config.hostId;
}
