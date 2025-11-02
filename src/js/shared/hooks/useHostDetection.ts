import { useState, useEffect } from "react";

export interface HostConfig {
  hostId: string;
  hostName: string;
  isAE: boolean;
}

export const useHostDetection = () => {
  const [hostConfig, setHostConfig] = useState<HostConfig | null>(null);

  useEffect(() => {
    // Check if HOST_CONFIG is already set (by extension-specific file)
    if ((window as any).HOST_CONFIG) {
      setHostConfig((window as any).HOST_CONFIG);
      return;
    }

    // Fallback detection using CSInterface
    try {
      if (!(window as any).CSInterface) {
        console.error("[host-detection] CSInterface not available");
        return;
      }

      const cs = new (window as any).CSInterface();
      const env = cs.getHostEnvironment?.();
      const appName = env?.appName || "";
      const appId = env?.appId || "";
      const nameU = String(appName).toUpperCase();
      const idU = String(appId).toUpperCase();

      let config: HostConfig | null = null;

      if (idU.indexOf("AEFT") !== -1 || nameU.indexOf("AFTER EFFECTS") !== -1) {
        config = { hostId: "AEFT", hostName: "After Effects", isAE: true };
      } else if (idU.indexOf("PPRO") !== -1 || nameU.indexOf("PREMIERE") !== -1) {
        config = { hostId: "PPRO", hostName: "Premiere Pro", isAE: false };
      }

      if (config) {
        (window as any).HOST_CONFIG = config;
        setHostConfig(config);
      }
    } catch (e) {
      console.error("[host-detection] Error detecting host:", e);
    }
  }, []);

  return { hostConfig };
};

