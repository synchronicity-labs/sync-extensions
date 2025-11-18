import { useEffect, useCallback, useState } from "react";
import { useHostDetection } from "./useHostDetection";
import { getApiUrl } from "../utils/serverConfig";
import { getHostId as detectHostId } from "../utils/clientHostDetection";
import { HOST_IDS } from "../../../shared/host";
import { debugLog, debugError, debugWarn } from "../utils/debugLog";

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
    // For Resolve, window.nle is set by nle-resolve.js (HTTP-based)
    // For CEP hosts (AEFT/PPRO), use CSInterface-based approach
    if (typeof window === "undefined") {
      return;
    }

    // Check if Resolve (window.nle already set by nle-resolve.js)
    if (hostConfig?.hostId === HOST_IDS.RESOLVE) {
      if (window.nle) {
        setNLE(window.nle);
        return;
      }
      // Wait for nle-resolve.js to load
      const checkInterval = setInterval(() => {
        if (window.nle) {
          setNLE(window.nle);
          clearInterval(checkInterval);
        }
      }, 100);
      return () => clearInterval(checkInterval);
    }

    // Check if FCPX (window.nle already set by nle-fcpx.js)
    if (hostConfig?.hostId === HOST_IDS.FCPX) {
      if (window.nle) {
        setNLE(window.nle);
        return;
      }
      // Wait for nle-fcpx.js to load
      const checkInterval = setInterval(() => {
        if (window.nle) {
          setNLE(window.nle);
          clearInterval(checkInterval);
        }
      }, 100);
      return () => clearInterval(checkInterval);
    }

    // CEP hosts require CSInterface
    // But wait a bit for it to be available (it might load asynchronously)
    if (!window.CSInterface) {
      // Retry after a short delay - CSInterface might not be ready yet
      const checkInterval = setInterval(() => {
        if (window.CSInterface) {
          clearInterval(checkInterval);
          initNLE();
        }
      }, 100);
      // Stop retrying after 5 seconds
      setTimeout(() => clearInterval(checkInterval), 5000);
      return;
    }

    const initNLE = () => {
      const getHostId = (): string => {
        // Use centralized host detection
        if (hostConfig?.hostId) {
          return hostConfig.hostId;
        }
        
        // Try to detect if not already set
        try {
          return detectHostId();
        } catch (error) {
          debugError("[useNLE] Cannot determine host", error);
          // Don't throw - return a default to prevent blocking panel
          // The panel should still work even if host detection fails
          debugWarn("[useNLE] Using fallback host ID - panel may not work correctly");
          return HOST_IDS.PPRO; // Fallback to prevent blocking
        }
      };

      const prefix = () => (getHostId() === HOST_IDS.AEFT ? HOST_IDS.AEFT : HOST_IDS.PPRO);

      const ensureHostLoaded = async (): Promise<void> => {
        try {
          if (!window.CSInterface) return;
          const cs = new window.CSInterface();
          const extPath = cs.getSystemPath(window.CSInterface.SystemPath?.EXTENSION || "EXTENSION");
          const file = "/jsx/index.jsxbin"; // Single JSX entry point
          const escPath = String(extPath + file).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
          
          return new Promise((resolve) => {
            try {
              // Force reload JSX file by clearing any cached version first
              // This ensures we get the latest version even if Premiere cached it
              cs.evalScript("$.evalFile('" + escPath + "')", (result: string) => {
                // Check for errors in result
                if (result && (result.includes("error") || result.includes("Error") || result.includes("27"))) {
                  const errorMsg = `[useNLE] JSX load error (CEP error code 27): ${result}`;
                  debugError(errorMsg);
                  debugError("[useNLE] Extension path", { extPath });
                  debugError("[useNLE] JSX file path", { escPath });
                  // Try to log to debug endpoint if available
                  try {
                    const hostConfig = window.HOST_CONFIG || {};
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
                  debugLog("[useNLE] JSX script loaded successfully");
                }
                resolve();
              });
            } catch (error) {
              debugError("[useNLE] Error loading JSX", error);
              // Try to log to debug endpoint if available
              try {
                const hostConfig = window.HOST_CONFIG || {};
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
          debugError("[useNLE] ensureHostLoaded error", error);
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
              
              const hasPayload = payload !== undefined && payload !== null && (typeof payload === 'object' ? Object.keys(payload).length > 0 : true);
              const payloadJsonStr = hasPayload ? JSON.stringify(payload) : '';
              const payloadStrForCode = hasPayload ? JSON.stringify(payloadJsonStr) : '';
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
                hasPayload ? `      result = host[ns][fnName](${payloadStrForCode});` : "      result = host[ns][fnName]();",
                "      if (typeof result === 'string') return result;",
                "      return JSON.stringify(result);",
                "    }",
                "",
                "    // Try 2: Global function",
                "    if (typeof window[fnName] === 'function') {",
                hasPayload ? `      result = window[fnName](${payloadStrForCode});` : "      result = window[fnName]();",
                "      if (typeof result === 'string') return result;",
                "      return JSON.stringify(result);",
                "    }",
                "",
                "    // Try 3: Direct call",
                "    try {",
                hasPayload ? `      result = eval(fnName + '(' + ${payloadStrForCode} + ')');` : "      result = eval(fnName + '()');",
                "      if (typeof result === 'string') return result;",
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
                  let parsed: any;
                  if (typeof r === 'string') {
                    try {
                      parsed = JSON.parse(r);
                      if (typeof parsed === 'string') {
                        parsed = JSON.parse(parsed);
                      }
                    } catch(e) {
                      parsed = { ok: false, error: 'Parse error: ' + String(e) };
                    }
                  } else {
                    parsed = r;
                  }
                  resolve(parsed);
                } catch (e: any) {
                  debugError(`[useNLE] call parse error for ${fnTail}`, { error: String(e), raw: String(r).substring(0, 500) });
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
        getProjectDir: () => call("getProjectDir"),
        exportInOutVideo: (opts?: any) => call("exportInOutVideo", opts || {}),
        exportInOutAudio: (opts?: any) => call("exportInOutAudio", opts || {}),
        insertFileAtPlayhead: (fsPath?: string) => call("insertFileAtPlayhead", fsPath ? { path: fsPath } : {}),
        importFileToBin: (fsPath?: string, binName?: string) => call("importFileToBin", { path: fsPath, binName: binName || "" }),
        revealFile: (fsPath?: string) => call("revealFile", fsPath ? { path: fsPath } : {}),
        diagInOut: () => call("diagInOut", {}),
      };

      // Expose globally for backward compatibility
      window.nle = nleMethods;
      setNLE(nleMethods);
    };

    initNLE();
  }, [hostConfig]);

  return { nle, hostConfig };
};
