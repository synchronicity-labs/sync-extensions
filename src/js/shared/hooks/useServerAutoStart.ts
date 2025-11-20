import { useEffect } from "react";
import { useCore } from "./useCore";
import { useNLE } from "./useNLE";
import { getApiUrl } from "../utils/serverConfig";

// Server auto-start functionality
export const useServerAutoStart = () => {
  const { nle } = useNLE();

  useEffect(() => {
    if (typeof window === "undefined" || !window.CSInterface) {
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

    let retryCount = 0;
    const MAX_RETRIES = 10; // Retry up to 10 times (30 seconds total)
    let retryTimer: NodeJS.Timeout | null = null;

    const startServer = async (): Promise<void> => {
      await logDebug("startServer_called", { retryCount });
      
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
            // Server not running, continue to start it
          } else {
            // Network error - might be server not started yet
          }
        }
      } catch (error) {
        await logDebug("server_health_check_error", { error: String(error) });
      }

      // Try to start server via NLE
      const windowNLE = window.nle;
      await logDebug("checking_nle", { 
        nle: !!nle, 
        windowNLE: !!windowNLE,
        retryCount
      });
      
      if (!nle && !windowNLE) {
        retryCount++;
        if (retryCount < MAX_RETRIES) {
          await logDebug("nle_not_available_retrying", { 
            message: "NLE object is null - retrying...",
            retryCount,
            maxRetries: MAX_RETRIES
          });
          retryTimer = setTimeout(() => {
            startServer();
          }, 3000);
          return;
        } else {
          await logDebug("nle_not_available_max_retries", { 
            message: "NLE object still not available after max retries",
            retryCount
          });
          return;
        }
      }
      
      const nleToUse = nle || windowNLE;
      
      if (!nleToUse.startBackend) {
        retryCount++;
        if (retryCount < MAX_RETRIES) {
          await logDebug("startBackend_not_available_retrying", { 
            message: "startBackend function missing - retrying...",
            retryCount,
            nleKeys: nleToUse ? Object.keys(nleToUse) : []
          });
          retryTimer = setTimeout(() => {
            startServer();
          }, 3000);
          return;
        } else {
          await logDebug("startBackend_not_available_max_retries", { 
            message: "startBackend function still missing after max retries",
            retryCount
          });
          return;
        }
      }
      
      try {
        await logDebug("calling_startBackend");
        const result = await nleToUse.startBackend();
        await logDebug("startBackend_result", result);
        
        if (!result || !result.ok) {
          retryCount++;
          if (retryCount < MAX_RETRIES) {
            await logDebug("startBackend_failed_retrying", { 
              error: result?.error || "Unknown error", 
              result,
              retryCount
            });
            retryTimer = setTimeout(() => {
              startServer();
            }, 3000);
            return;
          } else {
            await logDebug("startBackend_failed_max_retries", { 
              error: result?.error || "Unknown error", 
              result,
              retryCount
            });
            return;
          }
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
        retryCount++;
        if (retryCount < MAX_RETRIES) {
          await logDebug("startBackend_exception_retrying", { 
            error: String(error),
            retryCount
          });
          retryTimer = setTimeout(() => {
            startServer();
          }, 3000);
        } else {
          await logDebug("startBackend_exception_max_retries", { 
            error: String(error),
            retryCount
          });
        }
      }
    };

    const initialTimer = setTimeout(() => {
      startServer();
    }, 2000);

    return () => {
      clearTimeout(initialTimer);
      if (retryTimer) {
        clearTimeout(retryTimer);
      }
    };
  }, [nle]);
};

