// Host detection - runs synchronously before React loads
// This ensures HOST_CONFIG is available immediately for all code
(function() {
  try {
    if (typeof window === "undefined" || !(window as any).CSInterface) {
      // Fallback: will be detected by useHostDetection hook
      return;
    }

    const cs = new (window as any).CSInterface();
    const env = cs.getHostEnvironment?.();
    const appName = (env?.appName || "").toUpperCase();
    const appId = (env?.appId || "").toUpperCase();

    // Detect host based on app ID or name
    if (appId.indexOf("AEFT") !== -1 || appName.indexOf("AFTER EFFECTS") !== -1) {
      (window as any).HOST_CONFIG = { hostId: "AEFT", hostName: "After Effects", isAE: true };
    } else if (appId.indexOf("PPRO") !== -1 || appName.indexOf("PREMIERE") !== -1) {
      (window as any).HOST_CONFIG = { hostId: "PPRO", hostName: "Premiere Pro", isAE: false };
    }
  } catch (e) {
    // Detection failed - useHostDetection hook will handle fallback
    console.error("[host-detection] Error detecting host:", e);
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
