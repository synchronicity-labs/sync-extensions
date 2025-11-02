import { useState, useCallback } from "react";
import { useCore } from "./useCore";

export const useCost = () => {
  const { authHeaders, ensureAuthToken, fetchWithTimeout } = useCore();
  const [estimatedCost, setEstimatedCost] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(false);

  const estimateCost = useCallback(
    async (videoUrl?: string, audioUrl?: string) => {
      if (!videoUrl || !audioUrl) {
        setEstimatedCost(0);
        return;
      }

      setIsLoading(true);
      try {
        await ensureAuthToken();
        const settings = JSON.parse(localStorage.getItem("syncSettings") || "{}");
        
        const response = await fetchWithTimeout(
          "http://127.0.0.1:3000/cost/estimate",
          {
            method: "POST",
            headers: authHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({
              videoUrl,
              audioUrl,
              model: settings.model || "lipsync-2-pro",
            }),
          },
          10000
        );

        if (response.ok) {
          const data = await response.json().catch(() => null);
          if (data?.ok && typeof data.cost === "number") {
            setEstimatedCost(data.cost);
          }
        }
      } catch (_) {
        // Cost estimation failed, continue anyway
      } finally {
        setIsLoading(false);
      }
    },
    [authHeaders, ensureAuthToken, fetchWithTimeout]
  );

  return {
    estimatedCost,
    isLoading,
    estimateCost,
  };
};
