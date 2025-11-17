import { useState, useCallback } from "react";
import { useCore } from "./useCore";
import { useMedia } from "./useMedia";
import { useSettings } from "./useSettings";
import { useTabs } from "./useTabs";
import { getApiUrl } from "../utils/serverConfig";
import { debugLog, debugError } from "../utils/debugLog";
import { getStorageItem, getSettings } from "../utils/storage";
import { STORAGE_KEYS } from "../utils/constants";

interface JobStatus {
  id: string;
  status: "pending" | "processing" | "completed" | "failed";
  progress?: number;
}

export const useJobs = () => {
  const { authHeaders, ensureAuthToken } = useCore();
  const { selection } = useMedia();
  const { settings } = useSettings();
  const { setActiveTab } = useTabs();
  const [currentJob, setCurrentJob] = useState<JobStatus | null>(null);

  const startLipsync = useCallback(async (providedVideoUrl?: string | null, providedAudioUrl?: string | null) => {
    // Restore URLs from localStorage if window globals are empty
    if (!(window as any).uploadedVideoUrl) {
      const stored = localStorage.getItem('uploadedVideoUrl');
      if (stored && stored.startsWith('http')) {
        (window as any).uploadedVideoUrl = stored;
      }
    }
    if (!(window as any).uploadedAudioUrl) {
      const stored = localStorage.getItem('uploadedAudioUrl');
      if (stored && stored.startsWith('http')) {
        (window as any).uploadedAudioUrl = stored;
      }
    }
    
    // Check if we have files for both video and audio
    const hasVideo = selection.video || selection.videoUrl || (window as any).selectedVideo || (window as any).selectedVideoUrl || (window as any).uploadedVideoUrl;
    const hasAudio = selection.audio || selection.audioUrl || (window as any).selectedAudio || (window as any).selectedAudioUrl || (window as any).uploadedAudioUrl;
    
    if (!hasVideo || !hasAudio) {
      return { ok: false, error: "Please select both video and audio files" };
    }
    
    // Get URLs - use provided URLs first, then check window globals and React state
    let videoUrl: string | null = providedVideoUrl || null;
    let audioUrl: string | null = providedAudioUrl || null;
    
    if (!videoUrl || !videoUrl.startsWith('http')) {
      // Restore from localStorage if needed
      if (!(window as any).uploadedVideoUrl || !(window as any).uploadedVideoUrl.startsWith('http')) {
        const stored = localStorage.getItem('uploadedVideoUrl');
        if (stored && stored.startsWith('http')) {
          (window as any).uploadedVideoUrl = stored;
        }
      }
      if (!(window as any).selectedVideoUrl || !(window as any).selectedVideoUrl.startsWith('http')) {
        const stored = localStorage.getItem('selectedVideoUrl');
        if (stored && stored.startsWith('http')) {
          (window as any).selectedVideoUrl = stored;
        }
      }
      
      videoUrl = (window as any).uploadedVideoUrl || (window as any).selectedVideoUrl || null;
      
      if (!videoUrl) {
    if (selection.videoIsUrl && selection.videoUrl) {
      videoUrl = selection.videoUrl;
    } else if (selection.videoUrl) {
      videoUrl = selection.videoUrl;
        }
      }
    }
    
    if (!audioUrl || !audioUrl.startsWith('http')) {
      // Restore from localStorage if needed
      if (!(window as any).uploadedAudioUrl || !(window as any).uploadedAudioUrl.startsWith('http')) {
        const stored = localStorage.getItem('uploadedAudioUrl');
        if (stored && stored.startsWith('http')) {
          (window as any).uploadedAudioUrl = stored;
        }
      }
      if (!(window as any).selectedAudioUrl || !(window as any).selectedAudioUrl.startsWith('http')) {
        const stored = localStorage.getItem('selectedAudioUrl');
        if (stored && stored.startsWith('http')) {
          (window as any).selectedAudioUrl = stored;
        }
      }
      
      audioUrl = (window as any).uploadedAudioUrl || (window as any).selectedAudioUrl || null;
      
      if (!audioUrl) {
    if (selection.audioIsUrl && selection.audioUrl) {
      audioUrl = selection.audioUrl;
    } else if (selection.audioUrl) {
      audioUrl = selection.audioUrl;
        }
      }
    }
    
    const hasVideoReady = !!videoUrl && typeof videoUrl === 'string' && videoUrl.trim() !== '' && videoUrl.startsWith('http');
    const hasAudioReady = !!audioUrl && typeof audioUrl === 'string' && audioUrl.trim() !== '' && audioUrl.startsWith('http');

    if (!hasVideoReady || !hasAudioReady) {
      return { ok: false, error: "Please select both video and audio files" };
    }

    try {
      await ensureAuthToken();

      if (!videoUrl || !audioUrl) {
        // Reset button state
        if (typeof (window as any).setLipsyncButtonState === "function") {
          (window as any).setLipsyncButtonState({ disabled: false, text: "lipsync" });
        }
        return { ok: false, error: "Video and audio URLs are not ready" };
      }

      // Build options object
      const options: any = {};
      if (settings.syncMode) {
        options.sync_mode = settings.syncMode;
      }
      if (settings.activeSpeakerOnly) {
        options.active_speaker_detection = { auto_detect: true };
      }
      if (settings.detectObstructions) {
        options.occlusion_detection_enabled = true;
      }
      if (settings.temperature !== undefined && settings.temperature !== null) {
        options.temperature = settings.temperature;
      }
      
      const body = {
        videoUrl,
        audioUrl,
        model: settings.model || "lipsync-2-pro",
        temperature: settings.temperature || 0.7,
        activeSpeakerOnly: settings.activeSpeakerOnly || false,
        detectObstructions: settings.detectObstructions || false,
        options,
        syncApiKey: settings.syncApiKey,
      };

      const response = await fetch(getApiUrl("/jobs"), {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(body),
      });

      const data = await response.json().catch(() => null);
      
      if (response.ok && data?.id) {
        const jobId = data.id;
        setCurrentJob({ id: jobId, status: "processing" });
        
        // Wait for job to appear in history before switching tabs (like main branch)
        const waitForJobInHistory = async () => {
          const maxAttempts = 20;
          const delayMs = 250;
          
          for (let attempt = 0; attempt < maxAttempts; attempt++) {
            // Load jobs from server
            if (typeof (window as any).loadJobsFromServer === "function") {
              await (window as any).loadJobsFromServer();
            }
            
            // Wait a bit for jobs to load
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Check if job appears by fetching from API directly
            try {
              const settings = getSettings();
              const apiKey = settings.syncApiKey || "";
              
              if (apiKey) {
                const url = new URL(`${getApiUrl("/jobs")}`);
                url.searchParams.set("syncApiKey", apiKey);
                
                const checkResponse = await fetch(url.toString(), {
                  method: "GET",
                  headers: authHeaders(),
                });
                
                if (checkResponse.ok) {
                  const jobsData = await checkResponse.json().catch(() => null);
                  const jobsArray = Array.isArray(jobsData) ? jobsData : [];
                  const jobFound = jobsArray.some((j: any) => String(j.id) === String(jobId));
                  
                  if (jobFound) {
                    // Show toast notification
                    if (typeof (window as any).showToast === "function") {
                      (window as any).showToast("submitted", "success");
                    }
                    
                    // Job found - now switch to history tab
        setActiveTab("history");
        
                    // Set button state to normal "lipsync" and disabled (greyed out state)
                    if (typeof (window as any).setLipsyncButtonState === "function") {
                      (window as any).setLipsyncButtonState({ disabled: true, text: "lipsync" });
        }
        
                    // Set monitoring job ID for silent monitoring
        (window as any).__monitoringJobId = jobId;
        
                    return;
                  }
                }
              }
            } catch (error) {
              // Continue polling on error
            }
            
            await new Promise(resolve => setTimeout(resolve, delayMs));
          }
          
          // Fallback: switch to history even if job not found yet
          if (typeof (window as any).showToast === "function") {
            (window as any).showToast("submitted", "success");
          }
          
          setActiveTab("history");
        if (typeof (window as any).setLipsyncButtonState === "function") {
          (window as any).setLipsyncButtonState({ disabled: true, text: "lipsync" });
        }
          (window as any).__monitoringJobId = jobId;
        };
        
        // Wait for job in background (don't await - let it happen async)
        waitForJobInHistory();
        
        return { ok: true, jobId };
      } else {
        if (typeof (window as any).setLipsyncButtonState === "function") {
          (window as any).setLipsyncButtonState({ disabled: false, text: "lipsync" });
        }
        return { ok: false, error: data?.error || "Failed to start job" };
      }
    } catch (error: any) {
      debugError("[useJobs] Error submitting job", error);
      if (typeof (window as any).setLipsyncButtonState === "function") {
        (window as any).setLipsyncButtonState({ disabled: false, text: "lipsync" });
      }
      return { ok: false, error: error.message || "Unknown error" };
    }
  }, [selection, settings, authHeaders, ensureAuthToken, setActiveTab]);

  const checkJobStatus = useCallback(async (jobId: string) => {
    try {
      await ensureAuthToken();
      const response = await fetch(getApiUrl(`/jobs/${jobId}`), {
        headers: authHeaders(),
      });

      const data = await response.json().catch(() => null);
      if (response.ok && data?.ok) {
        setCurrentJob({
          id: jobId,
          status: data.status || "pending",
          progress: data.progress,
        });
        return data;
      }
      return { ok: false };
    } catch (_) {
      return { ok: false };
    }
  }, [authHeaders, ensureAuthToken]);

  return {
    currentJob,
    startLipsync,
    checkJobStatus,
  };
};
