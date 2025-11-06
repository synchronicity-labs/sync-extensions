// Host detection - runs synchronously before React loads
// This ensures HOST_CONFIG is available immediately for all code
(function() {
  try {
    // Try multiple detection methods
    let detected = false;
    
    // Method 1: CSInterface getHostEnvironment
    if (typeof window !== "undefined" && (window as any).CSInterface) {
      try {
        const cs = new (window as any).CSInterface();
        const env = cs.getHostEnvironment?.();
        if (env) {
          const appName = (env.appName || "").toUpperCase();
          const appId = (env.appId || "").toUpperCase();
          
          // Debug logging - use window.debugLog if console isn't available
          const log = (window as any).debugLog || console.log || (() => {});
          log("[host-detection] Method 1 - appName:", env.appName, "appId:", env.appId);
          
          // Detect host based on app ID or name - check multiple variations
          if (appId.indexOf("AEFT") !== -1 || appName.indexOf("AFTER EFFECTS") !== -1 || appName.indexOf("AFTEREFFECTS") !== -1) {
            (window as any).HOST_CONFIG = { hostId: "AEFT", hostName: "After Effects", isAE: true };
            log("[host-detection] Detected After Effects");
            detected = true;
          } else if (appId.indexOf("PPRO") !== -1 || appName.indexOf("PREMIERE") !== -1 || appName.indexOf("PREM") !== -1) {
            (window as any).HOST_CONFIG = { hostId: "PPRO", hostName: "Premiere Pro", isAE: false };
            log("[host-detection] Detected Premiere Pro");
            detected = true;
          }
        }
      } catch (e) {
        // CSInterface failed, try next method
      }
    }
    
    // Method 2: Check window.__adobe_cep__ directly
    if (!detected && typeof window !== "undefined" && (window as any).__adobe_cep__) {
      try {
        const hostEnv = (window as any).__adobe_cep__.getHostEnvironment();
        if (hostEnv) {
          const parsed = typeof hostEnv === 'string' ? JSON.parse(hostEnv) : hostEnv;
          const appName = (parsed.appName || "").toUpperCase();
          const appId = (parsed.appId || "").toUpperCase();
          
          const log = (window as any).debugLog || console.log || (() => {});
          log("[host-detection] Method 2 - appName:", parsed.appName, "appId:", parsed.appId);
          
          if (appId.indexOf("AEFT") !== -1 || appName.indexOf("AFTER EFFECTS") !== -1 || appName.indexOf("AFTEREFFECTS") !== -1) {
            (window as any).HOST_CONFIG = { hostId: "AEFT", hostName: "After Effects", isAE: true };
            detected = true;
          } else if (appId.indexOf("PPRO") !== -1 || appName.indexOf("PREMIERE") !== -1 || appName.indexOf("PREM") !== -1) {
            (window as any).HOST_CONFIG = { hostId: "PPRO", hostName: "Premiere Pro", isAE: false };
            detected = true;
          }
        }
      } catch (e) {
        // Method 2 failed
      }
    }
    
    // Method 3: Check URL or other indicators
    if (!detected && typeof window !== "undefined" && window.location) {
      const url = window.location.href || "";
      if (url.includes("premiere") || url.includes("ppro")) {
        (window as any).HOST_CONFIG = { hostId: "PPRO", hostName: "Premiere Pro", isAE: false };
        detected = true;
      } else if (url.includes("aftereffects") || url.includes("aeft") || url.includes("ae")) {
        (window as any).HOST_CONFIG = { hostId: "AEFT", hostName: "After Effects", isAE: true };
        detected = true;
      }
    }
    
    if (!detected) {
      const log = (window as any).debugLog || console.warn || console.log || (() => {});
      log("[host-detection] Could not detect host - will be detected by useHostDetection hook");
    }
  } catch (e) {
    // Detection failed - useHostDetection hook will handle fallback
    const log = (window as any).debugLog || console.error || (() => {});
    log("[host-detection] Error detecting host:", e);
  }
})();

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { initBolt } from "../lib/utils/bolt";

// Initialize Bolt CEP - loads JSX files
initBolt();

// Enable HMR hot reload for CEP panels
// In development, Vite HMR updates should work automatically
if (import.meta.hot) {
  // Accept HMR updates - let Vite handle them naturally
  // Don't force reload unless absolutely necessary
  import.meta.hot.accept();
  
  // Only reload on critical errors that can't be recovered
  import.meta.hot.on("vite:error", (error) => {
    console.error("[HMR] Critical error during update:", error);
    // Only reload if it's a critical error that prevents the app from working
    // Use a small delay to let React finish current render cycle
    setTimeout(() => {
      if (typeof window !== "undefined" && (window as any).location) {
        // Ensure we're on localhost before reloading
        const currentUrl = (window as any).location.href;
        if (currentUrl.includes('localhost:3001')) {
          (window as any).location.reload();
        }
      }
    }, 500);
  });
}

// Mount React app - ensure root element exists
const rootElement = document.getElementById("root");
if (!rootElement) {
  console.error("[main] Root element not found! Waiting for DOM...");
  // Wait for DOM to be ready
  const waitForRoot = () => {
    const el = document.getElementById("root");
    if (el) {
      const root = ReactDOM.createRoot(el);
      root.render(
        <React.StrictMode>
          <App />
        </React.StrictMode>
      );
    } else {
      setTimeout(waitForRoot, 50);
    }
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', waitForRoot);
  } else {
    waitForRoot();
  }
} else {
  // Root element exists - mount React
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
