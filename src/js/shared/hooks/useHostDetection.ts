import { useState, useEffect } from "react";
import { getHostConfig, type HostConfig } from "../utils/clientHostDetection";
import { debugLog, debugWarn } from "../utils/debugLog";

export type { HostConfig };

export const useHostDetection = () => {
  const [hostConfig, setHostConfig] = useState<HostConfig | null>(null);

  useEffect(() => {
    // Use centralized host detection
    const config = getHostConfig();
    if (config) {
      setHostConfig(config);
      debugLog("[host-detection] Detected host", { hostId: config.hostId, hostName: config.hostName });
    } else {
      debugWarn("[host-detection] Could not detect host");
    }
  }, []);

  return { hostConfig };
};

