import { useState, useCallback, useEffect, useRef } from "react";
import { useCore } from "./useCore";
import { useNLE } from "./useNLE";
import { getApiUrl } from "../utils/serverConfig";
import { HOST_IDS } from "../../../shared/host";
import { showToast, ToastMessages } from "../utils/toast";
import { debugLog } from "../utils/debugLog";
import { getSettings, getStorageItem, setStorageItem } from "../utils/storage";
import { STORAGE_KEYS } from "../utils/constants";
import { parseJsonResponse } from "../utils/fetchUtils";

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
  
  // Track AbortControllers for ongoing uploads
  const videoUploadControllerRef = useRef<AbortController | null>(null);
  const audioUploadControllerRef = useRef<AbortController | null>(null);

  const openFileDialog = useCallback(
    async (kind: "video" | "audio"): Promise<string | null> => {
      // Use window.nle as fallback if hook's nle is not ready yet
      const nleToUse = nle || (window as any).nle;
      if (!nleToUse) {
        debugLog('openFileDialog: nle not available', { kind });
        return null;
      }
      
      try {
        const hostId = nleToUse.getHostId();
        
        // For Resolve, use window.selectVideo/selectAudio directly (set up by nle-resolve.ts)
        if (hostId === HOST_IDS.RESOLVE) {
          if (kind === "video") {
            if (typeof (window as any).selectVideo === 'function') {
              const path = await (window as any).selectVideo();
              return path;
            } else {
              debugLog('openFileDialog: window.selectVideo not available for Resolve', { kind });
              return null;
            }
          } else {
            if (typeof (window as any).selectAudio === 'function') {
              const path = await (window as any).selectAudio();
              return path;
            } else {
              debugLog('openFileDialog: window.selectAudio not available for Resolve', { kind });
              return null;
            }
          }
        }
        
        // For CEP hosts (Premiere/AE), use evalExtendScript
        // Check for evalExtendScript (set up by windowGlobals)
        if (typeof (window as any).evalExtendScript !== 'function') {
          debugLog('openFileDialog: evalExtendScript not available', { kind });
          return null;
        }
        
        const isAE = hostId === HOST_IDS.AEFT;
        const fn = isAE ? "AEFT_showFileDialog" : "PPRO_showFileDialog";
        const payload = { kind };
        
        const result = await (window as any).evalExtendScript(fn, payload);
        
        if (result?.ok && result?.path) {
          return result.path;
        } else if (result?.error) {
          debugLog('openFileDialog: File dialog error', { kind, error: result.error });
          showToast(result.error, "error");
          return null;
        } else {
          // User cancelled or no file selected
          return null;
        }
      } catch (error) {
        debugLog('openFileDialog: Exception', { kind, error });
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
    try {
      showToast(ToastMessages.OPENING_VIDEO_PICKER, "info");
      const path = await openFileDialog("video");
      if (path) {
        // Set video path - preview will show after upload completes
        debugLog('[useMedia] selectVideo: Setting video path', { path });
        setSelection((prev) => ({
          ...prev,
          video: path,
          videoUrl: null, // Will be set after upload completes
          videoIsTemp: false,
          videoIsUrl: false,
        }));
        
        (window as any).selectedVideo = path;
        (window as any).selectedVideoIsTemp = false;
        debugLog('[useMedia] selectVideo: Video path set', { 
          path, 
          selectedVideo: (window as any).selectedVideo 
        });
        
        if (typeof (window as any).updateLipsyncButton === "function") {
          (window as any).updateLipsyncButton();
        }
        if (typeof (window as any).renderInputPreview === "function") {
          (window as any).renderInputPreview("upload");
        }
        
        // Upload to R2 - preview will show once URL is available
        showToast(ToastMessages.LOADING, "info");
        try {
          if (videoUploadControllerRef.current) {
            videoUploadControllerRef.current.abort();
          }
          
          if ((window as any).videoUploadController) {
            (window as any).videoUploadController.abort();
          }
          
          const controller = new AbortController();
          videoUploadControllerRef.current = controller;
          (window as any).videoUploadController = controller;
          
          await ensureAuthToken();
          const settings = getSettings();
          const response = await fetch(getApiUrl("/upload"), {
            method: "POST",
            headers: authHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({ path, apiKey: settings.syncApiKey || "" }),
            signal: controller.signal,
          });
          
          if (controller.signal.aborted) {
            return;
          }
          
          const data = await parseJsonResponse(response);
          debugLog('[useMedia] selectVideo: Upload response', { 
            ok: response.ok, 
            dataOk: data?.ok, 
            hasUrl: !!data?.url,
            url: data?.url?.substring(0, 100) + '...',
          });
          if (response.ok && data?.ok && data?.url && data.url.trim() !== '') {
            if (controller.signal.aborted) {
              debugLog('[useMedia] selectVideo: Upload aborted, skipping URL set');
              return;
            }
            // Set videoUrl after upload completes - preview will now show
            debugLog('[useMedia] selectVideo: Setting videoUrl', { url: data.url.substring(0, 100) + '...' });
            setSelection((prev) => ({
              ...prev,
              videoUrl: data.url,
            }));
            (window as any).uploadedVideoUrl = data.url;
            (window as any).selectedVideoUrl = data.url;
            setStorageItem(STORAGE_KEYS.UPLOADED_VIDEO_URL, data.url);
            debugLog('[useMedia] selectVideo: videoUrl set', { 
              videoUrl: data.url.substring(0, 100) + '...',
              uploadedVideoUrl: (window as any).uploadedVideoUrl?.substring(0, 100) + '...',
            });
            showToast(ToastMessages.VIDEO_UPLOADED_SUCCESSFULLY, "success");
          } else {
            debugError('[useMedia] selectVideo: Upload failed or no URL', { 
              responseOk: response.ok,
              dataOk: data?.ok,
              hasUrl: !!data?.url,
              error: data?.error,
            });
          }
          
          if (videoUploadControllerRef.current === controller) {
            videoUploadControllerRef.current = null;
          }
          if ((window as any).videoUploadController === controller) {
            (window as any).videoUploadController = null;
          }
        } catch (error: any) {
          if (error?.name === 'AbortError') {
            return;
          }
        }
      }
    } catch (error) {
      debugLog('selectVideo_error', error);
    }
  }, [openFileDialog, authHeaders, ensureAuthToken]);

  const selectAudio = useCallback(async () => {
    try {
      showToast(ToastMessages.OPENING_AUDIO_PICKER, "info");
      const path = await openFileDialog("audio");
      if (path) {
        setSelection((prev) => ({
          ...prev,
          audio: path,
          audioUrl: null,
          audioIsTemp: false,
          audioIsUrl: false,
        }));
        
        (window as any).selectedAudio = path;
        (window as any).selectedAudioIsTemp = false;
        
        if (typeof (window as any).updateLipsyncButton === "function") {
          (window as any).updateLipsyncButton();
        }
        if (typeof (window as any).renderInputPreview === "function") {
          (window as any).renderInputPreview("upload");
        }
        
        try {
          if (audioUploadControllerRef.current) {
            audioUploadControllerRef.current.abort();
          }
          
          if ((window as any).audioUploadController) {
            (window as any).audioUploadController.abort();
          }
          
          const controller = new AbortController();
          audioUploadControllerRef.current = controller;
          (window as any).audioUploadController = controller;
          
          showToast(ToastMessages.LOADING, "info");
          await ensureAuthToken();
          const settings = getSettings();
          const response = await fetch(getApiUrl("/upload"), {
            method: "POST",
            headers: authHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({ path, apiKey: settings.syncApiKey || "" }),
            signal: controller.signal,
          });
          
          if (controller.signal.aborted) {
            return;
          }
          
          const data = await parseJsonResponse(response);
          if (response.ok && data?.ok && data?.url) {
            if (controller.signal.aborted) {
              return;
            }
            setSelection((prev) => {
              const newState = {
              ...prev,
              audioUrl: data.url,
              };
              debugLog('[useMedia] setAudioPath (direct): State update - audioUrl set', {
                audio: newState.audio,
                audioUrl: newState.audioUrl?.substring(0, 100) + '...',
                hasAudio: !!newState.audio,
                hasAudioUrl: !!newState.audioUrl,
              });
              return newState;
            });
            (window as any).uploadedAudioUrl = data.url;
            setStorageItem(STORAGE_KEYS.UPLOADED_AUDIO_URL, data.url);
            showToast(ToastMessages.AUDIO_UPLOADED_SUCCESSFULLY, "success");
            // Trigger cost estimation check
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('mediaUrlUpdated', { 
                detail: { type: 'audio', url: data.url } 
              }));
            }
          }
          
          if (audioUploadControllerRef.current === controller) {
            audioUploadControllerRef.current = null;
          }
          if ((window as any).audioUploadController === controller) {
            (window as any).audioUploadController = null;
          }
        } catch (error: any) {
          if (error?.name === 'AbortError') {
            return;
          }
        }
      }
    } catch (error) {
      debugLog('selectAudio_error', error);
    }
  }, [openFileDialog, authHeaders, ensureAuthToken]);

  const clearVideo = useCallback(() => {
    if (videoUploadControllerRef.current) {
      videoUploadControllerRef.current.abort();
      videoUploadControllerRef.current = null;
    }
    
    if ((window as any).videoUploadController) {
      (window as any).videoUploadController.abort();
      (window as any).videoUploadController = null;
    }
    
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
    // Trigger cost reset when video is cleared
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('mediaCleared', { 
        detail: { type: 'video' } 
      }));
    }
  }, []);

  const clearAudio = useCallback(() => {
    if (audioUploadControllerRef.current) {
      audioUploadControllerRef.current.abort();
      audioUploadControllerRef.current = null;
    }
    
    if ((window as any).audioUploadController) {
      (window as any).audioUploadController.abort();
      (window as any).audioUploadController = null;
    }
    
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
    // Trigger cost reset when audio is cleared
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('mediaCleared', { 
        detail: { type: 'audio' } 
      }));
    }
  }, []);


  const setVideoPath = useCallback(async (videoPath: string, videoUrl?: string | null) => {
    const hasValidUrl = videoUrl !== undefined && videoUrl !== null && videoUrl.trim() !== '';
    
    debugLog('[useMedia] setVideoPath: Called', { 
      videoPath, 
      hasValidUrl,
      videoUrl: videoUrl?.substring(0, 100) + '...',
    });
    
    // Set video path - preview will show after upload completes
    setSelection((prev) => {
      const newState = {
      ...prev,
      video: videoPath,
        videoUrl: hasValidUrl ? videoUrl : null, // Will be set after upload completes
      videoIsTemp: false,
        videoIsUrl: hasValidUrl,
      };
      debugLog('[useMedia] setVideoPath: Setting selection state', {
        video: newState.video,
        videoUrl: newState.videoUrl?.substring(0, 100) + '...',
        videoIsUrl: newState.videoIsUrl,
      });
      return newState;
    });
    (window as any).selectedVideo = videoPath;
    (window as any).selectedVideoUrl = hasValidUrl ? videoUrl : null;
    (window as any).selectedVideoIsUrl = hasValidUrl;
    (window as any).selectedVideoIsTemp = false;
    debugLog('[useMedia] setVideoPath: Window globals set', {
      selectedVideo: (window as any).selectedVideo,
      selectedVideoUrl: (window as any).selectedVideoUrl?.substring(0, 100) + '...',
      selectedVideoIsUrl: (window as any).selectedVideoIsUrl,
    });
    
    // Upload to R2 if no URL provided - preview will show once URL is available
    if (!hasValidUrl) {
      showToast(ToastMessages.LOADING, "info");
      try {
        if (videoUploadControllerRef.current) {
          videoUploadControllerRef.current.abort();
        }
        
        if ((window as any).videoUploadController) {
          (window as any).videoUploadController.abort();
        }
        
        const controller = new AbortController();
        videoUploadControllerRef.current = controller;
        (window as any).videoUploadController = controller;
        
        await ensureAuthToken();
        const settings = getSettings();
        const response = await fetch(getApiUrl("/upload"), {
          method: "POST",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ path: videoPath, apiKey: settings.syncApiKey || "" }),
          signal: controller.signal,
        });
        
        if (controller.signal.aborted) {
          return;
        }
        
        const data = await parseJsonResponse<{ ok?: boolean; url?: string; error?: string }>(response);
        debugLog('[useMedia] setVideoPath: Upload response', { 
          ok: response.ok, 
          dataOk: data?.ok, 
          hasUrl: !!data?.url,
          url: data?.url?.substring(0, 100) + '...',
        });
        if (response.ok && data?.ok && data?.url && data.url.trim() !== '') {
          if (controller.signal.aborted) {
            debugLog('[useMedia] setVideoPath: Upload aborted, skipping URL set');
            return;
          }
          // Set videoUrl after upload completes - preview will now show
          debugLog('[useMedia] setVideoPath: Setting videoUrl from upload', { 
            url: data.url.substring(0, 100) + '...' 
          });
          setSelection((prev) => {
            const newState = {
            ...prev,
            videoUrl: data.url,
            };
            debugLog('[useMedia] setVideoPath: State update - videoUrl set', {
              video: newState.video,
              videoUrl: newState.videoUrl?.substring(0, 100) + '...',
              hasVideo: !!newState.video,
              hasVideoUrl: !!newState.videoUrl,
            });
            return newState;
          });
          (window as any).uploadedVideoUrl = data.url;
          (window as any).selectedVideoUrl = data.url;
          setStorageItem(STORAGE_KEYS.UPLOADED_VIDEO_URL, data.url);
          debugLog('[useMedia] setVideoPath: videoUrl set from upload', { 
            videoUrl: data.url.substring(0, 100) + '...',
            uploadedVideoUrl: (window as any).uploadedVideoUrl?.substring(0, 100) + '...',
          });
          // Trigger cost estimation check by dispatching a custom event
          // This ensures BottomBar's useEffect runs even if React doesn't detect the state change
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('mediaUrlUpdated', { 
              detail: { type: 'video', url: data.url } 
            }));
          }
        } else {
          debugError('[useMedia] setVideoPath: Upload failed or no URL', { 
            responseOk: response.ok,
            dataOk: data?.ok,
            hasUrl: !!data?.url,
            error: data?.error,
          });
        }
        
        if (videoUploadControllerRef.current === controller) {
          videoUploadControllerRef.current = null;
        }
        if ((window as any).videoUploadController === controller) {
          (window as any).videoUploadController = null;
        }
      } catch (error: any) {
        if (error?.name === 'AbortError') {
          return;
        }
      }
    }
  }, [authHeaders, ensureAuthToken]);

  const setAudioPath = useCallback(async (audioPath: string, audioUrl?: string | null) => {
    const hasValidUrl = audioUrl !== undefined && audioUrl !== null && audioUrl.trim() !== '';
    
    debugLog('[useMedia] setAudioPath: Called', { 
      audioPath, 
      hasValidUrl,
      audioUrl: audioUrl?.substring(0, 100) + '...',
    });
    
    setSelection((prev) => ({
      ...prev,
      audio: audioPath,
      audioUrl: hasValidUrl ? audioUrl : null,
      audioIsTemp: false,
      audioIsUrl: hasValidUrl,
    }));
    (window as any).selectedAudio = audioPath;
    (window as any).selectedAudioUrl = hasValidUrl ? audioUrl : null;
    (window as any).selectedAudioIsUrl = hasValidUrl;
    (window as any).selectedAudioIsTemp = false;
    
    // If URL is provided, also set uploadedAudioUrl for cost calculation
    if (hasValidUrl) {
      (window as any).uploadedAudioUrl = audioUrl;
      setStorageItem(STORAGE_KEYS.UPLOADED_AUDIO_URL, audioUrl);
      debugLog('[useMedia] setAudioPath: Setting uploadedAudioUrl', { 
        audioUrl: audioUrl.substring(0, 100) + '...',
        uploadedAudioUrl: (window as any).uploadedAudioUrl?.substring(0, 100) + '...',
      });
      // Trigger cost estimation check by dispatching a custom event
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('mediaUrlUpdated', { 
          detail: { type: 'audio', url: audioUrl } 
        }));
      }
    }
    
    if (!audioUrl) {
      try {
        if (audioUploadControllerRef.current) {
          audioUploadControllerRef.current.abort();
        }
        
        if ((window as any).audioUploadController) {
          (window as any).audioUploadController.abort();
        }
        
        const controller = new AbortController();
        audioUploadControllerRef.current = controller;
        (window as any).audioUploadController = controller;
        
        await ensureAuthToken();
        const settings = getSettings();
        const response = await fetch(getApiUrl("/upload"), {
          method: "POST",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ path: audioPath, apiKey: settings.syncApiKey || "" }),
          signal: controller.signal,
        });
        
        if (controller.signal.aborted) {
          return;
        }
        
        const data = await parseJsonResponse<{ ok?: boolean; url?: string; error?: string }>(response);
        if (response.ok && data?.ok && data?.url) {
          if (controller.signal.aborted) {
            return;
          }
          setSelection((prev) => {
            const newState = {
            ...prev,
            audioUrl: data.url,
            };
            debugLog('[useMedia] setAudioPath: State update - audioUrl set', {
              audio: newState.audio,
              audioUrl: newState.audioUrl?.substring(0, 100) + '...',
              hasAudio: !!newState.audio,
              hasAudioUrl: !!newState.audioUrl,
            });
            return newState;
          });
          (window as any).uploadedAudioUrl = data.url;
          setStorageItem(STORAGE_KEYS.UPLOADED_AUDIO_URL, data.url);
          // Trigger cost estimation check
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('mediaUrlUpdated', { 
              detail: { type: 'audio', url: data.url } 
            }));
          }
        }
        
        if (audioUploadControllerRef.current === controller) {
          audioUploadControllerRef.current = null;
        }
        if ((window as any).audioUploadController === controller) {
          (window as any).audioUploadController = null;
        }
      } catch (error: any) {
        if (error?.name === 'AbortError') {
          return;
        }
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
