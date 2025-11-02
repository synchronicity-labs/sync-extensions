// After Effects JSX entry point
// This file imports all AE-specific functions and exposes them globally
import * as aeft from "./aeft/aeft";

// Expose all functions globally for evalScript compatibility
(function() {
  //@ts-ignore
  const host = typeof $ !== "undefined" ? $ : window;
  
  // Export all AEFT_ prefixed functions
  Object.keys(aeft).forEach(key => {
    if (key.startsWith("AEFT_")) {
      host[key] = aeft[key];
    }
  });
})();

