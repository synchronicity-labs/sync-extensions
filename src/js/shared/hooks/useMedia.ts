import { useState, useCallback, useEffect } from "react";
import { useCore } from "./useCore";
import { useNLE } from "./useNLE";
import { getApiUrl } from "../utils/serverConfig";
import { HOST_IDS } from "../../../shared/host";

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
      // Use window.nle as fallback if hook's nle is not ready yet
      const nleToUse = nle || (window as any).nle;
      if (!nleToUse) {
        if ((window as any).debugLog) {
          (window as any).debugLog('button_click', { error: 'nle not available', kind, hasNLE: !!nle, hasWindowNLE: !!(window as any).nle });
        }
        return null;
      }
      
      try {
        // Check for CSInterface - it should be available in CEP environment
        // If not available, try to use window.__adobe_cep__ directly
        if (!(window as any).CSInterface && !(window as any).__adobe_cep__) {
          if ((window as any).debugLog) {
            (window as any).debugLog('button_click', { error: 'CSInterface not available', kind, hasCSInterface: !!(window as any).CSInterface, hasAdobeCEP: !!(window as any).__adobe_cep__ });
          }
          return null;
        }
        
        // Use CSInterface if available, otherwise we can't proceed
        if (!(window as any).CSInterface) {
          if ((window as any).debugLog) {
            (window as any).debugLog('button_click', { error: 'CSInterface not available (shim failed)', kind });
          }
          return null;
        }
        
        const cs = new (window as any).CSInterface();
        const extPath = cs.getSystemPath((window as any).CSInterface.SystemPath.EXTENSION);
      const hostId = nleToUse.getHostId();
        const isAE = hostId === HOST_IDS.AEFT;
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
      
      return new Promise((resolve, reject) => {
          cs.evalScript(`${fn}("${payload}")`, (r: string) => {
            try {
              if ((window as any).debugLog) {
                (window as any).debugLog('button_click', { kind, stage: 'evalScript_response', response: r?.substring(0, 200) });
              }
              const result = JSON.parse(r || "{}");
              if (result.ok && result.path) {
                if ((window as any).debugLog) {
                  (window as any).debugLog('button_click', { kind, stage: 'file_selected', path: result.path });
                }
                resolve(result.path);
              } else {
                // Handle errors from file dialog (file size, invalid type, etc.)
                if (result.error) {
                  if ((window as any).debugLog) {
                    (window as any).debugLog('button_click', { kind, stage: 'file_dialog_error', error: result.error });
                  }
                  if (typeof (window as any).showToast === "function") {
                    (window as any).showToast(result.error, "error");
                  }
                  reject(new Error(result.error));
                } else {
                  // User cancelled or no file selected
                  if ((window as any).debugLog) {
                    (window as any).debugLog('button_click', { kind, stage: 'file_dialog_cancelled' });
                  }
                  resolve(null);
                }
              }
            } catch (parseError) {
              // Fallback: treat raw string as a selected path
              if (r && typeof r === "string" && r.indexOf("/") !== -1) {
                if ((window as any).debugLog) {
                  (window as any).debugLog('button_click', { kind, stage: 'file_selected_raw', path: r });
                }
                resolve(r);
              } else {
                if ((window as any).debugLog) {
                  (window as any).debugLog('button_click', { kind, stage: 'parse_error', error: String(parseError), response: r?.substring(0, 200) });
                }
                resolve(null);
              }
            }
          });
          });
        } catch (error) {
          if ((window as any).debugLog) {
            (window as any).debugLog('button_click', { error: String(error), kind, stage: 'openFileDialog' });
          }
          return null;
        }
    },
    [nle] // Note: window.nle is checked at runtime, not in deps
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
    try {
      const path = await openFileDialog("video");
      if (path) {
        setSelection((prev) => ({
          ...prev,
          video: path,
          videoUrl: null,
          videoIsTemp: false,
          videoIsUrl: false,
        }));
        
        // Update global state for backward compatibility
        (window as any).selectedVideo = path;
        (window as any).selectedVideoIsTemp = false;
        
        // Call update functions like main branch
        if (typeof (window as any).updateLipsyncButton === "function") {
          (window as any).updateLipsyncButton();
        }
        if (typeof (window as any).renderInputPreview === "function") {
          (window as any).renderInputPreview("upload");
        }
        if (typeof (window as any).updateInputStatus === "function") {
          (window as any).updateInputStatus();
        }
        
        // Upload to server
        try {
          await ensureAuthToken();
          const settings = JSON.parse(localStorage.getItem("syncSettings") || "{}");
          const response = await fetch(getApiUrl("/upload"), {
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
    } catch (error) {
      // Error already handled in openFileDialog (toast shown)
      // Just return without updating selection
    }
  }, [openFileDialog, authHeaders, ensureAuthToken]);

  const selectAudio = useCallback(async () => {
    try {
      const path = await openFileDialog("audio");
      if (path) {
        setSelection((prev) => ({
          ...prev,
          audio: path,
          audioUrl: null,
          audioIsTemp: false,
          audioIsUrl: false,
        }));
        
        // Update global state for backward compatibility
        (window as any).selectedAudio = path;
        (window as any).selectedAudioIsTemp = false;
        
        // Call update functions like main branch
        if (typeof (window as any).updateLipsyncButton === "function") {
          (window as any).updateLipsyncButton();
        }
        if (typeof (window as any).renderInputPreview === "function") {
          (window as any).renderInputPreview("upload");
        }
        if (typeof (window as any).updateInputStatus === "function") {
          (window as any).updateInputStatus();
        }
        
        // Upload to server
        try {
          await ensureAuthToken();
          const settings = JSON.parse(localStorage.getItem("syncSettings") || "{}");
          const response = await fetch(getApiUrl("/upload"), {
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
    } catch (error) {
      // Error already handled in openFileDialog (toast shown)
      // Just return without updating selection
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


  const setVideoPath = useCallback(async (videoPath: string, videoUrl?: string | null) => {
    setSelection((prev) => ({
      ...prev,
      video: videoPath,
      videoUrl: videoUrl !== undefined ? videoUrl : null,
      videoIsTemp: false,
      videoIsUrl: videoUrl !== undefined && videoUrl !== null,
    }));
    (window as any).selectedVideo = videoPath;
    (window as any).selectedVideoUrl = videoUrl || null;
    (window as any).selectedVideoIsUrl = videoUrl !== undefined && videoUrl !== null;
    (window as any).selectedVideoIsTemp = false;
    
    // Upload to server (only if not already a URL)
    if (!videoUrl) {
      try {
        await ensureAuthToken();
        const settings = JSON.parse(localStorage.getItem("syncSettings") || "{}");
        const response = await fetch(getApiUrl("/upload"), {
          method: "POST",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ path: videoPath, apiKey: settings.syncApiKey || "" }),
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
  }, [authHeaders, ensureAuthToken]);

  const setAudioPath = useCallback(async (audioPath: string, audioUrl?: string | null) => {
    setSelection((prev) => ({
      ...prev,
      audio: audioPath,
      audioUrl: audioUrl !== undefined ? audioUrl : null,
      audioIsTemp: false,
      audioIsUrl: audioUrl !== undefined && audioUrl !== null,
    }));
    (window as any).selectedAudio = audioPath;
    (window as any).selectedAudioUrl = audioUrl || null;
    (window as any).selectedAudioIsUrl = audioUrl !== undefined && audioUrl !== null;
    (window as any).selectedAudioIsTemp = false;
    
    // Upload to server (only if not already a URL)
    if (!audioUrl) {
      try {
        await ensureAuthToken();
        const settings = JSON.parse(localStorage.getItem("syncSettings") || "{}");
        const response = await fetch(getApiUrl("/upload"), {
          method: "POST",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ path: audioPath, apiKey: settings.syncApiKey || "" }),
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
  }, [authHeaders, ensureAuthToken]);

  return {
    selection,
    selectVideo,
    selectAudio,
    clearVideo,
    clearAudio,
    openFileDialog,
    setAudioPath,
    setVideoPath,
  };
};
