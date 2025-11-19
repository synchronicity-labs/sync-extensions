/**
 * Expose global window functions for backward compatibility with original codebase
 * This ensures all code that expects these functions on window will continue to work
 */

import { useMedia } from "../hooks/useMedia";
import { useJobs } from "../hooks/useJobs";
import { useTabs } from "../hooks/useTabs";
import { useCore } from "../hooks/useCore";
import { useHistory } from "../hooks/useHistory";
import { HOST_IDS } from "../../../shared/host";
import { formatTime } from "./stringUtils";
import { showToast } from "./toast";

export const setupWindowGlobals = (
  media: ReturnType<typeof useMedia>,
  jobs: ReturnType<typeof useJobs>,
  tabs: ReturnType<typeof useTabs>,
  core: ReturnType<typeof useCore>,
  history: ReturnType<typeof useHistory>
) => {
  // Core functions
  window.debugLog = core.debugLog;
  window.updateModelDisplay = core.updateModelDisplay;
  window.updateBottomBarModelDisplay = core.updateModelDisplay;
  window.ensureAuthToken = core.ensureAuthToken;
  window.authHeaders = core.authHeaders;
  window.getServerPort = () => (window as any).__syncServerPort || 3000; // Keep as any for backward compat
  window.isOffline = core.serverState.isOffline;

  // Media functions
  (window as any).openFileDialog = media.openFileDialog;
  
  // For Resolve, don't override selectVideo/selectAudio - they're set by nle-resolve.ts
  // Check if we're in Resolve (Electron context)
  const isResolve = typeof (window as any).electronAPI !== 'undefined' || 
                    (typeof process !== 'undefined' && process.versions && process.versions.electron);
  
  if (!isResolve) {
    (window as any).selectVideo = media.selectVideo;
    (window as any).selectAudio = media.selectAudio;
  } else {
    // In Resolve, only set if they don't already exist (from nle-resolve.ts)
    if (typeof (window as any).selectVideo !== 'function') {
      (window as any).selectVideo = media.selectVideo;
    }
    if (typeof (window as any).selectAudio !== 'function') {
      (window as any).selectAudio = media.selectAudio;
    }
  }
  (window as any).selectedVideo = media.selection.video;
  (window as any).selectedVideoUrl = media.selection.videoUrl;
  (window as any).selectedAudio = media.selection.audio;
  (window as any).selectedAudioUrl = media.selection.audioUrl;
  (window as any).selectedVideoIsTemp = media.selection.videoIsTemp;
  (window as any).selectedAudioIsTemp = media.selection.audioIsTemp;
  (window as any).selectedVideoIsUrl = media.selection.videoIsUrl;
  (window as any).selectedAudioIsUrl = media.selection.audioIsUrl;

  // Jobs functions
  (window as any).startLipsync = jobs.startLipsync;
  (window as any).jobs = history.jobs;

  // Tab functions
  (window as any).showTab = (tabName: string) => {
    // Map old tab names to new ones
    const tabMap: Record<string, "sources" | "history" | "settings"> = {
      sources: "sources",
      history: "history",
      settings: "settings",
    };
    
    const mappedTab = tabMap[tabName] || tabName as "sources" | "history" | "settings";
    tabs.setActiveTab(mappedTab);

    // Pause any playing media when switching tabs
    try {
      const v = document.getElementById("mainVideo");
      if (v) (v as HTMLVideoElement).pause();
    } catch (_) {}
    try {
      const ov = document.getElementById("outputVideo");
      if (ov) (ov as HTMLVideoElement).pause();
    } catch (_) {}
    try {
      const a = document.getElementById("audioPlayer");
      if (a) (a as HTMLAudioElement).pause();
    } catch (_) {}
  };

  // Toast notification function - use centralized utility
  (window as any).showToast = (message: string, type: "info" | "error" | "success" = "info") => {
    showToast(message, type);
  };

  // Debug log path function (UXP)
  window.getDebugLogPath = async () => {
    try {
      if (typeof window !== "undefined") {
        // Try UXP storage API
        try {
          const { storage } = (window as any).require?.("uxp");
          if (storage && storage.localFileSystem) {
            const fs = storage.localFileSystem;
            const dataFolder = await fs.getDataFolder();
            const baseFolder = await dataFolder.createFolder("sync. extensions", { create: true });
            const logsFolder = await baseFolder.createFolder("logs", { create: true });
            
            // Check if debug is enabled
            const debugFlag = await fs.getFileForReading(logsFolder.nativePath + "/.debug");
            if (!(await debugFlag.exists())) {
              return null; // Debug logging disabled
            }
            
            // Determine host and return appropriate log file
            const isAE = window.HOST_CONFIG && window.HOST_CONFIG.isAE;
            const isPPRO = window.HOST_CONFIG && window.HOST_CONFIG.hostId === HOST_IDS.PPRO;
            
            if (isAE) {
              return logsFolder.nativePath + "/sync_ae_debug.log";
            } else if (isPPRO) {
              return logsFolder.nativePath + "/sync_ppro_debug.log";
            } else {
              return logsFolder.nativePath + "/sync_server_debug.log";
            }
          }
        } catch (_) {
          // UXP API not available, fallback to Node.js
        }
        
        // Fallback to Node.js (for Resolve plugin)
        const fs = require("fs");
        const path = require("path");
        const os = require("os");
        const home = os.homedir();
        const logsDir =
          process.platform === "win32"
            ? path.join(home, "AppData", "Roaming", "sync. extensions", "logs")
            : path.join(home, "Library", "Application Support", "sync. extensions", "logs");

        // Check if debug is enabled
        const debugFlag = path.join(logsDir, ".debug");
        if (!fs.existsSync(debugFlag)) {
          return null; // Debug logging disabled
        }

        // Determine host and return appropriate log file
        const isAE = window.HOST_CONFIG && window.HOST_CONFIG.isAE;
        const isPPRO = window.HOST_CONFIG && window.HOST_CONFIG.hostId === HOST_IDS.PPRO;

        if (isAE) {
          return path.join(logsDir, "sync_ae_debug.log");
        } else if (isPPRO) {
          return path.join(logsDir, "sync_ppro_debug.log");
        } else {
          return path.join(logsDir, "sync_server_debug.log");
        }
      }
    } catch (_) {}
    return null;
  };

  // Open external URL function (UXP)
  window.openExternalURL = async (url: string) => {
    try {
      // Try UXP shell API
      if (typeof window !== "undefined") {
        try {
          const { shell } = (window as any).require?.("uxp");
          if (shell && shell.openExternal) {
            await shell.openExternal(url);
            return;
          }
        } catch (_) {
          // UXP API not available
        }
      }
      
      // Fallback to window.open
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (_) {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  // Set lipsync button state function
  (window as any).setLipsyncButtonState = ({ disabled, text }: { disabled?: boolean; text?: string }) => {
    try {
      const btn = document.getElementById("lipsyncBtn");
      if (!btn) return;
      
      if (typeof disabled === "boolean") {
        (btn as HTMLButtonElement).disabled = disabled;
      }
      
      if (typeof text === "string") {
        const label = btn.querySelector("span");
        if (label) {
          label.textContent = text;
          const icon = btn.querySelector("img");
          if (icon) {
            if (text === "submitted") {
              (icon as HTMLElement).style.display = "none";
            } else {
              (icon as HTMLElement).style.display = "";
            }
          }
        }
      }
    } catch (_) {}
  };

  // Update history function (already exposed by useHistory, but ensure it's here)
  (window as any).updateHistory = history.loadJobsFromServer;
  (window as any).loadJobsFromServer = history.loadJobsFromServer;

  // History card functions - exposed via HistoryTab component
  // These will be set up when HistoryTab mounts
  // Load settings function (for backward compatibility with bootstrap.js)
  // In React, settings are loaded automatically via useSettings hook, but we expose this for compatibility
  (window as any).loadSettings = () => {
    // Settings are automatically loaded in useSettings hook
    // This function exists for backward compatibility only
    if (typeof (window as any).updateModelDisplay === "function") {
      (window as any).updateModelDisplay();
    }
  };

  // Load jobs from localStorage (for backward compatibility with bootstrap.js)
  // In React, jobs are loaded from server via useHistory hook, but we expose this for compatibility
  (window as any).loadJobsLocal = () => {
    try {
      const raw = localStorage.getItem("syncJobs");
      if (raw) {
        const localJobs = (JSON.parse(raw) || []).filter((j: any) => !j.id || !j.id.startsWith("local-"));
        // Update global jobs reference for backward compatibility
        (window as any).jobs = localJobs;
      }
    } catch (_) {
      // Silently fail
    }
  };

  // History functions - these use internal functions that may not be typed
  (window as any).copyJobId = (jobId: string) => {
    if ((window as any).__historyCopyJobId) {
      (window as any).__historyCopyJobId(jobId);
    }
  };

  (window as any).copyOutputLink = (jobId: string) => {
    if ((window as any).__historyCopyOutputLink) {
      (window as any).__historyCopyOutputLink(jobId);
    }
  };

  (window as any).saveJob = async (jobId: string) => {
    if ((window as any).__historySaveJob) {
      return (window as any).__historySaveJob(jobId);
    }
  };

  (window as any).insertJob = async (jobId: string) => {
    if ((window as any).__historyInsertJob) {
      return (window as any).__historyInsertJob(jobId);
    }
  };

  // Post-lipsync action functions (for sources tab)
  // These directly call the HistoryTab handlers if available
  (window as any).saveCompletedJob = async (jobId: string) => {
    if ((window as any).__historySaveJob) {
      return (window as any).__historySaveJob(jobId);
    }
    // Fallback to saveJob if __historySaveJob not available
    if ((window as any).saveJob) {
      return (window as any).saveJob(jobId);
    }
    if (window.showToast) window.showToast('save function not available', 'error');
  };

  (window as any).insertCompletedJob = async (jobId: string) => {
    if ((window as any).__historyInsertJob) {
      return (window as any).__historyInsertJob(jobId);
    }
    // Fallback to insertJob if __historyInsertJob not available
    if ((window as any).insertJob) {
      return (window as any).insertJob(jobId);
    }
    if (window.showToast) window.showToast('insert function not available', 'error');
  };

  (window as any).clearCompletedJob = () => {
    const videoSection = document.getElementById('videoSection');
    const videoPreview = document.getElementById('videoPreview');
    const videoDropzone = document.getElementById('videoDropzone');
    const postLipsyncActions = document.getElementById('postLipsyncActions');
    const sourcesContainer = document.querySelector('.sources-container');
    const lipsyncBtn = document.getElementById('lipsyncBtn');
    const audioSection = document.getElementById('audioSection');
    
    // Remove post-lipsync actions
    if (postLipsyncActions) {
      postLipsyncActions.remove();
    }
    
    // Clear video preview
    if (videoPreview) {
      videoPreview.innerHTML = '';
      videoPreview.style.display = 'none';
    }
    
    // Show dropzone again
    if (videoDropzone) {
      videoDropzone.style.display = 'flex';
    }
    
    // Remove has-media class
    if (videoSection) {
      videoSection.classList.remove('has-media');
    }
    
    // Remove has-video and has-both classes
    if (sourcesContainer) {
      sourcesContainer.classList.remove('has-video', 'has-both');
    }
    
    // Clear output video player
    const outputVideo = document.getElementById('outputVideo');
    if (outputVideo) {
      (outputVideo as HTMLVideoElement).pause();
      (outputVideo as HTMLVideoElement).currentTime = 0;
      (outputVideo as HTMLVideoElement).removeAttribute('src');
      (outputVideo as HTMLVideoElement).load();
    }
    
    // Keep lipsync button DISABLED (default state is nothing loaded)
    // Don't re-enable - default state has no media, so button should be disabled
    if (lipsyncBtn) {
      (lipsyncBtn as HTMLButtonElement).disabled = true;
    }
    if (audioSection) {
      audioSection.style.display = '';
    }
    
    // Clear media selection to reset to standard state
    if (media.clearVideo) {
      media.clearVideo();
    }
    if (media.clearAudio) {
      media.clearAudio();
    }
    
    // Update button state after clearing
    if (typeof (window as any).updateLipsyncButton === "function") {
      (window as any).updateLipsyncButton();
    }
  };

  // Output video player initialization
  (window as any).initOutputVideoPlayer = () => {
    const video = document.getElementById('outputVideo') as HTMLVideoElement;
    const centerPlayBtn = document.getElementById('outputCenterPlayBtn');
    const playOverlay = document.getElementById('outputVideoPlayOverlay');
    const timeDisplay = document.getElementById('outputVideoTime');
    const frameInfo = document.getElementById('outputVideoFrameInfo');
    const progressFill = document.getElementById('outputVideoProgress');
    const progressThumb = document.getElementById('outputVideoThumb');
    const progressBar = document.querySelector('.video-progress-bar');
    const volumeBtn = document.getElementById('outputVolumeBtn');
    const volumeSlider = document.getElementById('outputVolumeSlider') as HTMLInputElement;
    
    if (!video) return;

    // Initialize display when metadata loads
    const updateVideoDuration = () => {
      const duration = video.duration || 0;
      const durationStr = isFinite(duration) && duration > 0 ? formatTime(duration) : '--';
      if (timeDisplay) timeDisplay.textContent = `00:00 / ${durationStr}`;
      if (frameInfo) {
        const totalFrames = isFinite(duration) && duration > 0 ? Math.floor(duration * 30) : 0;
        frameInfo.textContent = `0 / ${totalFrames || '--'}`;
      }
    };

    if (video.readyState >= 1) {
      updateVideoDuration();
    } else {
      video.addEventListener('loadedmetadata', updateVideoDuration);
    }

    // Update time and progress during playback
    const handleTimeUpdate = () => {
      const current = formatTime(video.currentTime);
      const duration = video.duration || 0;
      const durationStr = isFinite(duration) ? formatTime(duration) : '0:00';
      const progress = (video.currentTime / (duration || 1)) * 100;
      
      if (timeDisplay) timeDisplay.textContent = `${current} / ${durationStr}`;
      if (progressFill) (progressFill as HTMLElement).style.width = `${progress}%`;
      if (progressThumb) (progressThumb as HTMLElement).style.left = `${progress}%`;
      
      // Frame info (approximate)
      if (frameInfo && isFinite(duration)) {
        const currentFrame = Math.floor(video.currentTime * 30);
        const totalFrames = Math.floor(duration * 30);
        frameInfo.textContent = `${currentFrame} / ${totalFrames}`;
      }
    };

    video.addEventListener('timeupdate', handleTimeUpdate);

    // Hide overlay when playing, show when paused
    const handlePlay = () => {
      if (playOverlay) playOverlay.classList.add('hidden');
    };

    const handlePause = () => {
      if (playOverlay) playOverlay.classList.remove('hidden');
    };

    const handleEnded = () => {
      if (playOverlay) playOverlay.classList.remove('hidden');
    };

    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('ended', handleEnded);

    // Progress bar scrubbing
    if (progressBar) {
      progressBar.addEventListener('click', (e: MouseEvent) => {
        const rect = progressBar.getBoundingClientRect();
        const pos = (e.clientX - rect.left) / rect.width;
        video.currentTime = pos * video.duration;
      });
    }

    // Play/pause functionality
    const togglePlay = () => {
      if (video.paused) {
        video.play();
      } else {
        video.pause();
      }
    };

    if (centerPlayBtn) {
      centerPlayBtn.addEventListener('click', togglePlay);
    }
    video.addEventListener('click', togglePlay);

    // Volume control
    if (volumeSlider) {
      volumeSlider.addEventListener('input', (e) => {
        video.volume = (e.target as HTMLInputElement).valueAsNumber / 100;
      });
    }

    // Volume button
    if (volumeBtn) {
      volumeBtn.addEventListener('click', () => {
        video.muted = !video.muted;
        if (video.muted) {
          volumeBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="11,5 6,9 2,9 2,15 6,15 11,19 11,5"/><line x1="23" y1="9" x2="17" y2="15" stroke="currentColor" stroke-width="2"/><line x1="17" y1="9" x2="23" y2="15" stroke="currentColor" stroke-width="2"/></svg>';
        } else {
          volumeBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="11,5 6,9 2,9 2,15 6,15 11,19 11,5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>';
        }
      });
    }
  };

  (window as any).loadJobIntoSources = (jobId: string) => {
    if ((window as any).__historyLoadJobIntoSources) {
      (window as any).__historyLoadJobIntoSources(jobId);
    }
  };

  (window as any).redoGeneration = async (jobId: string) => {
    if ((window as any).__historyRedoGeneration) {
      return (window as any).__historyRedoGeneration(jobId);
    }
  };

  // Expose evalExtendScript for backward compatibility (host-specific function calls)
  // Updated to use UXP host script approach
  (window as any).evalExtendScript = async (fn: string, payload?: any) => {
    try {
      // Use UXP host script communication
      const { callUXPFunction } = await import("../../lib/utils/uxp");
      
      // Format payload - UXP functions expect JSON strings or plain strings
      let formattedPayload: string;
      if (payload === undefined || payload === null) {
        formattedPayload = "";
      } else if (typeof payload === "string") {
        // If payload is already a JSON string, use it directly
        const trimmed = payload.trim();
        if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || 
            (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
          formattedPayload = payload;
        } else {
          // Plain string, stringify it
          formattedPayload = JSON.stringify(payload);
        }
      } else {
        // Object payload, stringify it
        formattedPayload = JSON.stringify(payload);
      }
      
      // Call UXP function
      const result = await callUXPFunction(fn, formattedPayload);
      
      // Handle response
      if (result && typeof result === "object" && "ok" in result) {
        return result;
      }
      
      // If result is a string that looks like a path, wrap it
      if (typeof result === "string") {
        if (result.indexOf("/") !== -1 || result.indexOf("\\") !== -1) {
          return { ok: true, path: result };
        }
        // Try to parse as JSON
        try {
          return JSON.parse(result);
        } catch (_) {
          return { ok: false, error: result };
        }
      }
      
      return result;
    } catch (error) {
      return { ok: false, error: String(error) };
    }
  };
};

