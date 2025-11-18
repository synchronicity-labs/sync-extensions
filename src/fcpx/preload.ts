// Preload script for FCPX Workflow Extension
// Exposes safe APIs to the renderer process
// Note: FCPX extensions run in a web view, so we may not need IPC like Electron
// This is a placeholder for potential future IPC needs

// For FCPX, the extension runs directly in the web view context
// FCPX APIs should be available directly via window.fcpx
// This file can be used to set up any necessary bridges or polyfills

(function() {
  // Set up FCPX API bridge if needed
  // The actual FCPX JavaScript APIs would be exposed by Final Cut Pro
  // This is a placeholder structure
  
  if (typeof window !== 'undefined') {
    // Ensure fcpxAPI exists for compatibility with nle-fcpx.ts
    if (!window.fcpxAPI) {
      window.fcpxAPI = {
        showOpenDialog: async (options: any) => {
          // Try to use FCPX's native file dialog if available
          if (window.fcpx && window.fcpx.showFileDialog) {
            return await window.fcpx.showFileDialog(options);
          }
          // Fallback: return error
          return { canceled: true, filePaths: [] };
        },
        getApiKey: async () => {
          // Get API key from localStorage
          try {
            return localStorage.getItem('apiKey') || '';
          } catch {
            return '';
          }
        },
        setApiKey: async (key: string) => {
          // Save API key to localStorage
          try {
            localStorage.setItem('apiKey', key);
          } catch {
            // Ignore errors
          }
        }
      };
    }
  }
})();

