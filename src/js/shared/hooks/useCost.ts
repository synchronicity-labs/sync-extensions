import { useState, useCallback } from "react";
import { useCore } from "./useCore";
import { getApiUrl } from "../utils/serverConfig";
import { debugLog, debugError } from "../utils/debugLog";

export const useCost = () => {
  const { authHeaders, ensureAuthToken, fetchWithTimeout } = useCore();
  const [estimatedCost, setEstimatedCost] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const estimateCost = useCallback(
    async (videoUrl?: string, audioUrl?: string) => {
      if (!videoUrl || !audioUrl) {
        debugLog('[useCost] No URLs provided, resetting cost', { videoUrl: !!videoUrl, audioUrl: !!audioUrl });
        // Set to null to trigger $-- display (will be handled by UI logic)
        setEstimatedCost(null);
        return;
      }

      // Validate URLs are actual HTTP/HTTPS URLs, not file paths
      const isValidUrl = (url: string) => {
        return url.startsWith('http://') || url.startsWith('https://');
      };

      if (!isValidUrl(videoUrl) || !isValidUrl(audioUrl)) {
        debugLog('[useCost] Invalid URLs provided (file paths instead of URLs)', { 
          videoUrl: videoUrl.substring(0, 100), 
          audioUrl: audioUrl.substring(0, 100) 
        });
        setEstimatedCost(null);
        return;
      }

      setIsLoading(true);
      try {
        await ensureAuthToken();
        const settings = JSON.parse(localStorage.getItem("syncSettings") || "{}");
        
        debugLog('[useCost] Estimating cost', { 
          videoUrl: videoUrl.substring(0, 100) + '...', 
          audioUrl: audioUrl.substring(0, 100) + '...',
          model: settings.model || "lipsync-2-pro"
        });
        
        const response = await fetchWithTimeout(
          getApiUrl("/cost/estimate"),
          {
            method: "POST",
            headers: authHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({
              videoUrl,
              audioUrl,
              model: settings.model || "lipsync-2-pro",
              syncApiKey: settings.syncApiKey || "",
            }),
          },
          10000
        );

        if (response.ok) {
          const data = await response.json().catch((err) => {
            debugError('[useCost] Failed to parse response JSON', err);
            return null;
          });
          
          debugLog('[useCost] Cost estimation response', { 
            ok: data?.ok, 
            cost: data?.cost,
            hasCost: typeof data?.cost === "number"
          });
          
          if (data?.ok && typeof data.cost === "number") {
            debugLog('[useCost] Setting cost to', { cost: data.cost, costType: typeof data.cost });
            setEstimatedCost(data.cost);
            debugLog('[useCost] Cost set successfully', { cost: data.cost });
          } else {
            debugError('[useCost] Invalid response format', { 
              data, 
              hasOk: !!data?.ok, 
              costType: typeof data?.cost,
              costValue: data?.cost,
              fullResponse: JSON.stringify(data)
            });
            // Reset to null on invalid response - will show $-- in UI
            setEstimatedCost(null);
          }
        } else {
          const errorText = await response.text().catch(() => 'Unknown error');
          debugError('[useCost] Cost estimation failed', { 
            status: response.status, 
            statusText: response.statusText,
            error: errorText
          });
          setEstimatedCost(null);
        }
      } catch (error) {
        debugError('[useCost] Cost estimation exception', error);
        setEstimatedCost(null);
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
