// UXP Host Script Entry Point
// This replaces the ExtendScript JSX files
// Host scripts in UXP run in the host application context

import * as aeft from "./aeft";
import * as ppro from "./ppro";

const ns = "com.sync.extension";

// Detect host application
function getAppName(): "AEFT" | "PPRO" | "unknown" {
  try {
    // UXP provides app information
    const uxp = require("uxp");
    if (uxp && uxp.host && uxp.host.app) {
      const appName = (uxp.host.app.name || "").toLowerCase();
      if (appName.includes("after effects") || appName.includes("aftereffects")) {
        return "AEFT";
      }
      if (appName.includes("premiere")) {
        return "PPRO";
      }
    }
  } catch (e) {
    // Fallback detection
  }
  
  // Try alternative detection methods
  try {
    const app = require("application");
    if (app && app.name) {
      const name = app.name.toLowerCase();
      if (name.includes("after effects") || name.includes("aftereffects")) {
        return "AEFT";
      }
      if (name.includes("premiere")) {
        return "PPRO";
      }
    }
  } catch (e) {
    // Continue to fallback
  }
  
  return "unknown";
}

const appName = getAppName();

// Set up namespace and functions
// In UXP, host scripts expose functions that can be called from the panel
const hostModule = appName === "AEFT" ? aeft : ppro;

// Export all functions for UXP communication
// UXP host scripts expose functions via module exports
export const getHostFunctions = () => {
  return hostModule;
};

// Also expose via namespace for compatibility
try {
  const host = typeof global !== "undefined" ? global : (typeof window !== "undefined" ? window : {});
  (host as any)[ns] = hostModule;
  
  // Export individual functions for direct access
  for (const key in hostModule) {
    if (Object.prototype.hasOwnProperty.call(hostModule, key)) {
      (host as any)[key] = (hostModule as any)[key];
    }
  }
} catch (e) {
  console.error("[uxp/index] Error setting up exports:", e);
}

// Export for module system
export { aeft, ppro };
export default hostModule;

// Type exports
export type Scripts = typeof aeft & typeof ppro;
