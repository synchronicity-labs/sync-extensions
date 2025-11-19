// UXP Host Script Entry Point
// This replaces the ExtendScript JSX files

import * as aeft from "./aeft";
import * as ppro from "./ppro";

const ns = "com.sync.extension";

// Detect host application
function getAppName(): "AEFT" | "PPRO" | "unknown" {
  try {
    // UXP provides app information via require
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
try {
  const host = typeof global !== "undefined" ? global : window;
  
  // Default to ppro (Premiere Pro)
  (host as any)[ns] = ppro;
  
  // Override with aeft if we're in After Effects
  if (appName === "AEFT") {
    (host as any)[ns] = aeft;
  }
  
  // Also ensure functions are available globally as a fallback
  try {
    for (const key in ppro) {
      if (Object.prototype.hasOwnProperty.call(ppro, key)) {
        (host as any)[key] = (ppro as any)[key];
      }
    }
    for (const key in aeft) {
      if (Object.prototype.hasOwnProperty.call(aeft, key)) {
        (host as any)[key] = (aeft as any)[key];
      }
    }
  } catch (globalErr) {
    console.error("[uxp/index] Error setting global functions:", globalErr);
  }
} catch (e) {
  // Last resort: try to set at least one
  try {
    const host = typeof global !== "undefined" ? global : window;
    (host as any)[ns] = ppro; // Always default to ppro
  } catch (e2) {
    console.error("[uxp/index] CRITICAL: Failed to initialize host[ns]:", e, e2);
  }
}

export type Scripts = typeof aeft & typeof ppro;
