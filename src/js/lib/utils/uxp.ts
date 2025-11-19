// UXP Communication Layer
// UXP host scripts are JavaScript modules that can be imported

/**
 * Call a function in the UXP host script
 * In UXP, host scripts are loaded as modules and can be called directly
 */
export async function callUXPFunction<T = any>(
  functionName: string,
  ...args: any[]
): Promise<T> {
  try {
    // UXP host scripts are available via require or import
    // The host script is loaded as a module with the namespace
    const ns = "com.sync.extension";
    
    // Try to get the host script module
    let hostModule: any;
    try {
      // In UXP, host scripts are available via the extension's main module
      hostModule = require("../../uxp/index");
    } catch (e) {
      // Fallback: try to access via window/global
      const host = typeof window !== "undefined" ? (window as any) : (global as any);
      hostModule = host[ns];
    }
    
    if (!hostModule) {
      throw new Error(`Host script module not found for namespace: ${ns}`);
    }
    
    // Call the function
    const fn = hostModule[functionName];
    if (typeof fn !== "function") {
      throw new Error(`Function ${functionName} not found in host script`);
    }
    
    const result = await fn(...args);
    
    // Parse JSON response if it's a string
    if (typeof result === "string") {
      try {
        return JSON.parse(result) as T;
      } catch (e) {
        return result as T;
      }
    }
    
    return result as T;
  } catch (error) {
    console.error(`[callUXPFunction] Error calling ${functionName}:`, error);
    throw error;
  }
}

/**
 * Get host application information
 */
export function getHostInfo() {
  try {
    const uxp = require("uxp");
    if (uxp && uxp.host && uxp.host.app) {
      return {
        app: uxp.host.app.name || "unknown",
        version: uxp.host.app.version || "unknown",
      };
    }
  } catch (e) {
    // UXP not available
  }
  
  return {
    app: "unknown",
    version: "unknown",
  };
}

/**
 * Open URL in default browser (UXP)
 */
export async function openLinkInBrowser(url: string) {
  try {
    const { shell } = require("uxp");
    if (shell && shell.openExternal) {
      await shell.openExternal(url);
      return;
    }
  } catch (e) {
    // UXP shell API not available
  }
  
  // Fallback to window.open
  window.open(url, "_blank");
}

/**
 * Get extension root path
 */
export async function getExtensionRoot(): Promise<string> {
  try {
    const { storage } = require("uxp");
    if (storage && storage.localFileSystem) {
      const fs = storage.localFileSystem;
      const pluginFolder = await fs.getPluginFolder();
      return pluginFolder.nativePath;
    }
  } catch (e) {
    console.error("[getExtensionRoot] Error:", e);
  }
  
  return "";
}
