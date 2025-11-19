// UXP Host Script Entry Point
// This file is loaded by the UXP runtime as the main host script

// Import host script modules
import * as aeft from "../../uxp/aeft";
import * as ppro from "../../uxp/ppro";

const ns = "com.sync.extension";

// Detect host application using UXP APIs
function getAppName() {
  try {
    const host = require("uxp").host;
    if (host && host.app) {
      const appName = host.app.name || "";
      if (appName.toLowerCase().includes("after effects") || appName.toLowerCase().includes("aftereffects")) {
        return "AEFT";
      }
      if (appName.toLowerCase().includes("premiere")) {
        return "PPRO";
      }
    }
  } catch (e) {
    // Fallback detection
  }
  
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
try {
  const host = typeof global !== "undefined" ? global : window;
  
  // Default to ppro (Premiere Pro)
  host[ns] = ppro;
  
  // Override with aeft if we're in After Effects
  if (appName === "AEFT") {
    host[ns] = aeft;
  }
  
  // Also ensure functions are available globally as a fallback
  try {
    for (const key in ppro) {
      if (Object.prototype.hasOwnProperty.call(ppro, key)) {
        host[key] = ppro[key];
      }
    }
    for (const key in aeft) {
      if (Object.prototype.hasOwnProperty.call(aeft, key)) {
        host[key] = aeft[key];
      }
    }
  } catch (globalErr) {
    console.error("[uxp/index] Error setting global functions:", globalErr);
  }
} catch (e) {
  // Last resort: try to set at least one
  try {
    const host = typeof global !== "undefined" ? global : window;
    host[ns] = ppro; // Always default to ppro
  } catch (e2) {
    console.error("[uxp/index] CRITICAL: Failed to initialize host[ns]:", e, e2);
  }
}

// Export for module system
export { aeft, ppro };
