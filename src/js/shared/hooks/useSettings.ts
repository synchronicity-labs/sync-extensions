import { useState, useEffect, useCallback } from "react";

interface Settings {
  syncApiKey: string;
  elevenlabsApiKey: string;
  model: string;
  temperature: number;
  syncMode: string;
  activeSpeakerOnly: boolean;
  detectObstructions: boolean;
  renderVideo: string;
  renderAudio: string;
  saveLocation: string;
}

const defaultSettings: Settings = {
  syncApiKey: "",
  elevenlabsApiKey: "",
  model: "lipsync-2-pro",
  temperature: 0.5,
  syncMode: "loop",
  activeSpeakerOnly: false,
  detectObstructions: false,
  renderVideo: "mp4",
  renderAudio: "wav",
  saveLocation: "project",
};

export const useSettings = () => {
  const [settings, setSettings] = useState<Settings>(defaultSettings);

  // Load settings from localStorage and listen for changes
  useEffect(() => {
    const loadSettings = () => {
      const stored = localStorage.getItem("syncSettings");
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          setSettings((prev) => {
            const updated = { ...defaultSettings, ...parsed };
            // Only update if something actually changed to avoid unnecessary re-renders
            if (JSON.stringify(prev) !== JSON.stringify(updated)) {
              return updated;
            }
            return prev;
          });
        } catch (_) {
          // Invalid JSON, use defaults
        }
      }
    };

    // Load initially
    loadSettings();

    // Listen for storage events (changes from other windows/tabs)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "syncSettings") {
        loadSettings();
      }
    };
    window.addEventListener("storage", handleStorageChange);

    // Listen for custom syncSettingsChanged event (for same-window changes)
    const handleCustomChange = () => {
      loadSettings();
    };
    window.addEventListener("syncSettingsChanged", handleCustomChange);

    // Also check periodically for changes (localStorage changes don't trigger storage event in same window)
    // This ensures we catch changes made directly to localStorage
    const interval = setInterval(loadSettings, 500);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("syncSettingsChanged", handleCustomChange);
      clearInterval(interval);
    };
  }, []);

  const updateSettings = useCallback((updates: Partial<Settings>) => {
    setSettings((prev) => {
      const updated = { ...prev, ...updates };
      localStorage.setItem("syncSettings", JSON.stringify(updated));
      
      // Dispatch custom event to notify other components using useSettings
      // This ensures SettingsTab updates when onboarding saves API keys
      window.dispatchEvent(new CustomEvent("syncSettingsChanged", {
        detail: updates
      }));
      
      return updated;
    });
  }, []);

  const setApiKey = useCallback((key: string, type: "sync" | "elevenlabs") => {
    updateSettings({
      [type === "sync" ? "syncApiKey" : "elevenlabsApiKey"]: key,
    });
  }, [updateSettings]);

  const setModel = useCallback((model: string) => {
    updateSettings({ model });
  }, [updateSettings]);

  const setTemperature = useCallback((temperature: number) => {
    updateSettings({ temperature });
  }, [updateSettings]);

  const setSyncMode = useCallback((syncMode: string) => {
    updateSettings({ syncMode });
  }, [updateSettings]);

  const setRenderVideo = useCallback((format: string) => {
    updateSettings({ renderVideo: format });
  }, [updateSettings]);

  const setRenderAudio = useCallback((format: string) => {
    updateSettings({ renderAudio: format });
  }, [updateSettings]);

  const setSaveLocation = useCallback((location: string) => {
    updateSettings({ saveLocation: location });
  }, [updateSettings]);

  return {
    settings,
    updateSettings,
    setApiKey,
    setModel,
    setTemperature,
    setSyncMode,
    setRenderVideo,
    setRenderAudio,
    setSaveLocation,
  };
};
