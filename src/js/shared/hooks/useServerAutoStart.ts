import { useEffect } from "react";
import { useCore } from "./useCore";
import { useNLE } from "./useNLE";

// Server auto-start functionality
export const useServerAutoStart = () => {
  const { nle } = useNLE();

  useEffect(() => {
    if (typeof window === "undefined" || !window.CSInterface) {
      return;
    }

    const startServer = async () => {
      try {
        // Check if server is already running
        const response = await fetch("http://127.0.0.1:3000/health");
        if (response.ok) {
          return; // Server already running
        }
      } catch (_) {
        // Server not running, continue to start
      }

      // Try to start server via NLE
      if (nle?.startBackend) {
        await nle.startBackend();
      }
    };

    // Start server after a short delay
    const timer = setTimeout(() => {
      startServer();
    }, 1000);

    return () => clearTimeout(timer);
  }, [nle]);
};

