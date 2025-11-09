import React, { useEffect, useRef, useState, Component, ErrorInfo, ReactNode, useMemo } from "react";
import { useHistory } from "../hooks/useHistory";
import { useTabs } from "../hooks/useTabs";
import { useCore } from "../hooks/useCore";
import { useNLE } from "../hooks/useNLE";
import { useMedia } from "../hooks/useMedia";
import { getApiUrl } from "../utils/serverConfig";
import { loaderHTML } from "../utils/loader";
import { HOST_IDS } from "../../../shared/host";

// Utility functions
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    const remainingSeconds = seconds % 60;
    return `${hours}h ${remainingMinutes}m ${remainingSeconds}s`;
  } else if (minutes > 0) {
    const remainingSeconds = seconds % 60;
    return `${minutes}min ${remainingSeconds}sec`;
  } else {
    return `${seconds}sec`;
  }
}

function formatHistoryTimestamp(job: any): string {
  if (!job.createdAt) return '';
  
  try {
    const date = new Date(job.createdAt);
    const time = date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit',
      hour12: true 
    });
    const dateStr = date.toLocaleDateString('en-US', {
      month: 'numeric',
      day: 'numeric',
      year: 'numeric'
    });
    
    // Add duration if completed
    if (job.status === 'completed' && job.completedAt) {
      const created = new Date(job.createdAt);
      const completed = new Date(job.completedAt);
      const durationMs = completed.getTime() - created.getTime();
      const durationStr = formatDuration(durationMs);
      return `${time} on ${dateStr} · took ${durationStr}`;
    }
    
    return `${time} on ${dateStr}`;
  } catch (e) {
    return job.createdAt || '';
  }
}

function getModelText(job: any): string {
  const parts = [];
  
  if (job.model) {
    const modelDisplayMap: Record<string, string> = {
      'lipsync-1.9.0-beta': 'lipsync 1.9',
      'lipsync-2': 'lipsync 2',
      'lipsync-2-pro': 'lipsync 2 pro',
      'lipsync 2 pro': 'lipsync 2 pro',
      'lipsync 1.9': 'lipsync 1.9'
    };
    const displayModel = modelDisplayMap[job.model] || job.model.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    parts.push(displayModel);
  }
  
  // Add all options if available
  if (job.options && typeof job.options === 'object') {
    // Sync mode
    if (job.options.sync_mode) {
      parts.push(job.options.sync_mode);
    }
    
    // Active speaker detection
    if (job.options.active_speaker_detection) {
      if (typeof job.options.active_speaker_detection === 'object' && job.options.active_speaker_detection.auto_detect) {
        parts.push('asd');
      } else if (job.options.active_speaker_detection === true) {
        parts.push('asd');
      }
    }
    
    // Obstruction/occlusion detection
    if (job.options.occlusion_detection_enabled || job.options.obstruction_detection_enabled) {
      parts.push('obstruction detection');
    }
    
    // Reasoning
    if (job.options.reasoning_enabled) {
      parts.push('reasoning');
    }
    
    // Temperature (if not default)
    if (job.options.temperature !== undefined && job.options.temperature !== 1) {
      parts.push(`temp: ${job.options.temperature}`);
    }
  }
  
  return parts.join(' · ');
}

function copyToClipboard(text: string): boolean {
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    const success = document.execCommand('copy');
    document.body.removeChild(textarea);
    if (success) return true;
  } catch(e) {
    console.error('Copy method 1 failed:', e);
  }
  
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text);
      return true;
    }
  } catch(e) {
    console.error('Copy method 2 failed:', e);
  }
  
  return false;
}

const HistoryTabContent: React.FC = () => {
  const [hasError, setHasError] = useState(false);
  const [thumbnailUrls, setThumbnailUrls] = useState<Record<string, string>>({});
  const { jobs, isLoading, hasMore, loadMore, loadJobsFromServer, displayedCount, serverError } = useHistory();
  const { serverState } = useCore();
  const { setActiveTab, activeTab } = useTabs();
  const { nle } = useNLE();
  const { setSelection } = useMedia();
  const hasLoadedRef = useRef(false);
  const loadJobsRef = useRef(loadJobsFromServer);

  // Keep ref updated
  useEffect(() => {
    loadJobsRef.current = loadJobsFromServer;
  }, [loadJobsFromServer]);

  // Load jobs when tab becomes active
  useEffect(() => {
    if (activeTab !== "history") {
      hasLoadedRef.current = false;
      return;
    }

    setHasError(false);
    try {
      loadJobsRef.current().catch((error) => {
        console.error("[HistoryTab] Failed to load jobs:", error);
        setHasError(true);
      });
    } catch (error) {
      console.error("[HistoryTab] Error accessing settings:", error);
      setHasError(true);
    }
  }, [activeTab]);

  // Generate thumbnails for completed jobs using ExtendScript
  useEffect(() => {
    if (activeTab !== "history" || !jobs || jobs.length === 0) return;

    const generateThumbnails = async () => {
      // Only generate thumbnails for currently displayed jobs
      const completedJobs = jobs.filter(j => j.status === 'completed' && (j.outputPath || j.videoPath || j.outputUrl));
      const jobsToRender = completedJobs.slice(0, displayedCount);
      const newUrls: Record<string, string> = {};

      for (const job of jobsToRender) {
        if (thumbnailUrls[job.id]) continue;

        try {
          // Check for outputUrl (from Sync API) or outputPath (local file)
          const videoPath = job.outputPath || job.videoPath || job.outputUrl;
          if (!videoPath) continue;

          // Try ExtendScript first (only for local files)
          if (videoPath && !videoPath.startsWith('http') && !videoPath.startsWith('https')) {
            try {
              const nle = window.nle;
              if (nle && nle.getHostId) {
                const hostId = nle.getHostId();
                const fn = hostId === HOST_IDS.AEFT ? "AEFT_readThumbnail" : "PPRO_readThumbnail";
                
                const result = await window.evalExtendScript?.(fn, { path: videoPath });
                if (result?.ok && result?.dataUrl) {
                  newUrls[job.id] = result.dataUrl;
                  continue;
                }
              }
            } catch (e) {
              // Fall back to canvas method
            }
          }

          // Fallback: Generate thumbnail URL from video file using canvas
          const thumbnailUrl = await new Promise<string | null>((resolve) => {
            try {
              const video = document.createElement('video');
              video.preload = 'metadata';
              video.crossOrigin = 'anonymous';
              
              // Handle both local files and URLs
              if (videoPath.startsWith('http') || videoPath.startsWith('https')) {
                video.src = videoPath;
              } else {
                video.src = `file://${videoPath}`;
              }
              
              let resolved = false;
              const timeout = setTimeout(() => {
                if (!resolved) {
                  resolved = true;
                  resolve(null);
                }
              }, 5000);
              
              video.onloadedmetadata = () => {
                video.currentTime = 1; // Seek to 1 second
              };
              video.onseeked = () => {
                if (resolved) return;
                const canvas = document.createElement('canvas');
                canvas.width = video.videoWidth || 320;
                canvas.height = video.videoHeight || 180;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                  resolved = true;
                  clearTimeout(timeout);
                  resolve(canvas.toDataURL('image/jpeg', 0.8));
                } else {
                  resolved = true;
                  clearTimeout(timeout);
                  resolve(null);
                }
              };
              video.onerror = () => {
                if (!resolved) {
                  resolved = true;
                  clearTimeout(timeout);
                  resolve(null);
                }
              };
            } catch (e) {
              resolve(null);
            }
          });

          if (thumbnailUrl) {
            newUrls[job.id] = thumbnailUrl;
          }
        } catch (e) {
          console.error(`[HistoryTab] Failed to generate thumbnail for job ${job.id}:`, e);
        }
      }

      if (Object.keys(newUrls).length > 0) {
        setThumbnailUrls(prev => ({ ...prev, ...newUrls }));
      }
    };

    const timeout = setTimeout(generateThumbnails, 100);
    return () => clearTimeout(timeout);
  }, [jobs, displayedCount, activeTab, thumbnailUrls]);

  // Expose generateThumbnailsForJobs for backward compatibility
  useEffect(() => {
    window.generateThumbnailsForJobs = async (jobsToRender: any[]) => {
      const newUrls: Record<string, string> = {};
      
      for (const job of jobsToRender || []) {
        if (!job || job.status !== 'completed' || !(job.outputPath || job.videoPath || job.outputUrl)) continue;
        if (thumbnailUrls[job.id]) continue;

        try {
          // Check for outputUrl (from Sync API) or outputPath (local file)
          const videoPath = job.outputPath || job.videoPath || job.outputUrl;
          if (!videoPath) continue;

          // Try ExtendScript first (only for local files)
          if (videoPath && !videoPath.startsWith('http') && !videoPath.startsWith('https')) {
            try {
              const nle = window.nle;
              if (nle && nle.getHostId) {
                const hostId = nle.getHostId();
                const fn = hostId === HOST_IDS.AEFT ? "AEFT_readThumbnail" : "PPRO_readThumbnail";
                
                const result = await window.evalExtendScript?.(fn, { path: videoPath });
                if (result?.ok && result?.dataUrl) {
                  newUrls[job.id] = result.dataUrl;
                  continue;
                }
              }
            } catch (e) {
              // Fall back to canvas
            }
          }

          // Fallback: canvas method
          const thumbnailUrl = await new Promise<string | null>((resolve) => {
            try {
              const video = document.createElement('video');
              video.preload = 'metadata';
              video.crossOrigin = 'anonymous';
              
              // Handle both local files and URLs
              if (videoPath.startsWith('http') || videoPath.startsWith('https')) {
                video.src = videoPath;
              } else {
                video.src = `file://${videoPath}`;
              }
              
              let resolved = false;
              const timeout = setTimeout(() => {
                if (!resolved) {
                  resolved = true;
                  resolve(null);
                }
              }, 5000);
              
              video.onloadedmetadata = () => {
                video.currentTime = 1;
              };
              video.onseeked = () => {
                if (resolved) return;
                const canvas = document.createElement('canvas');
                canvas.width = video.videoWidth || 320;
                canvas.height = video.videoHeight || 180;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                  resolved = true;
                  clearTimeout(timeout);
                  resolve(canvas.toDataURL('image/jpeg', 0.8));
                } else {
                  resolved = true;
                  clearTimeout(timeout);
                  resolve(null);
                }
              };
              video.onerror = () => {
                if (!resolved) {
                  resolved = true;
                  clearTimeout(timeout);
                  resolve(null);
                }
              };
            } catch (e) {
              resolve(null);
            }
          });

          if (thumbnailUrl) {
            newUrls[job.id] = thumbnailUrl;
          }
        } catch (e) {
          console.error(`[HistoryTab] Failed to generate thumbnail for job ${job.id}:`, e);
        }
      }

      if (Object.keys(newUrls).length > 0) {
        setThumbnailUrls(prev => ({ ...prev, ...newUrls }));
      }
    };

    return () => {
      delete window.generateThumbnailsForJobs;
    };
  }, [thumbnailUrls]);

  // Re-initialize Lucide icons
  useEffect(() => {
    if (activeTab === "history" && window.lucide && window.lucide.createIcons) {
      const timer = setTimeout(() => {
        window.lucide.createIcons();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [activeTab, jobs, displayedCount]);

  // Infinite scroll using IntersectionObserver
  const isLoadingMoreRef = useRef(false);
  useEffect(() => {
    if (activeTab !== "history" || !hasMore || isLoading) return;

    const loader = document.getElementById('historyInfiniteLoader');
    if (!loader) return;

    const historyWrapper = document.querySelector('.history-wrapper');
    if (!historyWrapper) return;

    // Clean up existing observer
    if (window.historyScrollObserver) {
      window.historyScrollObserver.disconnect();
      window.historyScrollObserver = null;
    }

    // Create IntersectionObserver
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !isLoading && !isLoadingMoreRef.current && hasMore && loadMore) {
            // Prevent multiple simultaneous calls
            isLoadingMoreRef.current = true;
            // Temporarily disconnect observer to prevent multiple triggers
            observer.disconnect();
            // Load next page (10 more jobs)
            loadMore();
            // Reconnect observer after state update
            setTimeout(() => {
              isLoadingMoreRef.current = false;
              if (loader && loader.parentNode) {
                observer.observe(loader);
              }
            }, 500);
            break;
          }
        }
      },
      {
        root: historyWrapper,
        rootMargin: '200px', // Trigger 200px before visible
        threshold: 0, // Trigger as soon as any part enters
      }
    );

    observer.observe(loader);
    window.historyScrollObserver = observer;

    return () => {
      if (window.historyScrollObserver) {
        window.historyScrollObserver.disconnect();
        window.historyScrollObserver = null;
      }
    };
  }, [activeTab, hasMore, isLoading, loadMore]);

  // Action handlers
  const handleSaveJob = async (jobId: string) => {
    try {
      const job = jobs.find(j => String(j.id) === String(jobId));
      if (!job) {
        if (window.showToast) window.showToast('job not found', 'error');
        return;
      }

      const authHeaders = window.authHeaders || (() => ({}));
      const headers = await authHeaders();
      const response = await fetch(getApiUrl(`/jobs/${jobId}/save`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers
        },
        body: JSON.stringify({ location: 'documents' })
      });

      const data = await response.json().catch(() => null);
      if (response.ok && data?.ok) {
        if (window.showToast) window.showToast('saved to documents', 'success');
      } else {
        if (window.showToast) window.showToast(data?.error || 'failed to save', 'error');
      }
    } catch (e) {
      if (window.showToast) window.showToast('failed to save', 'error');
    }
  };

  const handleInsertJob = async (jobId: string) => {
    try {
      const job = jobs.find(j => String(j.id) === String(jobId));
      if (!job || !job.outputPath) {
        if (window.showToast) window.showToast('output not available', 'error');
        return;
      }

      if (!nle) {
        if (window.showToast) window.showToast('nle not available', 'error');
        return;
      }

      const result = await nle.insertFileAtPlayhead(job.outputPath);
      if (result?.ok) {
        if (window.showToast) window.showToast('inserted into timeline', 'success');
      } else {
        if (window.showToast) window.showToast(result?.error || 'failed to insert', 'error');
      }
    } catch (e) {
      if (window.showToast) window.showToast('failed to insert', 'error');
    }
  };

  const handleCopyOutputLink = (jobId: string) => {
    const job = jobs.find(j => String(j.id) === String(jobId));
    if (!job || !job.outputPath) {
      if (window.showToast) window.showToast('output path not available', 'error');
      return;
    }
    
    if (copyToClipboard(job.outputPath)) {
      if (window.showToast) window.showToast('output link copied to clipboard', 'success');
    } else {
      if (window.showToast) window.showToast('failed to copy output link', 'error');
    }
  };

  const handleCopyJobId = (jobId: string) => {
    if (!jobId) return;
    
    if (copyToClipboard(jobId)) {
      if (window.showToast) window.showToast('job id copied to clipboard', 'success');
    } else {
      if (window.showToast) window.showToast('failed to copy job id', 'error');
    }
  };

  const handleLoadJobIntoSources = (jobId: string) => {
    const job = jobs.find(j => String(j.id) === String(jobId));
    if (!job || !job.outputPath) return;

    setSelection({
      video: job.outputPath,
      videoUrl: null,
      audio: null,
      audioUrl: null,
      videoIsTemp: false,
      audioIsTemp: false,
      videoIsUrl: false,
      audioIsUrl: false,
    });
    setActiveTab('sources');
  };

  // Expose window functions for backward compatibility (AFTER handlers are defined)
  useEffect(() => {
    (window as any).__historyCopyJobId = handleCopyJobId;
    (window as any).__historyCopyOutputLink = handleCopyOutputLink;
    (window as any).__historySaveJob = handleSaveJob;
    (window as any).__historyInsertJob = handleInsertJob;
    (window as any).__historyLoadJobIntoSources = handleLoadJobIntoSources;
    (window as any).__historyRedoGeneration = async (jobId: string) => {
      const job = jobs.find(j => String(j.id) === String(jobId));
      if (!job) {
        if (window.showToast) window.showToast('job not found', 'error');
        return;
      }

      try {
        // Set the video and audio from the original job
        if (job.videoPath) {
          setSelection({
            video: job.videoPath,
            videoUrl: job.videoUrl || null,
            audio: null,
            audioUrl: null,
            videoIsTemp: job.isTempVideo || false,
            audioIsTemp: false,
            videoIsUrl: !!job.videoUrl,
            audioIsUrl: false,
          });
        }

        if (job.audioPath) {
          setSelection(prev => ({
            ...prev,
            audio: job.audioPath,
            audioUrl: job.audioUrl || null,
            audioIsTemp: job.isTempAudio || false,
            audioIsUrl: !!job.audioUrl,
          }));
        }

        // Switch to sources tab
        setActiveTab('sources');

        if (window.showToast) {
          window.showToast('generation parameters restored. ready to lipsync!', 'success');
        }
      } catch (e) {
        console.error('Failed to redo generation:', e);
        if (window.showToast) {
          window.showToast('failed to restore generation parameters', 'error');
        }
      }
    };

    return () => {
      delete (window as any).__historyCopyJobId;
      delete (window as any).__historyCopyOutputLink;
      delete (window as any).__historySaveJob;
      delete (window as any).__historyInsertJob;
      delete (window as any).__historyLoadJobIntoSources;
      delete (window as any).__historyRedoGeneration;
    };
  }, [handleCopyJobId, handleCopyOutputLink, handleSaveJob, handleInsertJob, handleLoadJobIntoSources, jobs, setSelection, setActiveTab]);

  // Ensure jobs is always an array
  const safeJobs = Array.isArray(jobs) ? jobs : [];
  const safeDisplayedCount = typeof displayedCount === 'number' ? displayedCount : 0;

  // Check if API key exists - update when tab becomes active or settings change
  const [hasApiKey, setHasApiKey] = useState(false);
  useEffect(() => {
    const checkApiKey = () => {
      try {
        const settings = JSON.parse(localStorage.getItem("syncSettings") || "{}");
        setHasApiKey(!!(settings.syncApiKey && settings.syncApiKey.trim()));
      } catch {
        setHasApiKey(false);
      }
    };
    
    checkApiKey();
    
    // Listen for storage changes (when API key is added)
    const handleStorageChange = () => {
      checkApiKey();
    };
    window.addEventListener('storage', handleStorageChange);
    
    // Also check periodically (localStorage changes don't trigger storage event in same window)
    const interval = setInterval(checkApiKey, 1000);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(interval);
    };
  }, [activeTab]);

  // Render history card
  const renderHistoryCard = (job: any, index: number) => {
    if (!job || typeof job !== 'object' || !job.id || !job.status) {
      return null;
    }

    const status = String(job.status || 'processing').toLowerCase();
    const isPending = status === 'pending';
    const isProcessing = status === 'processing';
    const isFailed = status === 'failed';
    const isRejected = status === 'rejected';
    const isCompleted = status === 'completed';
    const hasOutput = isCompleted && job.outputPath;

    const timestamp = formatHistoryTimestamp(job);
    const modelText = getModelText(job);
    const thumbnailUrl = thumbnailUrls[job.id];

    return (
      <div
        key={job.id || `job-${index}`}
        className="history-card"
        data-job-id={job.id}
        onClick={(e) => {
          if (hasOutput && !(e.target as HTMLElement).closest('button')) {
            // Only load into sources if we have a local file path
            if (job.outputPath) {
              handleLoadJobIntoSources(job.id);
            }
          }
        }}
      >
        <div className="history-card-inner">
          <div className="history-thumbnail-wrapper">
            {(isProcessing || isPending) ? (
              <div className="history-thumbnail-loader" dangerouslySetInnerHTML={{
                __html: loaderHTML({ size: 'sm', color: 'white' })
              }} />
            ) : hasOutput ? (
              thumbnailUrl ? (
                <img
                  src={thumbnailUrl}
                  alt="Thumbnail"
                  className="history-thumbnail"
                  style={{ opacity: 1 }}
                />
              ) : (
                <div className="history-thumbnail-loader" dangerouslySetInnerHTML={{
                  __html: loaderHTML({ size: 'sm', color: 'white' })
                }} />
              )
            ) : null}
            
            {isPending ? (
              <div className="history-status-badge history-status-pending">pending</div>
            ) : isProcessing ? (
              <div className="history-status-badge history-status-processing">processing</div>
            ) : isFailed ? (
              <div className="history-status-badge history-status-failed">failed</div>
            ) : isRejected ? (
              <div className="history-status-badge history-status-rejected">rejected</div>
            ) : isCompleted ? (
              <div className="history-status-badge history-status-completed">completed</div>
            ) : null}
          </div>
          
          <div className="history-card-content">
            <div className="history-card-header">
              <div className="history-timestamp">{timestamp}</div>
              <div className="history-settings">{modelText}</div>
            </div>
            
            <div className="history-card-actions">
              <div className="history-actions-left">
                {hasOutput ? (
                  <>
                    <button
                      className="history-btn history-btn-primary"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSaveJob(job.id);
                      }}
                    >
                      <i data-lucide="cloud-download"></i>
                      <span>save</span>
                    </button>
                    <button
                      className="history-btn history-btn-primary"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleInsertJob(job.id);
                      }}
                    >
                      <i data-lucide="copy-plus"></i>
                      <span>insert</span>
                    </button>
                  </>
                ) : (
                  <>
                    <button className="history-btn history-btn-disabled" disabled>
                      <i data-lucide="cloud-download"></i>
                      <span>save</span>
                    </button>
                    <button className="history-btn history-btn-disabled" disabled>
                      <i data-lucide="copy-plus"></i>
                      <span>insert</span>
                    </button>
                  </>
                )}
              </div>
              
              <div className="history-actions-right">
                {hasOutput ? (
                  <button
                    className="history-btn-icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCopyOutputLink(job.id);
                    }}
                    title="copy output link"
                  >
                    <i data-lucide="link"></i>
                  </button>
                ) : (
                  <button className="history-btn-icon history-btn-disabled" disabled title="copy output link">
                    <i data-lucide="link"></i>
                  </button>
                )}
                <button
                  className="history-btn-icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCopyJobId(job.syncJobId || job.id);
                  }}
                  title="copy job id"
                >
                  <span className="history-job-id">id</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div id="history" className={`tab-pane ${activeTab === "history" ? "active" : ""}`}>
      <div className="history-wrapper">
        <div id="historyList" className="history-list-container">
            {(serverState?.isOffline || (serverError && serverError.includes("Cannot connect"))) ? (
              <div className="history-empty-state">
                <div className="history-empty-icon">
                  <i data-lucide="wifi-off"></i>
                </div>
                <div className="history-empty-message">
                  hmm... you might be offline, or<br />
                  the local server is down. <a onClick={async () => {
                    const nle = window.nle;
                    console.log("[HistoryTab] Clicked fix this, nle:", nle);
                    if (!nle) {
                      console.error("[HistoryTab] nle is null - JSX script failed to load (CEP error code 27)");
                      alert("JSX script failed to load. Check CEP logs at ~/Library/Logs/CSXS/CEP12-PPRO.log for error code 27. The extension may need to be rebuilt.");
                      return;
                    }
                    if (!nle.startBackend) {
                      console.error("[HistoryTab] startBackend function missing");
                      alert("startBackend function is missing. JSX script may not have loaded correctly.");
                      return;
                    }
                    try {
                      const result = await nle.startBackend();
                      console.log("[HistoryTab] startBackend result:", result);
                      if (result && result.ok) {
                        setTimeout(() => {
                          window.location.reload();
                        }, 2000);
                      } else {
                        alert("Server startup failed: " + (result?.error || "Unknown error"));
                      }
                    } catch (error) {
                      console.error("[HistoryTab] Error calling startBackend:", error);
                      alert("Error starting server: " + String(error));
                    }
                  }}>fix this</a>
                </div>
              </div>
          ) : hasError || serverError ? (
            <div className="history-empty-state">
              <div className="history-empty-icon">
                <i data-lucide="alert-circle"></i>
              </div>
              <div className="history-empty-message">
                {serverError || "failed to load history. please try again."}
                <br />
                <small style={{ marginTop: "8px", display: "block", opacity: 0.7 }}>
                  Check the browser console (F12) for more details. The server may not be running.
                </small>
              </div>
            </div>
          ) : !hasApiKey ? (
            <div className="history-empty-state">
              <div className="history-empty-icon icon-key">
                <i data-lucide="key-round"></i>
              </div>
              <div className="history-empty-message">
                please add your api key in <a onClick={() => setActiveTab && setActiveTab("settings")}>settings</a>.
              </div>
            </div>
          ) : isLoading && safeJobs.length === 0 ? (
            <div className="history-loading-state" dangerouslySetInnerHTML={{
              __html: loaderHTML({ size: 'lg', color: 'white' }) + '<div class="history-loading-text">loading your generations...</div>'
            }} />
          ) : safeJobs.length === 0 ? (
            <div className="history-empty-state">
              <div className="history-empty-icon">
                <i data-lucide="clapperboard"></i>
              </div>
              <div className="history-empty-message">
                no generations yet. <a onClick={() => setActiveTab && setActiveTab("sources")}>get started</a>
              </div>
            </div>
          ) : (
            <>
              {safeJobs.slice(0, safeDisplayedCount).map((job, index) => renderHistoryCard(job, index))}
              {hasMore && (
                <div id="historyInfiniteLoader" className="history-infinite-loader" dangerouslySetInnerHTML={{
                  __html: loaderHTML({ size: 'md', color: 'muted' })
                }} />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    if (error.message && error.message.includes('removeChild')) {
      return { hasError: false, error: null };
    }
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    if (error.message && error.message.includes('removeChild')) {
      return;
    }
    
    try {
      const fs = require("fs");
      const path = require("path");
      const os = require("os");
      const home = os.homedir();
      const logsDir = path.join(home, "Library", "Application Support", "sync. extensions", "logs");
      
      const isAE = window.HOST_CONFIG && window.HOST_CONFIG.isAE;
      const isPPRO = window.HOST_CONFIG && window.HOST_CONFIG.hostId === HOST_IDS.PPRO;
      const logFileName = isAE ? "sync_ae_debug.log" : (isPPRO ? "sync_ppro_debug.log" : "sync_server_debug.log");
      const logFile = path.join(logsDir, logFileName);
      
      const logMessage = `[${new Date().toISOString()}] [HistoryTab] Error boundary caught error:\n` +
        `  Error: ${error.message}\n` +
        `  Stack: ${error.stack || "no stack"}\n` +
        `  Component Stack: ${errorInfo.componentStack || "no component stack"}\n\n`;
      
      fs.appendFileSync(logFile, logMessage);
    } catch (_) {}
    
    try {
      const hostConfig = window.HOST_CONFIG || {};
      fetch(getApiUrl("/debug"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "history_tab_error",
          error: error.message,
          stack: error.stack,
          errorInfo: errorInfo.componentStack,
          timestamp: new Date().toISOString(),
          hostConfig,
        }),
      }).catch(() => {});
    } catch (_) {}
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    if (this.state.hasError) {
      setTimeout(() => {
        try {
          const historyPane = document.getElementById("history");
          if (!historyPane || !historyPane.classList.contains("active")) {
            this.setState({ hasError: false, error: null });
          }
        } catch (_) {}
      }, 0);
    }
  }

  render() {
    if (this.state.hasError) {
      return null;
    }

    return this.props.children;
  }
}

const HistoryTab: React.FC = () => {
  return (
    <ErrorBoundary>
      <HistoryTabContent />
    </ErrorBoundary>
  );
};

export default HistoryTab;
