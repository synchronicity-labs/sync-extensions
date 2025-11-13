// Host detection - runs synchronously before React loads
// This ensures HOST_CONFIG is available immediately for all code
// Uses centralized host detection from shared/utils/host.ts
import { detectHost } from "../shared/utils/host";

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
    // Detection failed - log but don't block panel
    const log = window.debugLog || console.error || (() => {});
    log("[host-detection] Error detecting host:", e);
    // Don't re-throw - let React mount even if host detection fails
  }
})();

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { initBolt } from "../lib/utils/bolt";

// Initialize Bolt CEP - loads JSX files
// Wait for CEP to be fully available before initializing
let boltInitRetries = 0;
const MAX_BOLT_INIT_RETRIES = 50; // 5 seconds max (50 * 100ms)

const initializeBoltWhenReady = () => {
  // Check if CEP is available
  if (typeof window !== "undefined" && (window as any).cep && (window as any).__adobe_cep__) {
    try {
      initBolt();
    } catch (error) {
      console.error("[main] Error initializing Bolt:", error);
      // Don't block panel rendering if Bolt fails
    }
  } else {
    // Retry after a short delay if CEP isn't ready yet
    boltInitRetries++;
    if (boltInitRetries < MAX_BOLT_INIT_RETRIES) {
      setTimeout(initializeBoltWhenReady, 100);
    } else {
      console.warn("[main] CEP not available after max retries - panel will still render");
    }
  }
};

// Start initialization
initializeBoltWhenReady();

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
      if (typeof window !== "undefined" && window.location) {
        // Reload safely (handles dev vs production)
        window.location.reload();
      }
    }, 500);
  });
}

// Mount React app - ensure root element exists
const mountReactApp = () => {
  try {
    const rootElement = document.getElementById("root");
    if (!rootElement) {
      console.error("[main] Root element not found! Waiting for DOM...");
      // Wait for DOM to be ready
      const waitForRoot = () => {
        const el = document.getElementById("root");
        if (el) {
          try {
            const root = ReactDOM.createRoot(el);
            root.render(
              <App />
            );
            console.log("[main] React app mounted successfully");
          } catch (error) {
            console.error("[main] Error mounting React:", error);
            // Show error message in panel
            el.innerHTML = `
              <div style="padding: 20px; font-family: system-ui; color: #ff0000;">
                <h2>Error Loading Panel</h2>
                <p>Failed to mount React application.</p>
                <p>Error: ${error instanceof Error ? error.message : String(error)}</p>
                <p>Check the CEP debug console for more details.</p>
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
      // Root element exists - mount React
      try {
        const root = ReactDOM.createRoot(rootElement);
        root.render(
          <React.StrictMode>
            <App />
          </React.StrictMode>
        );
        console.log("[main] React app mounted successfully");
      } catch (error) {
        console.error("[main] Error mounting React:", error);
        // Show error message in panel
        rootElement.innerHTML = `
          <div style="padding: 20px; font-family: system-ui; color: #ff0000;">
            <h2>Error Loading Panel</h2>
            <p>Failed to mount React application.</p>
            <p>Error: ${error instanceof Error ? error.message : String(error)}</p>
            <p>Check the CEP debug console for more details.</p>
          </div>
        `;
      }
    }
  } catch (error) {
    console.error("[main] Fatal error during initialization:", error);
    // Last resort - try to show error in body
    try {
      document.body.innerHTML = `
        <div style="padding: 20px; font-family: system-ui; color: #ff0000;">
          <h2>Fatal Error Loading Panel</h2>
          <p>${error instanceof Error ? error.message : String(error)}</p>
          <p>Check the CEP debug console for more details.</p>
        </div>
      `;
    } catch (_) {
      // If even this fails, there's nothing we can do
    }
  }
};

// Start mounting React app
mountReactApp();
