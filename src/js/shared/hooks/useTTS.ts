import { useState, useCallback } from "react";
import { useCore } from "./useCore";
import { useSettings } from "./useSettings";
import { getApiUrl } from "../utils/serverConfig";

interface TTSVoice {
  id?: string;
  voice_id?: string;
  name: string;
  preview_url?: string;
  category?: string;
  labels?: Record<string, any>;
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
      const apiKey = settings.elevenlabsApiKey || "";
      if (!apiKey) {
        return;
      }
      const response = await fetch(
        getApiUrl(`/tts/voices?elevenApiKey=${encodeURIComponent(apiKey)}`),
        {
          headers: authHeaders(),
        }
      );

      if (response.ok) {
        const data = await response.json().catch(() => null);
        if (data?.voices && Array.isArray(data.voices)) {
          // Normalize voice IDs - map voice_id to id for consistency
          const normalizedVoices = data.voices.map((voice: any) => ({
            ...voice,
            id: voice.voice_id || voice.id,
          }));
          setVoices(normalizedVoices);
        }
      }
    } catch (_) {
      // Failed to load voices
    }
  }, [authHeaders, ensureAuthToken, settings.elevenlabsApiKey]);

  const generateTTS = useCallback(
    async (text: string, voiceId?: string, model?: string, customVoiceSettings?: { stability: number; similarityBoost: number }) => {
      if (!text.trim()) return null;

      setIsGenerating(true);
      try {
        await ensureAuthToken();
        const modelToUse = model || selectedModel;
        const settingsToUse = customVoiceSettings || voiceSettings;
        // Use provided voiceId or selectedVoice (both should be normalized IDs)
        const voiceToUse = voiceId || selectedVoice;
        const response = await fetch(getApiUrl("/tts/generate"), {
          method: "POST",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            text,
            voiceId: voiceToUse,
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

  const createVoiceClone = useCallback(
    async (name: string, files: string[]) => {
      try {
        await ensureAuthToken();
        const response = await fetch(getApiUrl("/tts/voices/create"), {
          method: "POST",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            name,
            files,
            elevenApiKey: settings.elevenlabsApiKey || "",
          }),
        });

        const data = await response.json().catch(() => null);
        if (response.ok && data?.voice_id) {
          // Reload voices to get the new one
          await loadVoices();
          return data.voice_id;
        }
        throw new Error(data?.error || "Failed to create voice clone");
      } catch (error: any) {
        throw new Error(error?.message || "Failed to create voice clone");
      }
    },
    [settings.elevenlabsApiKey, authHeaders, ensureAuthToken, loadVoices]
  );

  const deleteVoice = useCallback(
    async (voiceId: string) => {
      try {
        await ensureAuthToken();
        const response = await fetch(getApiUrl("/tts/voices/delete"), {
          method: "POST",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            voiceId,
            elevenApiKey: settings.elevenlabsApiKey || "",
          }),
        });

        const data = await response.json().catch(() => null);
        if (response.ok && data?.ok) {
          // Remove from local state and reload
          setVoices((prev) => prev.filter((v) => (v.voice_id || v.id) !== voiceId));
          await loadVoices();
          // If deleted voice was selected, reset to default
          if (selectedVoice === voiceId) {
            setSelectedVoice("rachel");
          }
          return true;
        }
        throw new Error(data?.error || "Failed to delete voice");
      } catch (error: any) {
        throw new Error(error?.message || "Failed to delete voice");
      }
    },
    [selectedVoice, settings.elevenlabsApiKey, authHeaders, ensureAuthToken, loadVoices]
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
    createVoiceClone,
    deleteVoice,
  };
};
