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

  useEffect(() => {
    // Load from localStorage
    const stored = localStorage.getItem("syncSettings");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setSettings({ ...defaultSettings, ...parsed });
      } catch (_) {
        // Invalid JSON, use defaults
      }
    }
  }, []);

  const updateSettings = useCallback((updates: Partial<Settings>) => {
    setSettings((prev) => {
      const updated = { ...prev, ...updates };
      localStorage.setItem("syncSettings", JSON.stringify(updated));
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
