import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { ChevronDown } from "lucide-react";
import whiteIcon from "../../assets/icons/white_icon.png";
import { useJobs } from "../hooks/useJobs";
import { useMedia } from "../hooks/useMedia";
import { useCost } from "../hooks/useCost";
import { useSettings } from "../hooks/useSettings";
import { useCore } from "../hooks/useCore";
import { useTabs } from "../hooks/useTabs";
import { getStorageItem } from "../utils/storage";
import { STORAGE_KEYS } from "../utils/constants";
import { debugLog, debugError } from "../utils/debugLog";
import ModelSelector from "./ModelSelector";

const BottomBar: React.FC = () => {
  const { selection } = useMedia();
  const { settings } = useSettings();
  const { estimatedCost, isLoading: isCostLoading, estimateCost } = useCost();
  const { startLipsync } = useJobs();
  const { updateModelDisplay } = useCore();
  const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
  const [forceUpdateCounter, setForceUpdateCounter] = useState(0);

  // Expose startLipsync on window for backward compatibility
  useEffect(() => {
    (window as any).startLipsync = startLipsync;
  }, [startLipsync]);

  useEffect(() => {
    updateModelDisplay();
  }, [settings.model, updateModelDisplay]);

  // Helper function to get R2 URLs - matches hasVideoReady/hasAudioReady logic
  const getVideoUrl = useCallback(() => {
    const hasWindowVideo = !!(window as any).selectedVideo || !!(window as any).selectedVideoUrl || !!(window as any).uploadedVideoUrl;
    const hasReactVideo = !!selection.video || !!selection.videoUrl;
    
    if (!hasWindowVideo && !hasReactVideo) {
      return null;
    }
    
    let videoUrl: string | null = (window as any).uploadedVideoUrl || (window as any).selectedVideoUrl || null;
    
    if (!videoUrl) {
      if (selection.videoIsUrl && selection.videoUrl) {
        videoUrl = selection.videoUrl;
      } else if (selection.videoUrl) {
        videoUrl = selection.videoUrl;
      } else {
        const stored = localStorage.getItem('uploadedVideoUrl');
        if (stored && stored.startsWith('http')) {
          videoUrl = stored;
    }
      }
    }
    
    return videoUrl;
  }, [selection.video, selection.videoUrl, selection.videoIsUrl]);

  const getAudioUrl = useCallback(() => {
    const hasWindowAudio = !!(window as any).selectedAudio || !!(window as any).selectedAudioUrl || !!(window as any).uploadedAudioUrl;
    const hasReactAudio = !!selection.audio || !!selection.audioUrl;
    
    if (!hasWindowAudio && !hasReactAudio) {
      return null;
    }
    
    let audioUrl: string | null = (window as any).uploadedAudioUrl || (window as any).selectedAudioUrl || null;
    
    if (!audioUrl) {
      if (selection.audioIsUrl && selection.audioUrl) {
        audioUrl = selection.audioUrl;
      } else if (selection.audioUrl) {
        audioUrl = selection.audioUrl;
      } else {
        const stored = localStorage.getItem('uploadedAudioUrl');
        if (stored && stored.startsWith('http')) {
          audioUrl = stored;
    }
      }
    }
    
    return audioUrl;
  }, [selection.audio, selection.audioUrl, selection.audioIsUrl]);

  // Estimate cost when media changes - only use actual R2 URLs, not file paths
  useEffect(() => {
    // Check if we have files selected (only check React state to avoid stale window globals on load)
    const hasVideoSelected = !!selection.video || !!selection.videoUrl;
    const hasAudioSelected = !!selection.audio || !!selection.audioUrl;
    const hasBothFilesSelected = hasVideoSelected && hasAudioSelected;
    
    // Get URLs directly (don't rely on callbacks that might be stale)
    // Check all possible sources: React state, window globals, localStorage
    // IMPORTANT: Only check window globals if React state indicates files are selected
    // This prevents stale values from previous sessions showing "estimating..." on load
    let videoUrl: string | null = null;
    let audioUrl: string | null = null;
    
    // For video: check React state first, then fall back to window globals/storage
    if (selection.videoIsUrl && selection.videoUrl) {
      // React state has URL
      videoUrl = selection.videoUrl;
    } else if (selection.videoUrl) {
      // React state has URL (even if selection.video isn't set yet)
      videoUrl = selection.videoUrl;
    } else if (selection.video && !selection.videoIsUrl) {
      // React state has local file path - get R2 URL from all sources
      videoUrl = (window as any).uploadedVideoUrl || 
                 (window as any).selectedVideoUrl ||
                 getStorageItem<string>(STORAGE_KEYS.UPLOADED_VIDEO_URL) ||
                 localStorage.getItem('uploadedVideoUrl') ||
                 null;
    } else if (hasVideoSelected) {
      // Files are selected in React state but URLs might be in window globals
      // Only check if React state indicates files are selected (prevents stale values on load)
      videoUrl = (window as any).uploadedVideoUrl || 
                 (window as any).selectedVideoUrl ||
                 getStorageItem<string>(STORAGE_KEYS.UPLOADED_VIDEO_URL) ||
                 localStorage.getItem('uploadedVideoUrl') ||
                 null;
    }
    
    // For audio: check React state first, then fall back to window globals/storage
    if (selection.audioIsUrl && selection.audioUrl) {
      // React state has URL
      audioUrl = selection.audioUrl;
    } else if (selection.audioUrl) {
      // React state has URL (even if selection.audio isn't set yet)
      audioUrl = selection.audioUrl;
    } else if (selection.audio && !selection.audioIsUrl) {
      // React state has local file path - get R2 URL from all sources
      audioUrl = (window as any).uploadedAudioUrl || 
                 (window as any).selectedAudioUrl ||
                 getStorageItem<string>(STORAGE_KEYS.UPLOADED_AUDIO_URL) ||
                 localStorage.getItem('uploadedAudioUrl') ||
                 null;
    } else if (hasAudioSelected) {
      // Files are selected in React state but URLs might be in window globals
      // Only check if React state indicates files are selected (prevents stale values on load)
      audioUrl = (window as any).uploadedAudioUrl || 
                 (window as any).selectedAudioUrl ||
                 getStorageItem<string>(STORAGE_KEYS.UPLOADED_AUDIO_URL) ||
                 localStorage.getItem('uploadedAudioUrl') ||
                 null;
    }
    
    // Debug logging (sent to server logs for CEP)
    debugLog('[BottomBar] Cost estimation check', {
      hasVideo: !!selection.video,
      hasAudio: !!selection.audio,
      videoUrl: videoUrl ? videoUrl.substring(0, 50) + '...' : null,
      audioUrl: audioUrl ? audioUrl.substring(0, 50) + '...' : null,
      selectionVideoUrl: selection.videoUrl ? selection.videoUrl.substring(0, 50) + '...' : null,
      selectionAudioUrl: selection.audioUrl ? selection.audioUrl.substring(0, 50) + '...' : null,
      windowVideoUrl: (window as any).uploadedVideoUrl ? String((window as any).uploadedVideoUrl).substring(0, 50) + '...' : null,
      windowAudioUrl: (window as any).uploadedAudioUrl ? String((window as any).uploadedAudioUrl).substring(0, 50) + '...' : null,
      estimatedCost,
      isCostLoading
    });
    
    // Only estimate cost if we have actual URLs (not file paths)
    if (videoUrl && audioUrl) {
      debugLog('[BottomBar] Calling estimateCost with URLs', {
        videoUrl: videoUrl.substring(0, 50) + '...',
        audioUrl: audioUrl.substring(0, 50) + '...',
        hasReactVideo: !!selection.video,
        hasReactAudio: !!selection.audio,
        currentEstimatedCost: estimatedCost
      });
      estimateCost(videoUrl, audioUrl);
    } else if (!hasVideoSelected && !hasAudioSelected) {
      // Check if URLs exist in window globals - if so, don't reset (files might be selected but React state not updated yet)
      const hasWindowUrls = !!(window as any).uploadedVideoUrl && !!(window as any).uploadedAudioUrl;
      if (hasWindowUrls) {
        debugLog('[BottomBar] React state says no files, but window globals have URLs - keeping current state', {
          windowVideoUrl: !!(window as any).uploadedVideoUrl,
          windowAudioUrl: !!(window as any).uploadedAudioUrl,
          currentEstimatedCost: estimatedCost
        });
        // Don't reset - URLs are available, cost estimation will happen via event handler
      } else {
      // No files selected at all - reset cost (will show $--)
      debugLog('[BottomBar] No files selected, resetting cost', {
        previousCost: estimatedCost
      });
      estimateCost("", "");
      }
    } else {
      // Files are selected but URLs aren't ready yet - show loading state
      // IMPORTANT: DON'T call estimateCost("", "") here - that would reset cost to null
      // If we already have a cost and files are still selected, keep it
      // The polling effect will handle calling estimateCost when URLs become available
      debugLog('[BottomBar] Files selected but URLs not ready yet, showing loading', {
        hasVideo: hasVideoSelected,
        hasAudio: hasAudioSelected,
        hasBothFiles: hasBothFilesSelected,
        videoUrl: !!videoUrl,
        audioUrl: !!audioUrl,
        selectionVideoUrl: !!selection.videoUrl,
        selectionAudioUrl: !!selection.audioUrl,
        windowVideoUrl: !!(window as any).uploadedVideoUrl,
        windowAudioUrl: !!(window as any).uploadedAudioUrl,
        currentEstimatedCost: estimatedCost,
        willKeepCost: estimatedCost !== null && hasBothFilesSelected
      });
      // Don't reset cost here - keep existing cost if we have one and files are still selected
    }
    // If files are selected but URLs aren't ready, do nothing (keep current state)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selection.video, 
    selection.videoUrl, 
    selection.videoIsUrl,
    selection.audio, 
    selection.audioUrl, 
    selection.audioIsUrl
    // Note: estimateCost is intentionally excluded from deps to prevent unnecessary re-runs
    // The function is stable due to useCallback, but including it causes the effect to run
    // multiple times, potentially resetting the cost before URLs are ready
  ]);
  
  // Listen for media URL updates and trigger cost estimation
  useEffect(() => {
    const handleMediaUrlUpdate = () => {
      debugLog('[BottomBar] mediaUrlUpdated event received, triggering cost check');
      // Force a re-check by accessing selection state
      // The main useEffect will handle the actual cost estimation
      // This is just to ensure it runs when URLs are set
      const videoUrl = selection.videoUrl || (window as any).uploadedVideoUrl;
      const audioUrl = selection.audioUrl || (window as any).uploadedAudioUrl;
      if (videoUrl && audioUrl) {
        debugLog('[BottomBar] Event handler: URLs available, calling estimateCost', {
          videoUrl: videoUrl.substring(0, 50) + '...',
          audioUrl: audioUrl.substring(0, 50) + '...',
        });
        estimateCost(videoUrl, audioUrl);
      }
    };
    
    const handleMediaCleared = () => {
      debugLog('[BottomBar] mediaCleared event received, resetting cost');
      // Reset cost when files are cleared
      estimateCost("", "");
    };
    
    window.addEventListener('mediaUrlUpdated', handleMediaUrlUpdate);
    window.addEventListener('mediaCleared', handleMediaCleared);
    return () => {
      window.removeEventListener('mediaUrlUpdated', handleMediaUrlUpdate);
      window.removeEventListener('mediaCleared', handleMediaCleared);
    };
  }, [selection.videoUrl, selection.audioUrl, estimateCost]);
  
  // Poll for R2 URLs when files are selected but URLs aren't in React state yet
  // This effect runs whenever selection changes and actively checks for URLs
  useEffect(() => {
    const hasVideo = selection.video || selection.videoUrl;
    const hasAudio = selection.audio || selection.audioUrl;
    
    // Only poll if we have files but URLs might not be in React state yet
    if (!hasVideo || !hasAudio) {
      return;
    }
    
    // Helper to get URLs directly - checks all sources
    const getUrls = () => {
      let videoUrl: string | null = null;
      let audioUrl: string | null = null;
      
      // Video URL - check React state first, then window globals/storage
      if (selection.videoIsUrl && selection.videoUrl) {
        videoUrl = selection.videoUrl;
      } else if (selection.videoUrl) {
        // React state has URL (even if selection.video isn't set yet)
        videoUrl = selection.videoUrl;
      } else if (selection.video && !selection.videoIsUrl) {
        // Local file - check window globals and storage
        videoUrl = (window as any).uploadedVideoUrl || 
                   (window as any).selectedVideoUrl ||
                   getStorageItem<string>(STORAGE_KEYS.UPLOADED_VIDEO_URL) ||
                   localStorage.getItem('uploadedVideoUrl') ||
                   null;
      } else if (hasVideo) {
        // Files are selected (hasVideo is true) but React state might not have video path yet
        // Check window globals and storage for URLs
        videoUrl = (window as any).uploadedVideoUrl || 
                   (window as any).selectedVideoUrl ||
                   getStorageItem<string>(STORAGE_KEYS.UPLOADED_VIDEO_URL) ||
                   localStorage.getItem('uploadedVideoUrl') ||
                   null;
      }
      
      // Audio URL - check React state first, then window globals/storage
      if (selection.audioIsUrl && selection.audioUrl) {
        audioUrl = selection.audioUrl;
      } else if (selection.audioUrl) {
        // React state has URL (even if selection.audio isn't set yet)
        audioUrl = selection.audioUrl;
      } else if (selection.audio && !selection.audioIsUrl) {
        // Local file - check window globals and storage
        audioUrl = (window as any).uploadedAudioUrl || 
                   (window as any).selectedAudioUrl ||
                   getStorageItem<string>(STORAGE_KEYS.UPLOADED_AUDIO_URL) ||
                   localStorage.getItem('uploadedAudioUrl') ||
                   null;
      } else if (hasAudio) {
        // Files are selected (hasAudio is true) but React state might not have audio path yet
        // Check window globals and storage for URLs
        audioUrl = (window as any).uploadedAudioUrl || 
                   (window as any).selectedAudioUrl ||
                   getStorageItem<string>(STORAGE_KEYS.UPLOADED_AUDIO_URL) ||
                   localStorage.getItem('uploadedAudioUrl') ||
                   null;
      }
      
      return { videoUrl, audioUrl };
    };
    
    // Check immediately
    const { videoUrl, audioUrl } = getUrls();
    
    if (videoUrl && audioUrl) {
      // URLs found, trigger cost estimation immediately
      debugLog('[BottomBar] Polling: URLs found immediately, calling estimateCost', {
        videoUrl: videoUrl.substring(0, 50) + '...',
        audioUrl: audioUrl.substring(0, 50) + '...'
      });
      estimateCost(videoUrl, audioUrl);
      return; // No need to poll
    }
    
    // URLs not ready yet - poll for them
    debugLog('[BottomBar] Polling: Starting to poll for URLs', {
      hasVideo: !!selection.video,
      hasAudio: !!selection.audio,
      selectionVideoUrl: !!selection.videoUrl,
      selectionAudioUrl: !!selection.audioUrl,
      windowVideoUrl: !!(window as any).uploadedVideoUrl,
      windowAudioUrl: !!(window as any).uploadedAudioUrl
    });
    
    let attempts = 0;
    const maxAttempts = 60; // 30 seconds at 500ms intervals
    const interval = setInterval(() => {
      attempts++;
      const { videoUrl: currentVideoUrl, audioUrl: currentAudioUrl } = getUrls();
      
      if (currentVideoUrl && currentAudioUrl) {
        debugLog('[BottomBar] Polling: URLs became available on attempt', {
          attempts,
          videoUrl: currentVideoUrl.substring(0, 50) + '...',
          audioUrl: currentAudioUrl.substring(0, 50) + '...'
        });
        estimateCost(currentVideoUrl, currentAudioUrl);
        clearInterval(interval);
        return;
      }
      
      // Stop polling if we've exceeded max attempts
      if (attempts >= maxAttempts) {
        debugLog('[BottomBar] Polling: Max attempts reached, stopping', {
          attempts,
          hasVideo: !!selection.video,
          hasAudio: !!selection.audio
        });
        clearInterval(interval);
      }
    }, 500);
    
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection.video, selection.audio, selection.videoUrl, selection.audioUrl, selection.videoIsUrl, selection.audioIsUrl
    // Note: estimateCost is intentionally excluded from deps to prevent unnecessary re-runs
  ]);

  const { activeTab } = useTabs();

  // Update button when R2 URLs change (for local file uploads)
  // Also listen for custom events that indicate URLs are ready
  useEffect(() => {
    if (typeof (window as any).updateLipsyncButton === "function") {
      (window as any).updateLipsyncButton();
    }
    
    // Listen for mediaUrlUpdated events to re-evaluate button state
    const handleMediaUrlUpdate = () => {
      setForceUpdateCounter(prev => prev + 1);
    };
    
    window.addEventListener('mediaUrlUpdated', handleMediaUrlUpdate);
    
    return () => {
      window.removeEventListener('mediaUrlUpdated', handleMediaUrlUpdate);
    };
  }, [
    selection.video,
    selection.videoUrl,
    selection.videoIsUrl,
    selection.audio,
    selection.audioUrl,
    selection.audioIsUrl,
  ]);

  // Check if R2 URLs are ready - check window globals first, then React state
  const hasVideoReady = useMemo(() => {
    const hasWindowVideo = !!(window as any).selectedVideo || !!(window as any).selectedVideoUrl || !!(window as any).uploadedVideoUrl;
    const hasReactVideo = !!selection.video || !!selection.videoUrl;
    
    if (!hasWindowVideo && !hasReactVideo) {
      return false;
    }
    
    let videoUrl: string | null = (window as any).uploadedVideoUrl || (window as any).selectedVideoUrl || null;
    
    if (!videoUrl) {
    if (selection.videoIsUrl && selection.videoUrl) {
      videoUrl = selection.videoUrl;
    } else if (selection.videoUrl) {
      videoUrl = selection.videoUrl;
      } else {
        const stored = localStorage.getItem('uploadedVideoUrl');
        if (stored && stored.startsWith('http')) {
          videoUrl = stored;
        }
      }
    }
    
    return !!videoUrl && typeof videoUrl === 'string' && videoUrl.trim() !== '' && videoUrl.startsWith('http');
  }, [selection.video, selection.videoUrl, selection.videoIsUrl, forceUpdateCounter]);

  const hasAudioReady = useMemo(() => {
    const hasWindowAudio = !!(window as any).selectedAudio || !!(window as any).selectedAudioUrl || !!(window as any).uploadedAudioUrl;
    const hasReactAudio = !!selection.audio || !!selection.audioUrl;
    
    if (!hasWindowAudio && !hasReactAudio) {
      return false;
    }
    
    let audioUrl: string | null = (window as any).uploadedAudioUrl || (window as any).selectedAudioUrl || null;
    
    if (!audioUrl) {
    if (selection.audioIsUrl && selection.audioUrl) {
      audioUrl = selection.audioUrl;
    } else if (selection.audioUrl) {
      audioUrl = selection.audioUrl;
      } else {
        const stored = localStorage.getItem('uploadedAudioUrl');
        if (stored && stored.startsWith('http')) {
          audioUrl = stored;
        }
      }
    }
    
    return !!audioUrl && typeof audioUrl === 'string' && audioUrl.trim() !== '' && audioUrl.startsWith('http');
  }, [selection.audio, selection.audioUrl, selection.audioIsUrl, forceUpdateCounter]);

  const [isSubmitting, setIsSubmitting] = useState(false);

  // canLipsync must be defined AFTER hasVideoReady and hasAudioReady
  const canLipsync = useMemo(() => {
    // Button should be disabled on history tab
    if (activeTab === "history") {
      return false;
    }
    // Button should be disabled if currently submitting or just submitted
    if (isSubmitting) {
      return false;
    }
    // Button is only enabled when both video and audio are ready
    return hasVideoReady && hasAudioReady;
  }, [hasVideoReady, hasAudioReady, activeTab, isSubmitting]);

  // Keep button disabled when on history tab, reset text when switching back to sources (like main branch)
  useEffect(() => {
    const btn = document.getElementById("lipsyncBtn");
    if (!btn) return;
    
    if (activeTab === "history") {
      // On history tab: keep disabled and reset to "lipsync" (greyed out state)
      (btn as HTMLButtonElement).disabled = true;
      const span = btn.querySelector("span");
      if (span) {
        span.textContent = "lipsync";
      }
      const icon = btn.querySelector("img");
      if (icon) {
        (icon as HTMLElement).style.display = "";
      }
    } else if (activeTab === "sources") {
      // On sources tab: reset button text to "lipsync" if it was "submitted" or "submitting..."
      const span = btn.querySelector("span");
      if (span && (span.textContent === "submitted" || span.textContent === "submitting...")) {
        span.textContent = "lipsync";
        const icon = btn.querySelector("img");
        if (icon) {
          (icon as HTMLElement).style.display = "";
        }
      }
      // Reset submitting flag only after sources are cleared (when both are not ready)
      // This ensures button stays disabled until user selects new files
      if (!hasVideoReady || !hasAudioReady) {
        setIsSubmitting(false);
      }
    }
  }, [activeTab, hasVideoReady, hasAudioReady]);

  const handleLipsync = useCallback(async () => {
    // Prevent double submission
    if (isSubmitting) {
      return;
    }
    
    if (!canLipsync) {
      if (typeof (window as any).showToast === "function") {
        (window as any).showToast("please select both video and audio files", "error");
      }
      return;
    }
    
    // Set submitting flag
    setIsSubmitting(true);
    
    // Update button state to show "submitting..."
    const btn = document.getElementById("lipsyncBtn");
    if (btn) {
      (btn as HTMLButtonElement).disabled = true;
      const span = btn.querySelector("span");
      if (span) {
        span.textContent = "submitting...";
      }
    }
    
    if (typeof (window as any).setLipsyncButtonState === "function") {
      (window as any).setLipsyncButtonState({ disabled: true, text: "submitting..." });
    }
    
    // Get URLs using helper functions
    const videoUrlToSubmit = getVideoUrl();
    const audioUrlToSubmit = getAudioUrl();
    
    try {
      const result = await startLipsync(videoUrlToSubmit, audioUrlToSubmit);
      
      if (!result?.ok && result?.error) {
        debugError("[BottomBar] startLipsync failed", new Error(result.error));
        if (typeof (window as any).showToast === "function") {
          (window as any).showToast(result.error, "error");
        }
        if (typeof (window as any).setLipsyncButtonState === "function") {
          (window as any).setLipsyncButtonState({ disabled: !canLipsync, text: "lipsync" });
        }
        setIsSubmitting(false);
      } else if (result?.ok) {
        // Success - keep isSubmitting true until sources are cleared
        // This ensures button stays disabled even if user switches back to sources tab
      }
    } catch (error: any) {
      debugError("[BottomBar] Error in handleLipsync", error);
      if (typeof (window as any).showToast === "function") {
        (window as any).showToast(error.message || "failed to start lipsync", "error");
      }
      if (typeof (window as any).setLipsyncButtonState === "function") {
        (window as any).setLipsyncButtonState({ disabled: !canLipsync, text: "lipsync" });
      }
      setIsSubmitting(false);
    }
  }, [canLipsync, isSubmitting, getVideoUrl, getAudioUrl, startLipsync]);

  // Attach direct event listener as fallback (in case React onClick doesn't fire)
  useEffect(() => {
    const btn = document.getElementById("lipsyncBtn");
    if (!btn) return;
    
    const handleClick = (e: Event) => {
      // Prevent double submission - if React onClick already handled it, don't handle again
      if (isSubmitting) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      
      if (!(btn as HTMLButtonElement).disabled) {
        handleLipsync();
      }
    };
    
    btn.addEventListener("click", handleClick);
    
    return () => {
      btn.removeEventListener("click", handleClick);
    };
  }, [handleLipsync, isSubmitting]);

  const modelDisplayMap: Record<string, string> = {
    "lipsync-1.9.0-beta": "lipsync 1.9",
    "lipsync-2": "lipsync 2",
    "lipsync-2-pro": "lipsync 2 pro",
  };

  const displayName = modelDisplayMap[settings.model] || settings.model.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());

  // Determine if we should show loading state
  const shouldShowLoading = useMemo(() => {
    // Show loading if cost estimation is in progress
    if (isCostLoading) return true;
    
    // Check if files are selected (only check React state to avoid stale window globals on load)
    const hasVideoSelected = !!selection.video || !!selection.videoUrl;
    const hasAudioSelected = !!selection.audio || !!selection.audioUrl;
    
    // Only show loading if BOTH files are selected in React state
    if (hasVideoSelected && hasAudioSelected) {
      // Use the same helper functions to check URLs
      const videoUrl = getVideoUrl();
      const audioUrl = getAudioUrl();
      
      // If we have files but URLs aren't ready, show loading
      if (!videoUrl || !audioUrl) {
        return true;
      }
    }
    
    // Don't show loading if files aren't selected or only one file is selected
    return false;
  }, [isCostLoading, selection.video, selection.videoUrl, selection.videoIsUrl, selection.audio, selection.audioUrl, selection.audioIsUrl, getVideoUrl, getAudioUrl]);

  return (
    <>
      <div className="bottom-bar">
        <div className="bottom-content">
          <button className="model-btn" id="modelSelectorBtn" onClick={() => setModelSelectorOpen(true)}>
            <span id="currentModel">{displayName}</span>
            <ChevronDown size={20} />
            <div className="update-dot"></div>
          </button>
          <button className="lipsync-btn" id="lipsyncBtn" disabled={!canLipsync} onClick={handleLipsync}>
            <img src={whiteIcon} alt="sync." />
            <span>lipsync</span>
          </button>
        </div>
        <p className="cost-display" id="costDisplay">
          <span className="cost-label">est. cost:</span>{" "}
          {shouldShowLoading ? (
            <span className="cost-loading">estimating...</span>
          ) : (() => {
            // Check if BOTH files are selected (check React state and window globals as fallback)
            const hasVideoSelected = !!selection.video || !!selection.videoUrl;
            const hasAudioSelected = !!selection.audio || !!selection.audioUrl;
            // Also check window globals in case React state hasn't updated yet
            // Check for non-empty strings (empty string means cleared)
            const windowVideoUrl = (window as any).uploadedVideoUrl;
            const windowAudioUrl = (window as any).uploadedAudioUrl;
            const hasWindowUrls = !!(windowVideoUrl && windowVideoUrl.trim()) && !!(windowAudioUrl && windowAudioUrl.trim());
            const hasBothFilesSelected = hasVideoSelected && hasAudioSelected;
            const hasBothFilesOrUrls = hasBothFilesSelected || hasWindowUrls;
            
            // Show actual cost ONLY if we have both files/URLs AND cost is set
            // If files are cleared, show $-- even if cost was previously set
            if (estimatedCost !== null && typeof estimatedCost === 'number' && hasBothFilesOrUrls) {
              return <span className="cost-value">${estimatedCost.toFixed(2)}</span>;
            }
            
            // Show $-- if not both files are selected/URLs available OR if cost estimation hasn't been done yet
            return <span className="cost-value">$--</span>;
          })()}
        </p>
      </div>
      <ModelSelector isOpen={modelSelectorOpen} onClose={() => setModelSelectorOpen(false)} />
    </>
  );
};

export default BottomBar;
