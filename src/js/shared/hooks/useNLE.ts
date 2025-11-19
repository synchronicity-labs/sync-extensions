import { useEffect, useCallback, useState } from "react";
import { useHostDetection } from "./useHostDetection";
import { getApiUrl } from "../utils/serverConfig";
import { getHostId as detectHostId } from "../utils/clientHostDetection";
import { HOST_IDS } from "../../../shared/host";
import { debugLog, debugError, debugWarn } from "../utils/debugLog";
import { callUXPFunction } from "../../lib/utils/uxp";

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
    // Initialize NLE adapter for UXP
    if (typeof window === "undefined") {
      return;
    }

    // Check if Resolve (window.nle already set by nle-resolve.js)
    if (hostConfig?.hostId === HOST_IDS.RESOLVE) {
      if (window.nle) {
        setNLE(window.nle);
        return;
      }
      const checkInterval = setInterval(() => {
        if (window.nle) {
          setNLE(window.nle);
          clearInterval(checkInterval);
        }
      }, 100);
      return () => clearInterval(checkInterval);
    }

    // UXP hosts (AEFT/PPRO)
    const initNLE = () => {
      const getHostId = (): string => {
        if (hostConfig?.hostId) {
          return hostConfig.hostId;
        }
        
        try {
          return detectHostId();
        } catch (error) {
          debugError("[useNLE] Cannot determine host", error);
          debugWarn("[useNLE] Using fallback host ID - panel may not work correctly");
          return HOST_IDS.PPRO;
        }
      };

      const prefix = () => (getHostId() === HOST_IDS.AEFT ? HOST_IDS.AEFT : HOST_IDS.PPRO);

      const ensureHostLoaded = async (): Promise<void> => {
        try {
          // UXP host scripts are loaded automatically
          // We just need to verify they're available
          debugLog("[useNLE] UXP host script available");
        } catch (error) {
          debugError("[useNLE] Error loading UXP host script", error);
        }
      };

      const call = async (fnTail: string, payload?: any): Promise<any> => {
        try {
          await ensureHostLoaded();
          const fn = prefix() + "_" + fnTail;
          
          // Call UXP host script function
          const payloadJson = payload ? JSON.stringify(payload) : "{}";
          return await callUXPFunction(fn, payloadJson);
        } catch (e) {
          debugError(`[useNLE] Error calling ${fnTail}`, e);
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

    // Wait a bit for UXP to be ready
    const timer = setTimeout(() => {
      initNLE();
    }, 100);

    return () => clearTimeout(timer);
  }, [hostConfig]);

  return { nle, hostConfig };
};
