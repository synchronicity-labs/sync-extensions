import { useEffect, useCallback, useState } from "react";
import { useHostDetection } from "./useHostDetection";
import { getApiUrl } from "../utils/serverConfig";

interface NLEMethods {
  getHostId: () => string;
  loadHostScript: () => Promise<void>;
  startBackend: () => Promise<any>;
  getProjectDir: () => Promise<any>;
  exportInOutVideo: (opts?: any) => Promise<any>;
  exportInOutAudio: (opts?: any) => Promise<any>;
  insertFileAtPlayhead: (fsPath?: string) => Promise<any>;
  importFileToBin: (fsPath?: string, binName?: string) => Promise<any>;
  revealFile: (fsPath?: string) => Promise<any>;
  diagInOut: () => Promise<any>;
}

export const useNLE = () => {
  const { hostConfig } = useHostDetection();
  const [nle, setNLE] = useState<NLEMethods | null>(null);

  useEffect(() => {
    // Initialize NLE adapter
    if (typeof window === "undefined" || !window.CSInterface) {
      return;
    }

    const initNLE = () => {
      const getHostId = (): string => {
        try {
          if ((window as any).__forceHostId === "AEFT" || (window as any).__forceHostId === "PPRO") {
            return (window as any).__forceHostId;
          }
        } catch (_) {}
        
        if (hostConfig?.hostId) {
          return hostConfig.hostId;
        }
        
        try {
          if (!window.CSInterface) return "PPRO";
          const cs = new window.CSInterface();
          const env = cs.getHostEnvironment?.();
          const appName = (env?.appName || "").toUpperCase();
          const appId = (env?.appId || "").toUpperCase();
          if (appId.indexOf("AEFT") !== -1 || appName.indexOf("AFTER EFFECTS") !== -1) return "AEFT";
          if (appId.indexOf("PPRO") !== -1 || appName.indexOf("PREMIERE") !== -1) return "PPRO";
        } catch (_) {}
        
        return "PPRO";
      };

      const prefix = () => (getHostId() === "AEFT" ? "AEFT" : "PPRO");

      const ensureHostLoaded = async (): Promise<void> => {
        try {
          if (!window.CSInterface) return;
          const cs = new window.CSInterface();
          const extPath = cs.getSystemPath((window as any).CSInterface.SystemPath.EXTENSION);
          const file = "/jsx/index.jsxbin"; // Single JSX entry point
          const escPath = String(extPath + file).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
          
          return new Promise((resolve) => {
            try {
              cs.evalScript("$.evalFile('" + escPath + "')", (result: string) => {
                // Check for errors in result
                if (result && (result.includes("error") || result.includes("Error") || result.includes("27"))) {
                  const errorMsg = `[useNLE] JSX load error (CEP error code 27): ${result}`;
                  console.error(errorMsg);
                  console.error("[useNLE] Extension path:", extPath);
                  console.error("[useNLE] JSX file path:", escPath);
                  // Try to log to debug endpoint if available
                  try {
                    const hostConfig = (window as any).HOST_CONFIG || {};
                    fetch(getApiUrl("/debug"), {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        message: errorMsg,
                        extPath,
                        file,
                        escPath,
                        timestamp: new Date().toISOString(),
                        hostConfig,
                        cepError: "Error code 27 - JSX script failed to execute",
                      }),
                    }).catch(() => {});
                  } catch (_) {}
                } else {
                  console.log("[useNLE] JSX script loaded successfully");
                }
                resolve();
              });
            } catch (error) {
              console.error("[useNLE] Error loading JSX:", error);
              // Try to log to debug endpoint if available
              try {
                const hostConfig = (window as any).HOST_CONFIG || {};
                fetch(getApiUrl("/debug"), {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    message: `[useNLE] Error loading JSX: ${String(error)}`,
                    extPath,
                    file,
                    timestamp: new Date().toISOString(),
                    hostConfig,
                  }),
                }).catch(() => {});
              } catch (_) {}
              resolve();
            }
          });
        } catch (error) {
          console.error("[useNLE] ensureHostLoaded error:", error);
        }
      };

      const call = async (fnTail: string, payload?: any): Promise<any> => {
        try {
          await ensureHostLoaded();
          const fn = prefix() + "_" + fnTail;
          const ns = "com.sync.extension";
          
          return new Promise((resolve) => {
            try {
              const cs = new window.CSInterface();
              const arg = JSON.stringify(payload || {}).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
              
              const code = [
                "(function(){",
                "  try {",
                "    var host = typeof $ !== 'undefined' ? $ : window;",
                "    var ns = '" + ns + "';",
                "    var fnName = '" + fn + "';",
                "    var result;",
                "",
                "    // Try 1: host[ns][fn]",
                "    if (host && host[ns] && typeof host[ns][fnName] === 'function') {",
                "      result = host[ns][fnName](" + JSON.stringify(payload || {}) + ");",
                "      return JSON.stringify(result);",
                "    }",
                "",
                "    // Try 2: Global function",
                "    if (typeof window[fnName] === 'function') {",
                "      result = window[fnName](" + JSON.stringify(payload || {}) + ");",
                "      return JSON.stringify(result);",
                "    }",
                "",
                "    // Try 3: Direct call",
                "    try {",
                "      result = eval(fnName + '(' + " + JSON.stringify(JSON.stringify(payload || {})) + " + ')');",
                "      return JSON.stringify(result);",
                "    } catch(e3) {}",
                "",
                "    return JSON.stringify({ok: false, error: 'Function ' + fnName + ' not found'});",
                "  } catch(e) {",
                "    return JSON.stringify({ok: false, error: String(e)});",
                "  }",
                "})()"
              ].join("\n");
              
              cs.evalScript(code, (r: string) => {
                try {
                  const parsed = typeof r === 'string' ? JSON.parse(r || "{}") : r;
                  resolve(parsed);
                } catch (_) {
                  resolve({ ok: false, error: String(r || "no response") });
                }
              });
            } catch (e) {
              resolve({ ok: false, error: String(e) });
            }
          });
        } catch (e) {
          return { ok: false, error: String(e) };
        }
      };

      const nleMethods: NLEMethods = {
        getHostId: () => getHostId(),
        loadHostScript: ensureHostLoaded,
        startBackend: () => call("startBackend", {}),
        getProjectDir: () => call("getProjectDir", {}),
        exportInOutVideo: (opts?: any) => call("exportInOutVideo", opts || {}),
        exportInOutAudio: (opts?: any) => call("exportInOutAudio", opts || {}),
        insertFileAtPlayhead: (fsPath?: string) => call("insertFileAtPlayhead", fsPath ? { path: fsPath } : {}),
        importFileToBin: (fsPath?: string, binName?: string) => call("importFileToBin", { path: fsPath, binName: binName || "" }),
        revealFile: (fsPath?: string) => call("revealFile", fsPath ? { path: fsPath } : {}),
        diagInOut: () => call("diagInOut", {}),
      };

      // Expose globally for backward compatibility
      (window as any).nle = nleMethods;
      setNLE(nleMethods);
    };

    initNLE();
  }, [hostConfig]);

  return { nle };
};
