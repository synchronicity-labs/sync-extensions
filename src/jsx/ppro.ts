// Premiere Pro JSX entry point
// This file imports all PPRO-specific functions and exposes them globally
import * as ppro from "./ppro/ppro";

// Expose all functions globally for evalScript compatibility
(function() {
  //@ts-ignore
  const host = typeof $ !== "undefined" ? $ : window;
  
  // Export all PPRO_ prefixed functions
  Object.keys(ppro).forEach(key => {
    if (key.startsWith("PPRO_")) {
      host[key] = ppro[key];
    }
  });
})();

