import { useState, useCallback, useEffect } from "react";
import { useCore } from "./useCore";
import { useNLE } from "./useNLE";

interface MediaSelection {
  video: string | null;
  videoUrl: string | null;
  audio: string | null;
  audioUrl: string | null;
  videoIsTemp: boolean;
  audioIsTemp: boolean;
  videoIsUrl: boolean;
  audioIsUrl: boolean;
}

export const useMedia = () => {
  const { authHeaders, ensureAuthToken } = useCore();
  const { nle } = useNLE();
  const [selection, setSelection] = useState<MediaSelection>({
    video: null,
    videoUrl: null,
    audio: null,
    audioUrl: null,
    videoIsTemp: false,
    audioIsTemp: false,
    videoIsUrl: false,
    audioIsUrl: false,
  });

  const openFileDialog = useCallback(
    async (kind: "video" | "audio"): Promise<string | null> => {
      if (!nle) return null;
      
      try {
        if (!(window as any).CSInterface) return null;
        
        const cs = new (window as any).CSInterface();
        const extPath = cs.getSystemPath((window as any).CSInterface.SystemPath.EXTENSION);
        const hostId = nle.getHostId();
        const isAE = hostId === "AEFT";
        const hostFile = isAE ? "/host/ae.jsx" : "/host/ppro.jsx";
        const fn = isAE ? "AEFT_showFileDialog" : "PPRO_showFileDialog";
        
        // Ensure host script is loaded before invoking
        const escPath = String(extPath + hostFile).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
        await new Promise<void>((resolve) => {
          cs.evalScript(`$.evalFile("${escPath}")`, () => resolve());
        });
        
        // Call the host-specific function
        const k = kind === "video" ? "video" : "audio";
        const payload = JSON.stringify({ kind: k }).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
        
        return new Promise((resolve) => {
          cs.evalScript(`${fn}("${payload}")`, (r: string) => {
            try {
              const result = JSON.parse(r || "{}");
              if (result.ok && result.path) {
                resolve(result.path);
              } else {
                resolve(null);
              }
            } catch (_) {
              // Fallback: treat raw string as a selected path
              if (r && typeof r === "string" && r.indexOf("/") !== -1) {
                resolve(r);
              } else {
                resolve(null);
              }
            }
          });
        });
      } catch (_) {
        return null;
      }
    },
    [nle]
  );

  // Expose selection globally for backward compatibility
  useEffect(() => {
    (window as any).selectedVideo = selection.video;
    (window as any).selectedVideoUrl = selection.videoUrl;
    (window as any).selectedAudio = selection.audio;
    (window as any).selectedAudioUrl = selection.audioUrl;
    (window as any).selectedVideoIsTemp = selection.videoIsTemp;
    (window as any).selectedAudioIsTemp = selection.audioIsTemp;
    (window as any).selectedVideoIsUrl = selection.videoIsUrl;
    (window as any).selectedAudioIsUrl = selection.audioIsUrl;
    (window as any).openFileDialog = openFileDialog;
  }, [selection, openFileDialog]);

  const selectVideo = useCallback(async () => {
    const path = await openFileDialog("video");
    if (path) {
      setSelection((prev) => ({
        ...prev,
        video: path,
        videoUrl: null,
        videoIsTemp: false,
        videoIsUrl: false,
      }));
      
      // Upload to server
      try {
        await ensureAuthToken();
        const settings = JSON.parse(localStorage.getItem("syncSettings") || "{}");
        const response = await fetch("http://127.0.0.1:3000/upload", {
          method: "POST",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ path, apiKey: settings.syncApiKey || "" }),
        });
        
        const data = await response.json().catch(() => null);
        if (response.ok && data?.ok && data?.url) {
          setSelection((prev) => ({
            ...prev,
            videoUrl: data.url,
          }));
          (window as any).uploadedVideoUrl = data.url;
          localStorage.setItem("uploadedVideoUrl", data.url);
        }
      } catch (_) {
        // Upload failed, continue anyway
      }
    }
  }, [openFileDialog, authHeaders, ensureAuthToken]);

  const selectAudio = useCallback(async () => {
    const path = await openFileDialog("audio");
    if (path) {
      setSelection((prev) => ({
        ...prev,
        audio: path,
        audioUrl: null,
        audioIsTemp: false,
        audioIsUrl: false,
      }));
      
      // Upload to server
      try {
        await ensureAuthToken();
        const settings = JSON.parse(localStorage.getItem("syncSettings") || "{}");
        const response = await fetch("http://127.0.0.1:3000/upload", {
          method: "POST",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ path, apiKey: settings.syncApiKey || "" }),
        });
        
        const data = await response.json().catch(() => null);
        if (response.ok && data?.ok && data?.url) {
          setSelection((prev) => ({
            ...prev,
            audioUrl: data.url,
          }));
          (window as any).uploadedAudioUrl = data.url;
          localStorage.setItem("uploadedAudioUrl", data.url);
        }
      } catch (_) {
        // Upload failed, continue anyway
      }
    }
  }, [openFileDialog, authHeaders, ensureAuthToken]);

  const clearVideo = useCallback(() => {
    setSelection((prev) => ({
      ...prev,
      video: null,
      videoUrl: null,
      videoIsTemp: false,
      videoIsUrl: false,
    }));
    (window as any).selectedVideo = null;
    (window as any).selectedVideoUrl = null;
    (window as any).uploadedVideoUrl = "";
  }, []);

  const clearAudio = useCallback(() => {
    setSelection((prev) => ({
      ...prev,
      audio: null,
      audioUrl: null,
      audioIsTemp: false,
      audioIsUrl: false,
    }));
    (window as any).selectedAudio = null;
    (window as any).selectedAudioUrl = null;
    (window as any).uploadedAudioUrl = "";
  }, []);

  return {
    selection,
    selectVideo,
    selectAudio,
    clearVideo,
    clearAudio,
    openFileDialog,
  };
};
