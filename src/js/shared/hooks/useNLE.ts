import { useEffect, useCallback, useState } from "react";
import { useHostDetection } from "./useHostDetection";

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
  const [serverPort, setServerPort] = useState<number>(3000);
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
          
          cs.evalScript("$.evalFile('" + escPath + "')", () => {
            // Host script loaded
          });
        } catch (_) {}
      };

      const call = async (fnTail: string, payload?: any): Promise<any> => {
        try {
          await ensureHostLoaded();
          const fn = prefix() + "_" + fnTail;
          
          return new Promise((resolve) => {
            try {
              const cs = new window.CSInterface();
              const arg = JSON.stringify(payload || {}).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
              const code = fn + "(" + JSON.stringify(arg) + ")";
              cs.evalScript(code, (r: string) => {
                try {
                  resolve(JSON.parse(r || "{}"));
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

  return { nle, serverPort };
};
