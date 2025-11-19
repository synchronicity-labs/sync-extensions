// UXP Node.js Module Compatibility
// Provides Node.js-like APIs using UXP storage

import { storage } from "uxp";

const fs = storage.localFileSystem;

// Export os-like object
export const os = {
  platform: () => {
    try {
      const uxp = require("uxp");
      if (uxp && uxp.host && uxp.host.platform) {
        return uxp.host.platform === "win32" ? "win32" : "darwin";
      }
    } catch (e) {
      // Fallback
    }
    return typeof process !== "undefined" ? process.platform : "darwin";
  },
};

// Export process-like object
export const process = {
  platform: typeof process !== "undefined" ? process.platform : "darwin",
  versions: typeof process !== "undefined" ? process.versions : {},
};
