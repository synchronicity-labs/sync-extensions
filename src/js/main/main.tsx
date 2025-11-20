(function() {
  console.log('[main] IIFE executing immediately');
  
  if (!window.console) {
    (window as any).console = {
      log: function() {},
      error: function() {},
      warn: function() {},
      info: function() {}
    };
  }
  
  console.log('[main] Module script loaded and executing');
  console.log('[main] Window ready state:', typeof window !== 'undefined');
  console.log('[main] Document ready state:', typeof document !== 'undefined' ? document.readyState : 'undefined');
  
  if (typeof window.__html_script_executed === 'undefined') {
    console.error('[main] CRITICAL: HTML script block did not execute before module!');
  }
})();

import { debugLog, debugError, debugWarn } from "../shared/utils/debugLog";

(function() {
  debugLog('[main] Extension initializing');
  debugLog('[main] CEP available', { available: typeof (window as any).__adobe_cep__ !== 'undefined' });
  debugLog('[main] CSInterface available', { available: typeof (window as any).CSInterface !== 'undefined' });
  debugLog('[main] User agent', { userAgent: navigator.userAgent });
  debugLog('[main] Document ready state', { readyState: document.readyState });
  
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

import "../lib/CSInterface";
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
import { initBolt } from "../lib/utils/bolt";

let boltInitRetries = 0;
const MAX_BOLT_INIT_RETRIES = 50;

const initializeBoltWhenReady = () => {
  if (typeof window !== "undefined" && (window as any).cep && (window as any).__adobe_cep__) {
    try {
      initBolt();
    } catch (error) {
      debugError("[main] Error initializing Bolt", error);
    }
  } else {
    boltInitRetries++;
    if (boltInitRetries < MAX_BOLT_INIT_RETRIES) {
      setTimeout(initializeBoltWhenReady, 100);
    } else {
      debugWarn("[main] CEP not available after max retries - panel will still render");
    }
  }
};

initializeBoltWhenReady();

if (import.meta.hot) {
  try {
    import.meta.hot.accept();
    
    import.meta.hot.on("vite:ws:disconnect", () => {
      debugWarn("[HMR] WebSocket disconnected - HMR may not work until reconnection");
    });
    
    import.meta.hot.on("vite:ws:connect", () => {
      debugLog("[HMR] WebSocket connected - hot reload active");
    });
    
    import.meta.hot.on("vite:error", (error) => {
      debugError("[HMR] Critical error during update", error);
      setTimeout(() => {
        if (typeof window !== "undefined" && window.location) {
          window.location.reload();
        }
      }, 500);
    });
  } catch (error) {
    debugWarn("[HMR] Error setting up HMR (non-critical)", error);
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("unhandledrejection", (event) => {
    const error = event.reason;
    const errorMessage = error?.message || String(error);
    
    if (errorMessage.includes("WebSocket") || 
        errorMessage.includes("websocket") ||
        errorMessage.includes("closed without opened")) {
      debugWarn("[HMR] WebSocket error (non-critical, ignoring):", errorMessage);
      event.preventDefault();
      return;
    }
    
    debugError("[Unhandled Rejection]", error);
  });
}

const mountReactApp = () => {
  debugLog('[main] mountReactApp called');
  
  if (typeof React === 'undefined' || typeof ReactDOM === 'undefined') {
    debugError('[main] React or ReactDOM not available', { react: typeof React, reactDOM: typeof ReactDOM });
    const errorDiv = document.createElement('div');
    errorDiv.innerHTML = '<div style="padding: 20px; color: #ff6b6b;">React libraries not loaded. Check console for errors.</div>';
    document.body.appendChild(errorDiv);
    return;
  }
  
  debugLog('[main] React libraries available', { react: typeof React, reactDOM: typeof ReactDOM });
  
  try {
    const rootElement = document.getElementById("root");
    debugLog('[main] Root element check', { found: !!rootElement, body: !!document.body, html: !!document.documentElement });
    
    if (!rootElement) {
      debugError('[main] Root element not found - waiting for DOM');
      const waitForRoot = () => {
        const el = document.getElementById("root");
        if (el) {
          try {
            debugLog('[main] Root element found, creating React root');
            const root = ReactDOM.createRoot(el);
            debugLog('[main] React root created, rendering App component');
            root.render(
              <App />
            );
            debugLog('[main] React render() called successfully');
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            const errorStack = error instanceof Error ? error.stack : '';
            debugError('[main] Error mounting React after wait', error);
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
      try {
        debugLog('[main] Root element found, creating React root');
        debugLog('[main] Component availability', { app: typeof App, reactDOM: typeof ReactDOM, react: typeof React });
        
        if (!App) {
          throw new Error("App component is not available");
        }
        
        const root = ReactDOM.createRoot(rootElement);
        debugLog('[main] React root created, rendering App component');
        
        try {
          debugLog('[main] Calling root.render() with App component');
          root.render(React.createElement(App));
          debugLog('[main] root.render() completed without throwing');
          
          setTimeout(() => {
            const rootEl = document.getElementById("root");
            const hasChildren = rootEl && rootEl.children.length > 0;
            const computedStyle = rootEl ? window.getComputedStyle(rootEl) : null;
            
            debugLog('[main] Post-render DOM check', { 
              rootExists: !!rootEl, 
              childrenCount: rootEl?.children.length || 0,
              display: computedStyle?.display || 'unknown',
              visibility: computedStyle?.visibility || 'unknown',
              opacity: computedStyle?.opacity || 'unknown',
              height: computedStyle?.height || 'unknown',
              innerHTML: rootEl?.innerHTML?.substring(0, 200) || 'empty'
            });
            
            if (!hasChildren && rootEl) {
              debugError('[main] React render() called but DOM is empty - forcing visible content', { 
                rootExists: !!rootEl,
                innerHTML: rootEl?.innerHTML || 'null'
              });
              rootEl.innerHTML = '<div style="padding: 20px; color: #333; font-family: system-ui;">React mounted but no content rendered. Check console for errors.</div>';
              rootEl.style.display = 'block';
              rootEl.style.visibility = 'visible';
              rootEl.style.opacity = '1';
            } else if (hasChildren) {
              debugLog('[main] React app mounted successfully - DOM has children');
            }
          }, 500);
        } catch (renderError) {
          debugError('[main] Error during React render', renderError);
          rootElement.innerHTML = `<div style="padding: 20px; font-family: system-ui; background: #1e1e1e; color: #ff6b6b;"><h2 style="color: #ff6b6b; margin-top: 0;">React Render Error</h2><p><strong>Error:</strong> ${renderError instanceof Error ? renderError.message : String(renderError)}</p><pre style="background: #2d2d2d; padding: 10px; border-radius: 4px; overflow-x: auto; color: #fff; font-size: 12px;">${renderError instanceof Error ? renderError.stack : String(renderError)}</pre></div>`;
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : '';
        debugError('[main] Error mounting React', error);
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
    debugError('[main] Fatal error during initialization', error);
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
      console.error("[main] Could not display error message");
    }
  }
};

try {
  debugLog('[main] Calling mountReactApp()');
  mountReactApp();
  (window as any).__react_mounted = true;
  debugLog('[main] mountReactApp() completed');
} catch (fatalError) {
  debugError('[main] FATAL: mountReactApp failed', fatalError);
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
