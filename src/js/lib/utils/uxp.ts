// UXP Communication Layer
// UXP host scripts communicate via UXP messaging APIs

/**
 * Call a function in the UXP host script
 * In UXP, host scripts are loaded as modules and functions can be called directly
 */
export async function callUXPFunction<T = any>(
  functionName: string,
  ...args: any[]
): Promise<T> {
  try {
    // UXP host scripts are available via the communication API
    // First try to get host script via communication API
    try {
      const { communication } = require("uxp");
      if (communication) {
        const hostScript = communication.getHostScript?.();
        if (hostScript && typeof hostScript[functionName] === "function") {
          const result = await hostScript[functionName](...args);
          if (typeof result === "string") {
            try {
              return JSON.parse(result) as T;
            } catch (e) {
              return result as T;
            }
          }
          return result as T;
        }
      }
    } catch (e) {
      // Communication API not available, try next method
    }
    
    // Fallback: Try to access via namespace
    const ns = "com.sync.extension";
    const host = typeof window !== "undefined" ? (window as any) : (typeof global !== "undefined" ? (global as any) : {});
    const hostModule = host[ns];
    
    if (hostModule && typeof hostModule[functionName] === "function") {
      const result = await hostModule[functionName](...args);
      if (typeof result === "string") {
        try {
          return JSON.parse(result) as T;
        } catch (e) {
          return result as T;
        }
      }
      return result as T;
    }
    
    // Try direct function access
    if (typeof host[functionName] === "function") {
      const result = await host[functionName](...args);
      if (typeof result === "string") {
        try {
          return JSON.parse(result) as T;
        } catch (e) {
          return result as T;
        }
      }
      return result as T;
    }
    
    throw new Error(`Function ${functionName} not found in host script`);
  } catch (error) {
    console.error(`[callUXPFunction] Error calling ${functionName}:`, error);
    // Return error response instead of throwing
    return { ok: false, error: String(error) } as T;
  }
}

/**
 * Get host application information
 */
export function getHostInfo() {
  try {
    if (typeof window !== "undefined") {
      const uxp = (window as any).require?.("uxp");
      if (uxp && uxp.host && uxp.host.app) {
        return {
          app: uxp.host.app.name || "unknown",
          version: uxp.host.app.version || "unknown",
        };
      }
      
      // Check HOST_CONFIG
      if ((window as any).HOST_CONFIG) {
        return {
          app: (window as any).HOST_CONFIG.hostName || "unknown",
          version: "unknown",
        };
      }
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
    if (typeof window !== "undefined") {
      const { shell } = (window as any).require?.("uxp");
      if (shell && shell.openExternal) {
        await shell.openExternal(url);
        return;
      }
    }
  } catch (e) {
    // UXP shell API not available
  }
  
  // Fallback to window.open
  if (typeof window !== "undefined") {
    window.open(url, "_blank");
  }
}

/**
 * Get extension root path
 */
export async function getExtensionRoot(): Promise<string> {
  try {
    if (typeof window !== "undefined") {
      const { storage } = (window as any).require?.("uxp");
      if (storage && storage.localFileSystem) {
        const fs = storage.localFileSystem;
        const pluginFolder = await fs.getPluginFolder();
        return pluginFolder.nativePath;
      }
    }
  } catch (e) {
    console.error("[getExtensionRoot] Error:", e);
  }
  
  return "";
}
