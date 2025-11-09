import { useState, useEffect } from "react";
import { getHostConfig, type HostConfig } from "../utils/host";

export type { HostConfig };

export const useHostDetection = () => {
  const [hostConfig, setHostConfig] = useState<HostConfig | null>(null);

  useEffect(() => {
    // Use centralized host detection
    const config = getHostConfig();
    if (config) {
      setHostConfig(config);
      console.log("[host-detection] Detected host:", config.hostId, config.hostName);
    } else {
      console.warn("[host-detection] Could not detect host");
    }
  }, []);

  return { hostConfig };
};

