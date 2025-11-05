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
    async (text: string, voiceId?: string) => {
      if (!text.trim()) return null;

      setIsGenerating(true);
      try {
        await ensureAuthToken();
        const response = await fetch(getApiUrl("/tts/generate"), {
          method: "POST",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            text,
            voiceId: voiceId || selectedVoice,
            apiKey: settings.elevenlabsApiKey || "",
            model: "eleven_v3",
            stability: 0.5,
            similarityBoost: 0.8,
          }),
        });

        const data = await response.json().catch(() => null);
        if (response.ok && data?.ok && data?.audioUrl) {
          return data.audioUrl;
        }
        return null;
      } catch (_) {
        return null;
      } finally {
        setIsGenerating(false);
      }
    },
    [selectedVoice, settings.elevenlabsApiKey, authHeaders, ensureAuthToken]
  );

  return {
    voices,
    selectedVoice,
    isGenerating,
    loadVoices,
    setSelectedVoice,
    generateTTS,
  };
};
