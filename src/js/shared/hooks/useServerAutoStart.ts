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
        const hostConfig = (window as any).HOST_CONFIG || {};
        await fetch(getApiUrl("/debug"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: `[useServerAutoStart] ${message}`,
            data,
            timestamp: new Date().toISOString(),
            hostConfig,
          }),
        }).catch(() => {});
      } catch (_) {}
    };

    const startServer = async () => {
      try {
        console.log("[useServerAutoStart] Checking if server is running...");
        await logDebug("checking_server_health");
        
        // Check if server is already running
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);
        try {
          const response = await fetch(getApiUrl("/health"), {
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
          if (response.ok) {
            console.log("[useServerAutoStart] Server is already running");
            await logDebug("server_already_running");
            return; // Server already running
          }
        } catch (fetchError: any) {
          clearTimeout(timeoutId);
          // If it's an abort error (timeout), treat as server not running
          if (fetchError.name === 'AbortError') {
            // Timeout - server not responding
            throw new Error("Server health check timeout");
          }
          throw fetchError;
        }
      } catch (error) {
        // Server not running, continue to start
        console.log("[useServerAutoStart] Server not running, will attempt to start", error);
        await logDebug("server_not_running", { error: String(error) });
      }

      // Try to start server via NLE
      if (nle?.startBackend) {
        try {
          console.log("[useServerAutoStart] Attempting to start server via nle.startBackend()...");
          await logDebug("calling_startBackend");
          
          const result = await nle.startBackend();
          console.log("[useServerAutoStart] startBackend result:", result);
          await logDebug("startBackend_result", result);
          
          if (!result || !result.ok) {
            const errorMsg = result?.error || "Unknown error";
            console.error("[useServerAutoStart] Server startup failed:", errorMsg);
            await logDebug("startBackend_failed", { error: errorMsg, result });
            return;
          }
          
          // Wait a bit for server to actually start
          console.log("[useServerAutoStart] Waiting for server to start...");
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
                console.log("[useServerAutoStart] Server started successfully!");
                await logDebug("server_started_successfully");
              } else {
                console.warn("[useServerAutoStart] Server startup command succeeded but server is not responding");
                await logDebug("server_not_responding_after_start");
              }
            } catch (healthError: any) {
              clearTimeout(healthTimeoutId);
              if (healthError.name === 'AbortError') {
                console.warn("[useServerAutoStart] Server health check timed out after startup");
                await logDebug("server_health_check_timeout_after_start");
              } else {
                throw healthError;
              }
            }
          } catch (error) {
            console.error("[useServerAutoStart] Server startup command succeeded but health check failed:", error);
            await logDebug("server_health_check_failed_after_start", { error: String(error) });
          }
        } catch (error) {
          console.error("[useServerAutoStart] Error calling startBackend:", error);
          await logDebug("startBackend_exception", { error: String(error) });
        }
      } else {
        console.warn("[useServerAutoStart] nle.startBackend is not available");
        await logDebug("startBackend_not_available");
      }
    };

    // Start server after a short delay
    const timer = setTimeout(() => {
      startServer();
    }, 1000);

    return () => clearTimeout(timer);
  }, [nle]);
};

