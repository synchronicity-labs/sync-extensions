// Initialize console logging FIRST - before anything else
(function() {
  // Ensure console methods exist
  if (!window.console) {
    (window as any).console = {
      log: function() {},
      error: function() {},
      warn: function() {},
      info: function() {}
    };
  }
  
  // Log initialization
  console.log('[sync] Extension initializing...');
  console.log('[sync] CEP available:', typeof (window as any).__adobe_cep__ !== 'undefined');
  console.log('[sync] CSInterface available:', typeof (window as any).CSInterface !== 'undefined');
  console.log('[sync] User agent:', navigator.userAgent);
  console.log('[sync] Document ready state:', document.readyState);
  
  // Check if CEP is properly initialized (critical for extension to work)
  setTimeout(function() {
    const cepAvailable = typeof (window as any).__adobe_cep__ !== 'undefined';
    const csInterfaceAvailable = typeof (window as any).CSInterface !== 'undefined';
    
    if (!cepAvailable) {
      console.error('[sync] WARNING: CEP runtime not detected!');
      console.error('[sync] This usually means:');
      console.error('[sync] 1. CEP PlayerDebugMode is not enabled on macOS');
      console.error('[sync] 2. Extension may not be properly installed');
      console.error('[sync] 3. Adobe application may need to be restarted');
      console.error('[sync]');
      console.error('[sync] To enable CEP debug mode on macOS:');
      console.error('[sync] Run: defaults write com.adobe.CSXS.12 PlayerDebugMode 1');
      console.error('[sync] Then restart Adobe applications');
    } else {
      console.log('[sync] CEP runtime detected successfully');
    }
    
    if (!csInterfaceAvailable) {
      console.warn('[sync] CSInterface not available - will use shim');
    }
  }, 500);
})();

// Load CSInterface shim FIRST - must be available before any code tries to use it
// This ensures CSInterface is available even if Adobe CEP runtime hasn't fully initialized
import "../lib/CSInterface";

// Host detection - runs synchronously before React loads
// This ensures HOST_CONFIG is available immediately for all code
// Uses centralized host detection from shared/utils/clientHostDetection.ts
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
import { debugLog, debugError, debugWarn } from "../shared/utils/debugLog";

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
      debugError("[main] Error initializing Bolt", error);
      // Don't block panel rendering if Bolt fails
    }
  } else {
    // Retry after a short delay if CEP isn't ready yet
    boltInitRetries++;
    if (boltInitRetries < MAX_BOLT_INIT_RETRIES) {
      setTimeout(initializeBoltWhenReady, 100);
    } else {
      debugWarn("[main] CEP not available after max retries - panel will still render");
    }
  }
};

// Start initialization
initializeBoltWhenReady();

// Enable HMR hot reload for CEP panels
// In development, Vite HMR updates should work automatically
if (import.meta.hot) {
  try {
    // Accept HMR updates - let Vite handle them naturally
    // Don't force reload unless absolutely necessary
    import.meta.hot.accept();
    
    // Handle WebSocket connection errors gracefully
    import.meta.hot.on("vite:ws:disconnect", () => {
      debugWarn("[HMR] WebSocket disconnected - HMR may not work until reconnection");
    });
    
    import.meta.hot.on("vite:ws:connect", () => {
      debugLog("[HMR] WebSocket connected - hot reload active");
    });
    
    // Only reload on critical errors that can't be recovered
    import.meta.hot.on("vite:error", (error) => {
      debugError("[HMR] Critical error during update", error);
      // Only reload if it's a critical error that prevents the app from working
      // Use a small delay to let React finish current render cycle
      setTimeout(() => {
        if (typeof window !== "undefined" && window.location) {
          // Reload safely (handles dev vs production)
          window.location.reload();
        }
      }, 500);
    });
  } catch (error) {
    // Silently handle HMR setup errors - don't break the app if HMR fails
    debugWarn("[HMR] Error setting up HMR (non-critical)", error);
  }
}

// Catch unhandled promise rejections related to WebSocket/HMR
if (typeof window !== "undefined") {
  const originalError = window.onerror;
  window.addEventListener("unhandledrejection", (event) => {
    const error = event.reason;
    const errorMessage = error?.message || String(error);
    
    // Ignore WebSocket connection errors - they're non-critical
    if (errorMessage.includes("WebSocket") || 
        errorMessage.includes("websocket") ||
        errorMessage.includes("closed without opened")) {
      debugWarn("[HMR] WebSocket error (non-critical, ignoring):", errorMessage);
      event.preventDefault(); // Prevent error from showing in console
      return;
    }
    
    // Log other unhandled rejections but don't break the app
    debugError("[Unhandled Rejection]", error);
  });
}

// Mount React app - ensure root element exists
// This function MUST succeed even if other parts fail
const mountReactApp = () => {
  console.log("[main] mountReactApp called");
  
  // Ensure React and ReactDOM are available
  if (typeof React === 'undefined' || typeof ReactDOM === 'undefined') {
    console.error("[main] React or ReactDOM not available!");
    const errorDiv = document.createElement('div');
    errorDiv.innerHTML = '<div style="padding: 20px; color: #ff6b6b;">React libraries not loaded. Check console for errors.</div>';
    document.body.appendChild(errorDiv);
    return;
  }
  
  try {
    const rootElement = document.getElementById("root");
    console.log("[main] Root element:", rootElement ? "found" : "not found");
    if (!rootElement) {
      console.error("[main] Root element not found! Waiting for DOM");
      debugError("[main] Root element not found! Waiting for DOM");
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
            debugLog("[main] React app mounted successfully");
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            const errorStack = error instanceof Error ? error.stack : '';
            console.error("[main] Error mounting React", error);
            debugError("[main] Error mounting React", error);
            // Show error message in panel
            el.innerHTML = `
              <div style="padding: 20px; font-family: system-ui; background: #1e1e1e; color: #ff6b6b;">
                <h2 style="color: #ff6b6b; margin-top: 0;">Error Loading Panel</h2>
                <p>Failed to mount React application.</p>
                <p><strong>Error:</strong> ${errorMsg}</p>
                <pre style="background: #2d2d2d; padding: 10px; border-radius: 4px; overflow-x: auto; color: #fff; font-size: 12px;">${errorStack}</pre>
                <p style="margin-top: 20px;">Check the CEP debug console (Window > Extensions > sync.) for more details.</p>
                <p>If debug mode is enabled, check: ~/Library/Application Support/sync. extensions/logs/</p>
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
        console.log("[main] Creating React root...");
        console.log("[main] App component:", typeof App);
        console.log("[main] ReactDOM:", typeof ReactDOM);
        console.log("[main] React:", typeof React);
        
        if (!App) {
          throw new Error("App component is not available");
        }
        
        const root = ReactDOM.createRoot(rootElement);
        console.log("[main] React root created, rendering App...");
        
        // Use React.createElement as fallback if JSX fails
        try {
          root.render(React.createElement(App));
        } catch (jsxError) {
          console.error("[main] JSX render failed, trying createElement:", jsxError);
          root.render(React.createElement(App));
        }
        
        console.log("[main] React app mounted successfully");
        if (debugLog) debugLog("[main] React app mounted successfully");
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : '';
        console.error("[main] Error mounting React", error);
        debugError("[main] Error mounting React", error);
        // Show error message in panel
        rootElement.innerHTML = `
          <div style="padding: 20px; font-family: system-ui; background: #1e1e1e; color: #ff6b6b;">
            <h2 style="color: #ff6b6b; margin-top: 0;">Error Loading Panel</h2>
            <p>Failed to mount React application.</p>
            <p><strong>Error:</strong> ${errorMsg}</p>
            <pre style="background: #2d2d2d; padding: 10px; border-radius: 4px; overflow-x: auto; color: #fff; font-size: 12px;">${errorStack}</pre>
            <p style="margin-top: 20px;">Check the CEP debug console (Window > Extensions > sync.) for more details.</p>
            <p>If debug mode is enabled, check: ~/Library/Application Support/sync. extensions/logs/</p>
          </div>
        `;
      }
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : '';
    console.error("[main] Fatal error during initialization", error);
    debugError("[main] Fatal error during initialization", error);
    // Last resort - try to show error in body
    try {
      document.body.innerHTML = `
        <div style="padding: 20px; font-family: system-ui; background: #1e1e1e; color: #ff6b6b;">
          <h2 style="color: #ff6b6b; margin-top: 0;">Fatal Error Loading Panel</h2>
          <p><strong>Error:</strong> ${errorMsg}</p>
          <pre style="background: #2d2d2d; padding: 10px; border-radius: 4px; overflow-x: auto; color: #fff; font-size: 12px;">${errorStack}</pre>
          <p style="margin-top: 20px;">Check the CEP debug console (Window > Extensions > sync.) for more details.</p>
          <p>If debug mode is enabled, check: ~/Library/Application Support/sync. extensions/logs/</p>
        </div>
      `;
    } catch (_) {
      // If even this fails, there's nothing we can do
      console.error("[main] Could not display error message");
    }
  }
};

// Start mounting React app - wrap in try-catch to ensure we always show something
try {
  mountReactApp();
} catch (fatalError) {
  console.error("[main] FATAL: mountReactApp failed:", fatalError);
  // Last resort - show error directly in body
  try {
    document.body.innerHTML = `
      <div style="padding: 20px; font-family: system-ui; background: #1e1e1e; color: #ff6b6b;">
        <h2 style="color: #ff6b6b; margin-top: 0;">Fatal Error: React Failed to Mount</h2>
        <p><strong>Error:</strong> ${fatalError instanceof Error ? fatalError.message : String(fatalError)}</p>
        <pre style="background: #2d2d2d; padding: 10px; border-radius: 4px; overflow-x: auto; color: #fff; font-size: 12px;">${fatalError instanceof Error ? fatalError.stack : String(fatalError)}</pre>
        <p style="margin-top: 20px;">Check the CEP debug console for more details.</p>
      </div>
    `;
  } catch (_) {
    console.error("[main] Could not display error message");
  }
}
