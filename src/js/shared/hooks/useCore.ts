import { useEffect, useState, useCallback, useRef } from "react";
import { useNLE } from "./useNLE";
import { getApiUrl } from "../utils/serverConfig";

interface AuthState {
  token: string;
  isAuthenticated: boolean;
}

interface ServerState {
  isOnline: boolean;
  isOffline: boolean;
  consecutiveFailures: number;
}

export const useCore = () => {
  const { nle } = useNLE();
  const [authState, setAuthState] = useState<AuthState>({ token: "", isAuthenticated: false });
  const [serverState, setServerState] = useState<ServerState>({
    isOnline: false,
    isOffline: false,
    consecutiveFailures: 0,
  });
  const serverStartupTime = useRef<number>(Date.now());
  const offlineCheckInterval = useRef<NodeJS.Timeout | null>(null);
  const MAX_FAILURES = 3;

  // Debug logging helper
  const debugLog = useCallback((type: string, payload?: any) => {
    try {
      const timestamp = new Date().toISOString();
      const host = (window as any).HOST_CONFIG?.hostId || "unknown";
      
      const importantEvents = [
        "core_loaded",
        "ui_loaded",
        "lipsync_button_clicked",
        "video_record_clicked",
        "audio_record_clicked",
        "renderInputPreview_called",
        "upload_complete",
        "cost_estimation_no_files",
        "cost_api_request_start",
        "lipsync_start",
        "lipsync_abort_missing_files",
        "lipsync_abort_no_api_key",
        "lipsync_button_setup",
        "lipsync_function_missing",
        "lipsync_button_update",
      ];
      
      if (importantEvents.includes(type)) {
        const hostConfig = (window as any).HOST_CONFIG || {};
        const logData = {
          type,
          timestamp,
          host,
          hostConfig,
          ...payload,
        };
        
        fetch(getApiUrl("/debug"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(logData),
        }).catch(() => {});
      }
    } catch (_) {}
  }, []);

  // Fetch with timeout
  const fetchWithTimeout = useCallback(
    async (url: string, options: RequestInit = {}, timeoutMs: number = 10000): Promise<Response> => {
      if (typeof AbortController === "undefined") {
        return fetch(url, options);
      }
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      
      try {
        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        return response;
      } catch (error: any) {
        clearTimeout(timeoutId);
        if (error.name === "AbortError") {
          throw new Error("Request timeout");
        }
        throw error;
      }
    },
    []
  );

  // Check server status
  const checkServerStatus = useCallback(async (): Promise<boolean> => {
    const currentHost = window.location.hostname;
    const currentPort = window.location.port;
    const isSimpleHttpServer = currentHost === "localhost" || currentHost === "127.0.0.1";
    
    if (isSimpleHttpServer && currentPort && currentPort !== "3000" && currentPort !== "") {
      if (serverState.isOffline) {
        setServerState((prev) => ({ ...prev, isOffline: false }));
      }
      return true;
    }
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      
      const response = await fetch(getApiUrl("/health"), {
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (response && response.ok) {
        setServerState((prev) => ({
          ...prev,
          isOnline: true,
          isOffline: false,
          consecutiveFailures: 0,
        }));
        return true;
      }
    } catch (error: any) {
      const isActualConnectionError =
        error.message &&
        (error.message.includes("ECONNREFUSED") ||
          error.message.includes("Failed to fetch") ||
          error.message.includes("network error"));
      
      if (isActualConnectionError) {
        setServerState((prev) => ({
          ...prev,
          consecutiveFailures: prev.consecutiveFailures + 1,
        }));
      }
    }
    
    // Show offline state after 10 seconds of startup AND actual connection failures
    if (Date.now() - serverStartupTime.current > 10000) {
      setServerState((prev) => ({
        ...prev,
        isOffline: prev.consecutiveFailures >= MAX_FAILURES,
      }));
    }
    
    return false;
  }, [serverState.isOffline]);

  // Ensure auth token
  const ensureAuthToken = useCallback(async (): Promise<string> => {
    if (authState.token) return authState.token;
    
    try {
      const r = await fetchWithTimeout(
        getApiUrl("/auth/token"),
        {
          headers: { "X-CEP-Panel": "sync" },
        },
        5000
      );
      const j = await r.json().catch(() => null);
      if (r.ok && j && j.token) {
        setAuthState({ token: j.token, isAuthenticated: true });
        return j.token;
      }
    } catch (_) {}
    
    return "";
  }, [authState.token, fetchWithTimeout]);

  // Auth headers helper - can accept optional token parameter to avoid race conditions
  const authHeaders = useCallback(
    (extra?: Record<string, string>, tokenOverride?: string): Record<string, string> => {
      const h = { ...(extra || {}) };
      h["X-CEP-Panel"] = "sync";
      const token = tokenOverride || authState.token;
      if (token) {
        h["x-auth-token"] = token;
      }
      return h;
    },
    [authState.token]
  );

  // Start offline checking
  const startOfflineChecking = useCallback(() => {
    if (offlineCheckInterval.current) return;
    
    checkServerStatus();
    offlineCheckInterval.current = setInterval(checkServerStatus, 5000);
  }, [checkServerStatus]);

  // Stop offline checking
  const stopOfflineChecking = useCallback(() => {
    if (offlineCheckInterval.current) {
      clearInterval(offlineCheckInterval.current);
      offlineCheckInterval.current = null;
    }
  }, []);

  // Update bottom bar model display
  const updateModelDisplay = useCallback(() => {
    const modelEl = document.getElementById("currentModel");
    if (modelEl) {
      const settings = JSON.parse(localStorage.getItem("syncSettings") || "{}");
      const model = settings.model || "lipsync-2-pro";
      
      const modelDisplayMap: Record<string, string> = {
        "lipsync-1.9.0-beta": "lipsync 1.9",
        "lipsync-2": "lipsync 2",
        "lipsync-2-pro": "lipsync 2 pro",
        "lipsync 2 pro": "lipsync 2 pro",
        "lipsync 1.9": "lipsync 1.9",
      };
      
      const displayName = modelDisplayMap[model] || model.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
      modelEl.textContent = displayName;
    }
  }, []);

  useEffect(() => {
    debugLog("core_loaded");
    
    // Expose functions globally for backward compatibility
    (window as any).debugLog = debugLog;
    (window as any).updateModelDisplay = updateModelDisplay;
    (window as any).updateBottomBarModelDisplay = updateModelDisplay;
    (window as any).ensureAuthToken = ensureAuthToken;
    (window as any).authHeaders = authHeaders;
    (window as any).getServerPort = () => {
      const { getServerPort } = require("../utils/serverConfig");
      return getServerPort();
    };
    (window as any).isOffline = serverState.isOffline;
    
    // Start offline checking
    startOfflineChecking();
    
    // Initial auth token fetch
    ensureAuthToken();
    
    return () => {
      stopOfflineChecking();
    };
  }, [debugLog, updateModelDisplay, ensureAuthToken, authHeaders, startOfflineChecking, stopOfflineChecking, serverState.isOffline]);

  return {
    debugLog,
    fetchWithTimeout,
    checkServerStatus,
    ensureAuthToken,
    authHeaders,
    updateModelDisplay,
    serverState,
    authState,
    startOfflineChecking,
    stopOfflineChecking,
  };
};
