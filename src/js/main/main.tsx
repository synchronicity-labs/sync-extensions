// UXP Main Entry Point
// Removed all CEP dependencies

// Host detection - runs synchronously before React loads
import { detectHost } from "../shared/utils/clientHostDetection";

(function() {
  try {
    const config = detectHost();
    if (config) {
      const log = window.debugLog || console.log || (() => {});
      log("[host-detection] Detected host:", config.hostId, config.hostName);
    } else {
      const log = window.debugLog || console.warn || console.log || (() => {});
      log("[host-detection] Could not detect host - will be detected by useHostDetection hook");
    }
  } catch (e) {
    const log = window.debugLog || console.error || (() => {});
    log("[host-detection] Error detecting host:", e);
  }
})();

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { debugLog, debugError, debugWarn } from "../shared/utils/debugLog";

// Initialize UXP host script
const initializeUXP = async () => {
  try {
    // UXP host scripts are loaded automatically by the UXP runtime
    // We just need to ensure they're available
    debugLog("[main] UXP runtime initialized");
  } catch (error) {
    debugError("[main] Error initializing UXP", error);
  }
};

// Start initialization
initializeUXP();

// Enable HMR hot reload for UXP panels
if (import.meta.hot) {
  import.meta.hot.accept();
  
  import.meta.hot.on("vite:error", (error) => {
    debugError("[HMR] Critical error during update", error);
    setTimeout(() => {
      if (typeof window !== "undefined" && window.location) {
        window.location.reload();
      }
    }, 500);
  });
}

// Mount React app
const mountReactApp = () => {
  try {
    const rootElement = document.getElementById("root");
    if (!rootElement) {
      debugError("[main] Root element not found! Waiting for DOM");
      const waitForRoot = () => {
        const el = document.getElementById("root");
        if (el) {
          try {
            const root = ReactDOM.createRoot(el);
            root.render(<App />);
            debugLog("[main] React app mounted successfully");
          } catch (error) {
            debugError("[main] Error mounting React", error);
            el.innerHTML = `
              <div style="padding: 20px; font-family: system-ui; color: #ff0000;">
                <h2>Error Loading Panel</h2>
                <p>Failed to mount React application.</p>
                <p>Error: ${error instanceof Error ? error.message : String(error)}</p>
                <p>Check the UXP debug console for more details.</p>
              </div>
            `;
          }
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
      try {
        const root = ReactDOM.createRoot(rootElement);
        root.render(<App />);
        debugLog("[main] React app mounted successfully");
      } catch (error) {
        debugError("[main] Error mounting React", error);
        rootElement.innerHTML = `
          <div style="padding: 20px; font-family: system-ui; color: #ff0000;">
            <h2>Error Loading Panel</h2>
            <p>Failed to mount React application.</p>
            <p>Error: ${error instanceof Error ? error.message : String(error)}</p>
            <p>Check the UXP debug console for more details.</p>
          </div>
        `;
      }
    }
  } catch (error) {
    debugError("[main] Fatal error during initialization", error);
    try {
      document.body.innerHTML = `
        <div style="padding: 20px; font-family: system-ui; color: #ff0000;">
          <h2>Fatal Error Loading Panel</h2>
          <p>${error instanceof Error ? error.message : String(error)}</p>
          <p>Check the UXP debug console for more details.</p>
        </div>
      `;
    } catch (_) {
      // If even this fails, there's nothing we can do
    }
  }
};

// Start mounting React app
mountReactApp();
