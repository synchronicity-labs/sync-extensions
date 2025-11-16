import { useState, useCallback, useEffect, useRef } from "react";
import { useCore } from "./useCore";
import { useNLE } from "./useNLE";
import { getApiUrl } from "../utils/serverConfig";
import { HOST_IDS } from "../../../shared/host";
import { showToast, ToastMessages } from "../utils/toast";
import { debugLog, debugError } from "../utils/debugLog";

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
        debugError('openFileDialog: nle not available', { kind });
        return null;
      }
      
      // Check for evalExtendScript (set up by windowGlobals)
      if (typeof (window as any).evalExtendScript !== 'function') {
        debugError('openFileDialog: evalExtendScript not available', { kind });
        return null;
      }
      
      try {
        const hostId = nleToUse.getHostId();
        const isAE = hostId === HOST_IDS.AEFT;
        const fn = isAE ? "AEFT_showFileDialog" : "PPRO_showFileDialog";
        const payload = { kind };
        
        const result = await (window as any).evalExtendScript(fn, payload);
        
        if (result?.ok && result?.path) {
          return result.path;
        } else if (result?.error) {
          debugError('openFileDialog: File dialog error', { kind, error: result.error });
          showToast(result.error, "error");
          return null;
        } else {
          // User cancelled or no file selected
          return null;
        }
      } catch (error) {
        debugError('openFileDialog: Exception', { kind, error });
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
      // Show toast when opening file picker
      showToast(ToastMessages.OPENING_VIDEO_PICKER, "info");
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
          // Cancel any existing video upload (from useMedia)
          if (videoUploadControllerRef.current) {
            videoUploadControllerRef.current.abort();
          }
          
          // Cancel any existing video upload (from useDragAndDrop or useRecording)
          if ((window as any).videoUploadController) {
            (window as any).videoUploadController.abort();
          }
          
          // Create new AbortController for this upload
          const controller = new AbortController();
          videoUploadControllerRef.current = controller;
          (window as any).videoUploadController = controller;
          
          // Show loading toast (matches main branch)
          showToast(ToastMessages.LOADING, "info");
          await ensureAuthToken();
          const settings = JSON.parse(localStorage.getItem("syncSettings") || "{}");
          const response = await fetch(getApiUrl("/upload"), {
            method: "POST",
            headers: authHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({ path, apiKey: settings.syncApiKey || "" }),
            signal: controller.signal,
          });
          
          // Check if upload was aborted
          if (controller.signal.aborted) {
            return;
          }
          
          const data = await response.json().catch(() => null);
          if (response.ok && data?.ok && data?.url) {
            // Check again if upload was aborted before updating state
            if (controller.signal.aborted) {
              return;
            }
            setSelection((prev) => ({
              ...prev,
              videoUrl: data.url,
            }));
            (window as any).uploadedVideoUrl = data.url;
            localStorage.setItem("uploadedVideoUrl", data.url);
            // Show success toast (matches main branch)
            showToast(ToastMessages.VIDEO_UPLOADED_SUCCESSFULLY, "success");
          }
          
          // Clear controller references if this was the current upload
          if (videoUploadControllerRef.current === controller) {
            videoUploadControllerRef.current = null;
          }
          if ((window as any).videoUploadController === controller) {
            (window as any).videoUploadController = null;
          }
        } catch (error: any) {
          // Ignore abort errors
          if (error?.name === 'AbortError') {
            return;
          }
          // Upload failed, continue anyway
        }
      }
    } catch (error) {
      debugError('selectVideo_error', error);
      // Error already handled in openFileDialog (toast shown)
      // Just return without updating selection
    }
  }, [openFileDialog, authHeaders, ensureAuthToken]);

  const selectAudio = useCallback(async () => {
    try {
      // Show toast when opening file picker
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
          // Cancel any existing audio upload (from useMedia)
          if (audioUploadControllerRef.current) {
            audioUploadControllerRef.current.abort();
          }
          
          // Cancel any existing audio upload (from useDragAndDrop or useRecording)
          if ((window as any).audioUploadController) {
            (window as any).audioUploadController.abort();
          }
          
          // Create new AbortController for this upload
          const controller = new AbortController();
          audioUploadControllerRef.current = controller;
          (window as any).audioUploadController = controller;
          
          // Show loading toast (matches main branch)
          showToast(ToastMessages.LOADING, "info");
          await ensureAuthToken();
          const settings = JSON.parse(localStorage.getItem("syncSettings") || "{}");
          const response = await fetch(getApiUrl("/upload"), {
            method: "POST",
            headers: authHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({ path, apiKey: settings.syncApiKey || "" }),
            signal: controller.signal,
          });
          
          // Check if upload was aborted
          if (controller.signal.aborted) {
            return;
          }
          
          const data = await response.json().catch(() => null);
          if (response.ok && data?.ok && data?.url) {
            // Check again if upload was aborted before updating state
            if (controller.signal.aborted) {
              return;
            }
            setSelection((prev) => ({
              ...prev,
              audioUrl: data.url,
            }));
            (window as any).uploadedAudioUrl = data.url;
            localStorage.setItem("uploadedAudioUrl", data.url);
            // Show success toast (matches main branch)
            showToast(ToastMessages.AUDIO_UPLOADED_SUCCESSFULLY, "success");
          }
          
          // Clear controller references if this was the current upload
          if (audioUploadControllerRef.current === controller) {
            audioUploadControllerRef.current = null;
          }
          if ((window as any).audioUploadController === controller) {
            (window as any).audioUploadController = null;
          }
        } catch (error: any) {
          // Ignore abort errors
          if (error?.name === 'AbortError') {
            return;
          }
          // Upload failed, continue anyway
        }
      }
    } catch (error) {
      debugError('selectAudio_error', error);
      // Error already handled in openFileDialog (toast shown)
      // Just return without updating selection
    }
  }, [openFileDialog, authHeaders, ensureAuthToken]);

  const clearVideo = useCallback(() => {
    // Cancel any ongoing video upload (from useMedia)
    if (videoUploadControllerRef.current) {
      videoUploadControllerRef.current.abort();
      videoUploadControllerRef.current = null;
    }
    
    // Cancel any ongoing video upload (from useDragAndDrop or other sources)
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
  }, []);

  const clearAudio = useCallback(() => {
    // Cancel any ongoing audio upload (from useMedia)
    if (audioUploadControllerRef.current) {
      audioUploadControllerRef.current.abort();
      audioUploadControllerRef.current = null;
    }
    
    // Cancel any ongoing audio upload (from useDragAndDrop or other sources)
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
        // Cancel any existing video upload (from useMedia)
        if (videoUploadControllerRef.current) {
          videoUploadControllerRef.current.abort();
        }
        
        // Cancel any existing video upload (from useDragAndDrop or useRecording)
        if ((window as any).videoUploadController) {
          (window as any).videoUploadController.abort();
        }
        
        // Create new AbortController for this upload
        const controller = new AbortController();
        videoUploadControllerRef.current = controller;
        (window as any).videoUploadController = controller;
        
        await ensureAuthToken();
        const settings = JSON.parse(localStorage.getItem("syncSettings") || "{}");
        const response = await fetch(getApiUrl("/upload"), {
          method: "POST",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ path: videoPath, apiKey: settings.syncApiKey || "" }),
          signal: controller.signal,
        });
        
        // Check if upload was aborted
        if (controller.signal.aborted) {
          return;
        }
        
        const data = await response.json().catch(() => null);
        if (response.ok && data?.ok && data?.url) {
          // Check again if upload was aborted before updating state
          if (controller.signal.aborted) {
            return;
          }
          setSelection((prev) => ({
            ...prev,
            videoUrl: data.url,
          }));
          (window as any).uploadedVideoUrl = data.url;
          localStorage.setItem("uploadedVideoUrl", data.url);
        }
        
        // Clear controller references if this was the current upload
        if (videoUploadControllerRef.current === controller) {
          videoUploadControllerRef.current = null;
        }
        if ((window as any).videoUploadController === controller) {
          (window as any).videoUploadController = null;
        }
      } catch (error: any) {
        // Ignore abort errors
        if (error?.name === 'AbortError') {
          return;
        }
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
        // Cancel any existing audio upload (from useMedia)
        if (audioUploadControllerRef.current) {
          audioUploadControllerRef.current.abort();
        }
        
        // Cancel any existing audio upload (from useDragAndDrop or useRecording)
        if ((window as any).audioUploadController) {
          (window as any).audioUploadController.abort();
        }
        
        // Create new AbortController for this upload
        const controller = new AbortController();
        audioUploadControllerRef.current = controller;
        (window as any).audioUploadController = controller;
        
        await ensureAuthToken();
        const settings = JSON.parse(localStorage.getItem("syncSettings") || "{}");
        const response = await fetch(getApiUrl("/upload"), {
          method: "POST",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ path: audioPath, apiKey: settings.syncApiKey || "" }),
          signal: controller.signal,
        });
        
        // Check if upload was aborted
        if (controller.signal.aborted) {
          return;
        }
        
        const data = await response.json().catch(() => null);
        if (response.ok && data?.ok && data?.url) {
          // Check again if upload was aborted before updating state
          if (controller.signal.aborted) {
            return;
          }
          setSelection((prev) => ({
            ...prev,
            audioUrl: data.url,
          }));
          (window as any).uploadedAudioUrl = data.url;
          localStorage.setItem("uploadedAudioUrl", data.url);
        }
        
        // Clear controller references if this was the current upload
        if (audioUploadControllerRef.current === controller) {
          audioUploadControllerRef.current = null;
        }
        if ((window as any).audioUploadController === controller) {
          (window as any).audioUploadController = null;
        }
      } catch (error: any) {
        // Ignore abort errors
        if (error?.name === 'AbortError') {
          return;
        }
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
