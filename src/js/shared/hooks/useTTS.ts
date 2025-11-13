import { useState, useCallback } from "react";
import { useCore } from "./useCore";
import { useSettings } from "./useSettings";
import { getApiUrl } from "../utils/serverConfig";

interface TTSVoice {
  id: string;
  name: string;
  preview_url?: string;
}

export const useTTS = () => {
  const { authHeaders, ensureAuthToken } = useCore();
  const { settings } = useSettings();
  const [voices, setVoices] = useState<TTSVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<string>("rachel");
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>("eleven_v3");
  const [voiceSettings, setVoiceSettings] = useState({
    stability: 0.5,
    similarityBoost: 0.8,
  });

  const loadVoices = useCallback(async () => {
    try {
      await ensureAuthToken();
      const response = await fetch(getApiUrl("/tts/voices"), {
        headers: authHeaders(),
      });

      if (response.ok) {
        const data = await response.json().catch(() => null);
        if (data?.ok && Array.isArray(data.voices)) {
          setVoices(data.voices);
        }
      }
    } catch (_) {
      // Failed to load voices
    }
  }, [authHeaders, ensureAuthToken]);

  const generateTTS = useCallback(
    async (text: string, voiceId?: string, model?: string, customVoiceSettings?: { stability: number; similarityBoost: number }) => {
      if (!text.trim()) return null;

      setIsGenerating(true);
      try {
        await ensureAuthToken();
        const modelToUse = model || selectedModel;
        const settingsToUse = customVoiceSettings || voiceSettings;
        const response = await fetch(getApiUrl("/tts/generate"), {
          method: "POST",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            text,
            voiceId: voiceId || selectedVoice,
            elevenApiKey: settings.elevenlabsApiKey || "",
            model: modelToUse,
            voiceSettings: {
              stability: settingsToUse.stability,
              similarity_boost: settingsToUse.similarityBoost,
            },
          }),
        });

        const data = await response.json().catch(() => null);
        if (response.ok && data?.ok && data?.audioPath) {
          return data.audioPath;
        }
        return null;
      } catch (_) {
        return null;
      } finally {
        setIsGenerating(false);
      }
    },
    [selectedVoice, selectedModel, voiceSettings, settings.elevenlabsApiKey, authHeaders, ensureAuthToken]
  );

  return {
    voices,
    selectedVoice,
    isGenerating,
    loadVoices,
    setSelectedVoice,
    generateTTS,
    selectedModel,
    setSelectedModel,
    voiceSettings,
    setVoiceSettings,
  };
};
