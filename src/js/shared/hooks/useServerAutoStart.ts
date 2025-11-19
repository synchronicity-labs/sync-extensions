import { useEffect } from "react";
import { useCore } from "./useCore";
import { useNLE } from "./useNLE";
import { getApiUrl } from "../utils/serverConfig";

// Server auto-start functionality (UXP)
export const useServerAutoStart = () => {
  const { nle } = useNLE();

  useEffect(() => {
    // UXP doesn't require CSInterface check
    if (typeof window === "undefined") {
      return;
    }

    const logDebug = async (message: string, data?: any) => {
      try {
        const hostConfig = window.HOST_CONFIG || {};
        const logData = {
          message: `[useServerAutoStart] ${message}`,
          data,
          timestamp: new Date().toISOString(),
          hostConfig,
        };
        
        // Try to log to server debug endpoint (but don't wait for it)
        fetch(getApiUrl("/debug"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(logData),
        }).catch(() => {});
      } catch (_) {}
    };

    const startServer = async () => {
      await logDebug("startServer_called");
      
      try {
        // Check if server is already running
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);
        try {
          const response = await fetch(getApiUrl("/health"), {
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
          if (response.ok) {
            await logDebug("server_already_running");
            return; // Server already running
          }
        } catch (fetchError: any) {
          clearTimeout(timeoutId);
          if (fetchError.name === 'AbortError') {
            throw new Error("Server health check timeout");
          }
          throw fetchError;
        }
      } catch (error) {
        await logDebug("server_not_running", { error: String(error) });
      }

      // Try to start server via NLE
      const windowNLE = window.nle;
      await logDebug("checking_nle", { 
        nle: !!nle, 
        windowNLE: !!windowNLE
      });
      
      if (!nle && !windowNLE) {
        await logDebug("nle_not_available", { 
          message: "NLE object is null - retrying...",
          nle: nle,
          windowNLE: windowNLE
        });
        setTimeout(() => {
          startServer();
        }, 3000);
        return;
      }
      
      const nleToUse = nle || windowNLE;
      
      if (!nleToUse.startBackend) {
        await logDebug("startBackend_not_available", { 
          message: "startBackend function missing",
          nleKeys: nleToUse ? Object.keys(nleToUse) : []
        });
        return;
      }
      
      try {
        await logDebug("calling_startBackend");
        const result = await nleToUse.startBackend();
        await logDebug("startBackend_result", result);
        
        if (!result || !result.ok) {
          await logDebug("startBackend_failed", { error: result?.error || "Unknown error", result });
          return;
        }
        
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Verify server actually started
        try {
          const healthController = new AbortController();
          const healthTimeoutId = setTimeout(() => healthController.abort(), 3000);
          try {
            const healthCheck = await fetch(getApiUrl("/health"), {
              signal: healthController.signal,
            });
            clearTimeout(healthTimeoutId);
            if (healthCheck.ok) {
              await logDebug("server_started_successfully");
            } else {
              await logDebug("server_not_responding_after_start");
            }
          } catch (healthError: any) {
            clearTimeout(healthTimeoutId);
            if (healthError.name === 'AbortError') {
              await logDebug("server_health_check_timeout_after_start");
            } else {
              throw healthError;
            }
          }
        } catch (error) {
          await logDebug("server_health_check_failed_after_start", { error: String(error) });
        }
      } catch (error) {
        await logDebug("startBackend_exception", { error: String(error) });
      }
    };

    const timer = setTimeout(() => {
      startServer();
    }, 2000);

    return () => {
      clearTimeout(timer);
    };
  }, [nle]);
};
