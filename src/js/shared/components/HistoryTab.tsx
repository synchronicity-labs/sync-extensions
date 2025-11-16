import React, { useEffect, useRef, useState, Component, ErrorInfo, ReactNode, useMemo, useCallback } from "react";
import { DownloadCloud, ArrowRightToLine, Link, WifiOff, AlertCircle, KeyRound, Clapperboard, Video } from "lucide-react";
import { useHistory } from "../hooks/useHistory";
import { useTabs } from "../hooks/useTabs";
import { useCore } from "../hooks/useCore";
import { useNLE } from "../hooks/useNLE";
import { useMedia } from "../hooks/useMedia";
import { useSettings } from "../hooks/useSettings";
import { getApiUrl } from "../utils/serverConfig";
import { loaderHTML } from "../utils/loader";
import { HOST_IDS } from "../../../shared/host";
import { generateThumbnailsForJobs } from "../utils/thumbnails";
import { debugLog, debugError, debugWarn } from "../utils/debugLog";

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
    
    // Add duration if completed (Sync API returns "COMPLETED" uppercase)
    if ((job.status === 'COMPLETED' || job.status === 'completed') && job.completedAt) {
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
    debugError('Copy method 1 failed', e);
  }
  
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text);
      return true;
    }
  } catch(e) {
    debugError('Copy method 2 failed', e);
  }
  
  return false;
}

const HistoryTabContent: React.FC = () => {
  const [hasError, setHasError] = useState(false);
  const [thumbnailUrls, setThumbnailUrls] = useState<Record<string, string>>({});
  const { jobs, isLoading, hasMore, loadMore, loadJobsFromServer, displayedCount, serverError } = useHistory();
  const displayedCountRef = useRef(displayedCount);
  const loadedThumbnailsRef = useRef<Set<string>>(new Set()); // Track loaded thumbnails to avoid duplicates
  
  // Keep ref updated
  useEffect(() => {
    displayedCountRef.current = displayedCount;
  }, [displayedCount]);
  const { serverState, authHeaders, ensureAuthToken } = useCore();
  const { setActiveTab, activeTab } = useTabs();
  const { nle } = useNLE();
  const { setSelection } = useMedia();
  const { settings } = useSettings();
  const hasLoadedRef = useRef(false);
  const loadJobsRef = useRef(loadJobsFromServer);
  const handleLoadJobIntoSourcesRef = useRef<((jobId: string) => void) | null>(null);

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
        debugError("[HistoryTab] Failed to load jobs", error);
        setHasError(true);
      });
    } catch (error) {
      debugError("[HistoryTab] Error accessing settings", error);
      setHasError(true);
    }
  }, [activeTab]);

  // Monitor job status silently while on history tab
  // This effect runs whenever activeTab changes to "history" and there's a monitoring job ID
  useEffect(() => {
    const monitoringJobId = (window as any).__monitoringJobId;
    if (!monitoringJobId) {
      return;
    }

    // Only monitor when on history tab (user requirement: "if the user stays on history tab")
    if (activeTab !== "history") {
      debugLog("[HistoryTab] Not on history tab, pausing monitoring", { jobId: monitoringJobId });
      return;
    }

    debugLog("[HistoryTab] Starting to monitor job", { jobId: monitoringJobId });

    let pollInterval: NodeJS.Timeout | null = null;
    let isMonitoring = true;

    const checkJobStatus = async () => {
      // Double-check we're still monitoring and on history tab
      if (!isMonitoring || activeTab !== "history") {
        return;
      }

      // Re-check monitoring job ID in case it was cleared
      const currentMonitoringJobId = (window as any).__monitoringJobId;
      if (!currentMonitoringJobId || currentMonitoringJobId !== monitoringJobId) {
        debugLog("[HistoryTab] Monitoring job ID changed or cleared, stopping", { 
          originalId: monitoringJobId,
          currentId: currentMonitoringJobId
        });
        isMonitoring = false;
        if (pollInterval) {
          clearInterval(pollInterval);
          pollInterval = null;
        }
        return;
      }

      try {
        await ensureAuthToken();
        const headers = authHeaders();
        const settings = JSON.parse(localStorage.getItem("syncSettings") || "{}");
        const apiKey = settings.syncApiKey || "";

        if (!apiKey) {
          debugLog("[HistoryTab] No API key, stopping monitoring");
          isMonitoring = false;
          return;
        }

        // Fetch from Sync API directly
        const url = new URL(`${getApiUrl("/jobs")}`);
        url.searchParams.set("syncApiKey", apiKey);
        
        const response = await fetch(url.toString(), {
          method: "GET",
          headers,
        });

        if (response.ok) {
          const data = await response.json().catch(() => null);
          const jobsArray = Array.isArray(data) ? data : [];
          
          const job = jobsArray.find((j: any) => String(j.id) === String(monitoringJobId));
          
          if (job) {
            const status = String(job.status || "").toLowerCase();
            const isCompleted = status === "completed" || status === "COMPLETED";
            const isFailed = status === "failed" || status === "rejected";
            
            debugLog("[HistoryTab] Job status check", { 
              jobId: monitoringJobId, 
              status: job.status,
              isCompleted,
              isFailed
            });

            if (isCompleted || isFailed) {
              // Stop monitoring first to prevent multiple triggers
              isMonitoring = false;
              if (pollInterval) {
                clearInterval(pollInterval);
                pollInterval = null;
              }
              
              // Clear monitoring job ID
              delete (window as any).__monitoringJobId;

              // Job is done - reload jobs list to get latest status
              debugLog("[HistoryTab] Job completed, reloading jobs list", { jobId: monitoringJobId });
              
              // Reload jobs and wait for it to complete
              try {
                await loadJobsRef.current();
                
                // If completed (not failed), auto-switch to sources tab and load the job
                if (isCompleted && !isFailed) {
                  debugLog("[HistoryTab] Job completed successfully, switching to sources tab", { jobId: monitoringJobId });
                  
                  // Use the job data we already have from the API response
                  // This ensures we have the latest job data even if React state hasn't updated
                  const completedJob = job;
                  
                  // Wait a bit for React state to update, then load the job
                  setTimeout(() => {
                    // Use the job data we fetched directly (more reliable than waiting for React state)
                    if (completedJob && (completedJob.outputPath || completedJob.outputUrl)) {
                      // Set flag to prevent clearing sources tab
                      (window as any).__loadingJobIntoSources = true;
                      
                      // Switch to sources tab
                      setActiveTab("sources");
                      
                      // Render output video immediately with the job data we have
                      setTimeout(() => {
                        if ((window as any).renderOutputVideo) {
                          (window as any).renderOutputVideo(completedJob);
                        }
                        if ((window as any).showPostLipsyncActions) {
                          (window as any).showPostLipsyncActions(completedJob);
                        }
                        
                        // Disable button and hide audio section
                        const lipsyncBtn = document.getElementById('lipsyncBtn');
                        if (lipsyncBtn) {
                          (lipsyncBtn as HTMLButtonElement).disabled = true;
                          lipsyncBtn.style.display = 'flex';
                        }
                        const audioSection = document.getElementById('audioSection');
                        if (audioSection) audioSection.style.display = 'none';
                        
                        // Clear flag after rendering
                        setTimeout(() => {
                          delete (window as any).__loadingJobIntoSources;
                        }, 1000);
                        
                        if ((window as any).showToast) {
                          (window as any).showToast('generation loaded', 'success');
                        }
                      }, 100);
                    } else {
                      // Fallback: use the handler which will look up the job from jobs array
                    if (handleLoadJobIntoSourcesRef.current) {
                      handleLoadJobIntoSourcesRef.current(monitoringJobId);
                    } else {
                      setActiveTab("sources");
                      }
                    }
                  }, 300);
                }
              } catch (error: any) {
                debugError("[HistoryTab] Error reloading jobs after completion", error);
                // Still try to load the job using the job data we have
                if (isCompleted && !isFailed) {
                  setTimeout(() => {
                    (window as any).__loadingJobIntoSources = true;
                    setActiveTab("sources");
                    
                    setTimeout(() => {
                      if ((window as any).renderOutputVideo && job.outputPath) {
                        (window as any).renderOutputVideo(job);
                      }
                      if ((window as any).showPostLipsyncActions) {
                        (window as any).showPostLipsyncActions(job);
                      }
                      
                      const lipsyncBtn = document.getElementById('lipsyncBtn');
                      if (lipsyncBtn) {
                        (lipsyncBtn as HTMLButtonElement).disabled = true;
                        lipsyncBtn.style.display = 'flex';
                      }
                      const audioSection = document.getElementById('audioSection');
                      if (audioSection) audioSection.style.display = 'none';
                      
                      setTimeout(() => {
                        delete (window as any).__loadingJobIntoSources;
                      }, 1000);
                      
                      if ((window as any).showToast) {
                        (window as any).showToast('generation loaded', 'success');
                      }
                    }, 100);
                  }, 300);
                }
              }
            }
          } else {
            debugLog("[HistoryTab] Job not found in list yet, will continue monitoring", { jobId: monitoringJobId });
          }
        }
      } catch (error: any) {
        debugError("[HistoryTab] Error checking job status", error);
        // Continue monitoring on error (unless we're no longer on history tab)
        if (activeTab !== "history") {
          isMonitoring = false;
          if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
          }
        }
      }
    };

    // Check immediately
    checkJobStatus();

    // Then poll every 5 seconds (silently monitoring)
    pollInterval = setInterval(() => {
      checkJobStatus();
    }, 5000);

    return () => {
      isMonitoring = false;
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
    };
  }, [activeTab, setActiveTab, authHeaders, ensureAuthToken]);

  // Pre-load thumbnails as soon as jobs are available (even before loading completes)
  const preloadThumbnailsRef = useRef<string>('');
  
  useEffect(() => {
    if (activeTab !== "history") {
      preloadThumbnailsRef.current = '';
      return;
    }
    
    const safeJobsArray = Array.isArray(jobs) ? jobs : [];

    // Pre-generate thumbnails for first batch as soon as jobs are available
    // Don't wait for loading to complete - start immediately
    if (safeJobsArray.length > 0) {
      const pageSize = 10;
      const firstBatch = safeJobsArray.slice(0, pageSize);
      const batchKey = firstBatch.map(j => j?.id || '').join(',');
      
      // Only preload if this batch hasn't been preloaded yet
      if (batchKey && batchKey !== preloadThumbnailsRef.current) {
        preloadThumbnailsRef.current = batchKey;
        
        debugLog('[HistoryTab] Pre-loading thumbnails immediately', { 
          count: firstBatch.length,
          isLoading 
        });
        
        // Load cached thumbnails first (fast path)
        const completedJobs = firstBatch.filter(job => 
          job?.id && (job.status === 'COMPLETED' || job.status === 'completed')
        );
        
        // Load all cached thumbnails in parallel immediately
        Promise.all(completedJobs.map(async (job) => {
          try {
            const cached = await (window as any).loadThumbnail?.(job.id);
            if (cached) {
              loadedThumbnailsRef.current.add(job.id);
              return { jobId: job.id, thumbnail: cached };
            }
          } catch (e) {
            // Ignore errors
          }
          return null;
        })).then(loadResults => {
          const cachedUrls: Record<string, string> = {};
          loadResults.forEach(result => {
            if (result && result.thumbnail) {
              cachedUrls[result.jobId] = result.thumbnail;
            }
          });
          
          if (Object.keys(cachedUrls).length > 0) {
            setThumbnailUrls(prev => ({ ...prev, ...cachedUrls }));
            // Update DOM immediately for instant display
            Object.entries(cachedUrls).forEach(([jobId, url]) => {
              (window as any).updateCardThumbnail?.(jobId, url);
            });
          }
        });
        
        // Start generating missing thumbnails in background immediately
        // Don't await to avoid blocking UI
        generateThumbnailsForJobs(completedJobs).catch(error => {
          debugError('[HistoryTab] Error pre-generating thumbnails', error);
        });
      }
    }
  }, [activeTab, jobs]);

  // Trigger first page load when jobs are loaded and displayedCount is 0
  // Matching main branch: initially show first 10 items, then set displayedCount to 10
  // This ensures we start with 10 items visible
  useEffect(() => {
    if (activeTab === "history" && jobs.length > 0 && displayedCount === 0 && !isLoading) {
      // Set displayedCount to 10 to show first page (matching main branch behavior)
      const timer = setTimeout(() => {
        loadMore();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [activeTab, jobs.length, displayedCount, isLoading, loadMore]);

  // Generate thumbnails for currently rendered jobs with lazy loading
  // Use IntersectionObserver to only load thumbnails for visible cards
  const prevRenderedJobsRef = useRef<string>('');
  const prevJobsLengthRef = useRef<number>(0);
  const thumbnailObserverRef = useRef<IntersectionObserver | null>(null);
  
  useEffect(() => {
    // Only process if history tab is active and we have jobs
    if (activeTab !== "history" || !jobs || jobs.length === 0) {
      // Clean up observer when tab is inactive
      if (thumbnailObserverRef.current) {
        thumbnailObserverRef.current.disconnect();
        thumbnailObserverRef.current = null;
      }
      return;
    }
    
    // Reset only if jobs list changed significantly (new load)
    if (jobs.length !== prevJobsLengthRef.current && prevJobsLengthRef.current > 0) {
      prevRenderedJobsRef.current = '';
      loadedThumbnailsRef.current.clear();
    }
    prevJobsLengthRef.current = jobs.length;

    const pageSize = 10;
    const currentDisplayedCount = typeof displayedCount === 'number' ? displayedCount : 0;
    
    // Calculate which jobs are currently rendered
    const endIndex = currentDisplayedCount === 0 
      ? Math.min(pageSize, jobs.length)
      : Math.min(currentDisplayedCount, jobs.length);
    
    // Get the jobs that are actually rendered
    const renderedJobs = jobs.slice(0, endIndex);
    
    // Create a key from job IDs to detect if the rendered set changed
    const renderedJobsKey = renderedJobs.map(j => j?.id || '').join(',');
    
    // Only generate thumbnails if the rendered jobs changed
    if (renderedJobsKey === prevRenderedJobsRef.current) {
      return;
    }
    
    prevRenderedJobsRef.current = renderedJobsKey;
    
    // Clean up existing observer
    if (thumbnailObserverRef.current) {
      thumbnailObserverRef.current.disconnect();
      thumbnailObserverRef.current = null;
    }
    
    // Load cached thumbnails immediately for all rendered jobs (fast)
    const loadCachedThumbnails = async () => {
      const completedJobs = renderedJobs.filter(job => job?.id && job.status === 'COMPLETED');
      
      const loadPromises = completedJobs.map(async (job) => {
        // Skip if already loaded
        if (loadedThumbnailsRef.current.has(job.id)) {
          return null;
        }
        
        try {
          const cached = await (window as any).loadThumbnail?.(job.id);
          if (cached) {
            loadedThumbnailsRef.current.add(job.id);
            return { jobId: job.id, thumbnail: cached };
          }
        } catch (e) {
          // Ignore errors
        }
        return null;
      });
      
      const loadResults = await Promise.all(loadPromises);
      const cachedUrls: Record<string, string> = {};
      loadResults.forEach(result => {
        if (result && result.thumbnail) {
          cachedUrls[result.jobId] = result.thumbnail;
        }
      });
      
      if (Object.keys(cachedUrls).length > 0) {
        setThumbnailUrls(prev => ({ ...prev, ...cachedUrls }));
        Object.entries(cachedUrls).forEach(([jobId, url]) => {
          (window as any).updateCardThumbnail?.(jobId, url);
        });
      }
    };
    
    // Load cached thumbnails immediately
    loadCachedThumbnails();
    
    // Set up IntersectionObserver for lazy loading thumbnails
    // Only generate thumbnails for cards that are visible or about to be visible
    setTimeout(() => {
      const cards = document.querySelectorAll('.history-card[data-job-id]');
      
      if (cards.length === 0) return;
      
      thumbnailObserverRef.current = new IntersectionObserver(
        (entries) => {
          const jobsToGenerate: any[] = [];
          
          entries.forEach(entry => {
            if (entry.isIntersecting) {
              const card = entry.target as HTMLElement;
              const jobId = card.getAttribute('data-job-id');
              if (jobId && !loadedThumbnailsRef.current.has(jobId)) {
                const job = renderedJobs.find(j => String(j.id) === String(jobId));
                if (job && job.status === 'COMPLETED' && (job.outputPath || job.outputUrl)) {
                  jobsToGenerate.push(job);
                  loadedThumbnailsRef.current.add(jobId);
                }
              }
            }
          });
          
          // Generate thumbnails for visible cards
          if (jobsToGenerate.length > 0) {
            generateThumbnailsForJobs(jobsToGenerate).catch(error => {
              debugError('[HistoryTab] Error generating thumbnails for visible cards', error);
            });
          }
        },
        {
          root: document.querySelector('.history-wrapper'),
          rootMargin: '200px', // Start loading 200px before card becomes visible
          threshold: 0.1
        }
      );
      
      // Observe all rendered cards
      cards.forEach(card => {
        thumbnailObserverRef.current?.observe(card);
      });
      
      // Also generate thumbnails for first 3 cards immediately (above the fold)
      const immediateJobs = renderedJobs.slice(0, 3).filter(j => 
        j?.id && j.status === 'COMPLETED' && !loadedThumbnailsRef.current.has(j.id)
      );
      if (immediateJobs.length > 0) {
        generateThumbnailsForJobs(immediateJobs).catch(error => {
          debugError('[HistoryTab] Error generating immediate thumbnails', error);
        });
      }
    }, 50); // Small delay to ensure DOM is ready
    
    return () => {
      if (thumbnailObserverRef.current) {
        thumbnailObserverRef.current.disconnect();
        thumbnailObserverRef.current = null;
      }
    };
  }, [jobs, displayedCount, activeTab]);

  // Use ref to access current thumbnailUrls in generateThumbnailsForJobs
  const thumbnailUrlsRef = useRef(thumbnailUrls);
  useEffect(() => {
    thumbnailUrlsRef.current = thumbnailUrls;
  }, [thumbnailUrls]);

  // Listen for thumbnail updates from the thumbnails utility
  useEffect(() => {
    const handleThumbnailUpdate = (e: CustomEvent) => {
      const { jobId, thumbnailUrl } = e.detail;
      if (jobId && thumbnailUrl) {
        setThumbnailUrls(prev => ({ ...prev, [jobId]: thumbnailUrl }));
      }
    };
    
    window.addEventListener('thumbnailUpdated', handleThumbnailUpdate as EventListener);
    return () => {
      window.removeEventListener('thumbnailUpdated', handleThumbnailUpdate as EventListener);
    };
  }, []);

  // Expose generateThumbnailsForJobs globally for backward compatibility
  // The thumbnails utility already sets this, but we ensure it's available
  useEffect(() => {
    // The generateThumbnailsForJobs function from thumbnails.ts is already exposed globally
    // We just need to ensure it's available and update React state when thumbnails are set
    const originalGenerateThumbnails = window.generateThumbnailsForJobs;
    if (originalGenerateThumbnails) {
    window.generateThumbnailsForJobs = async (jobsToRender: any[]) => {
      debugLog('[generateThumbnailsForJobs] Called', { count: jobsToRender?.length || 0 });
      
        // Call the original function from thumbnails.ts
        await originalGenerateThumbnails(jobsToRender || []);
      
      // Update React state with thumbnails that were set
      // The thumbnails utility updates DOM directly, but we also need to update React state
      const newUrls: Record<string, string> = {};
      for (const job of jobsToRender || []) {
        if (!job || !job.id) continue;
          const img = document.querySelector(`.history-thumbnail[data-job-id="${job.id}"]`) as HTMLImageElement;
        if (img && img.src && img.src !== '') {
          newUrls[job.id] = img.src;
        }
      }
      
      if (Object.keys(newUrls).length > 0) {
        setThumbnailUrls(prev => ({ ...prev, ...newUrls }));
      }
      
      return Promise.resolve();
    };
    }

    return () => {
      // Restore original if it exists
      if (originalGenerateThumbnails) {
        window.generateThumbnailsForJobs = originalGenerateThumbnails;
      }
    };
  }, []); // Empty deps - function uses imported utility


  // Infinite scroll using IntersectionObserver - matching main branch
  const isLoadingMoreRef = useRef(false);
  useEffect(() => {
    // Calculate actual hasMore based on rendered count
    // displayedCount represents the total number of items to show
    const safeJobsArray = Array.isArray(jobs) ? jobs : [];
    const pageSize = 10;
    const currentDisplayedCount = typeof displayedCount === 'number' ? displayedCount : 0;
    // Calculate how many items are currently shown
    const currentShown = currentDisplayedCount === 0 ? Math.min(pageSize, safeJobsArray.length) : Math.min(currentDisplayedCount, safeJobsArray.length);
    const actualHasMore = currentShown < safeJobsArray.length;

    if (activeTab !== "history" || !actualHasMore || isLoading) {
      // Clean up observer when not needed
      if (window.historyScrollObserver) {
        window.historyScrollObserver.disconnect();
        window.historyScrollObserver = null;
      }
      return;
    }

    const loader = document.getElementById('historyInfiniteLoader');
    if (!loader) return;

    const historyWrapper = document.querySelector('.history-wrapper');
    if (!historyWrapper) return;

    // Clean up existing observer
    if (window.historyScrollObserver) {
      window.historyScrollObserver.disconnect();
      window.historyScrollObserver = null;
    }

    // Create IntersectionObserver - matching main branch settings
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !isLoading && !isLoadingMoreRef.current && actualHasMore && loadMore) {
            // Prevent multiple simultaneous calls
            isLoadingMoreRef.current = true;
            // Temporarily disconnect observer to prevent multiple triggers
            observer.disconnect();
            // Load next page (10 more jobs)
            loadMore();
            // Reconnect observer after state update - recalculate hasMore using ref
            setTimeout(() => {
              isLoadingMoreRef.current = false;
              // Recalculate hasMore after state update using ref for current displayedCount
              const newSafeJobsArray = Array.isArray(jobs) ? jobs : [];
              const newDisplayedCount = displayedCountRef.current;
              const newCurrentShown = newDisplayedCount === 0 ? Math.min(pageSize, newSafeJobsArray.length) : Math.min(newDisplayedCount, newSafeJobsArray.length);
              const newActualHasMore = newCurrentShown < newSafeJobsArray.length;
              
              const newLoader = document.getElementById('historyInfiniteLoader');
              if (newLoader && newLoader.parentNode && newActualHasMore) {
                observer.observe(newLoader);
              }
            }, 500);
            break;
          }
        }
      },
      {
        root: historyWrapper,
        rootMargin: '0px', // Only trigger when loader is actually visible
        threshold: 0.1, // Trigger when at least 10% of loader is visible
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
  }, [activeTab, jobs, displayedCount, isLoading, loadMore]);

  // Action handlers - matching main branch implementation
  const handleSaveJob = async (jobId: string) => {
    try {
      const job = jobs.find(j => String(j.id) === String(jobId)) || { id: jobId, status: 'completed' };
      const saveLocation = settings.saveLocation || 'project';
      let location = saveLocation === 'documents' || saveLocation === 'universal' ? 'documents' : 'project';
      let targetDir = '';
      
      if (location === 'project') {
        try {
          const nleToUse = (window as any).nle || nle;
          if (nleToUse && typeof nleToUse.getProjectDir === 'function') {
            const r = await nleToUse.getProjectDir();
            if (r && r.ok) {
              targetDir = r.outputDir || r.projectDir;
            } else if (r && r.error) {
              debugError('[handleSaveJob] getProjectDir error:', r.error);
            }
          }
        } catch(err) {
          debugError('[handleSaveJob] Error getting project directory', err);
        }
        
        if (!targetDir) {
          if (window.showToast) window.showToast('could not resolve project folder; open/switch to a saved project and try again', 'error');
          return;
        }
      }
      
      const apiKey = settings.syncApiKey || '';
      let savedPath = '';
      
      // Show toast and mark button as working
      if (window.showToast) window.showToast('saving…', 'info');
      const saveBtn = document.getElementById(`save-${jobId}`);
      const originalText = saveBtn?.querySelector('span')?.textContent || 'save';
      if (saveBtn) {
        const span = saveBtn.querySelector('span');
        if (span) span.textContent = 'saving…';
        (saveBtn as HTMLButtonElement).disabled = true;
      }
      
      try {
      const headers = await authHeaders();
      const response = await fetch(getApiUrl(`/jobs/${jobId}/save`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers
        },
          body: JSON.stringify({ location, targetDir, syncApiKey: apiKey })
      });

      const data = await response.json().catch(() => null);
        if (response.ok && data && data.outputPath) {
          savedPath = data.outputPath;
        } else if (!response.ok) {
          if (saveBtn) {
            const span = saveBtn.querySelector('span');
            if (span) span.textContent = originalText;
            (saveBtn as HTMLButtonElement).disabled = false;
          }
          if (window.showToast) window.showToast('failed to save', 'error');
          return;
        }
      } catch(_) {
        if (saveBtn) {
          const span = saveBtn.querySelector('span');
          if (span) span.textContent = originalText;
          (saveBtn as HTMLButtonElement).disabled = false;
        }
        if (window.showToast) window.showToast('failed to save', 'error');
        return;
      }
      
      if (!savedPath) {
        try {
          const headers = await authHeaders();
          const res = await fetch(getApiUrl(`/jobs/${jobId}`), { headers });
          const j = await res.json().catch(() => null);
          if (j && j.outputPath) savedPath = j.outputPath;
        } catch(_) {}
      }
      
      // Reset button
      if (saveBtn) {
        const span = saveBtn.querySelector('span');
        if (span) span.textContent = originalText;
        (saveBtn as HTMLButtonElement).disabled = false;
      }
      
      if (savedPath) {
        try {
          const nleToUse = (window as any).nle || nle;
          if (nleToUse && typeof nleToUse.importFileToBin === 'function') {
            const result = await nleToUse.importFileToBin(savedPath, 'sync. outputs');
            if (result && result.ok) {
              if (window.showToast) window.showToast('saved to project', 'success');
            } else {
              if (window.showToast) window.showToast('saved to ' + location, 'success');
            }
          } else {
            if (window.showToast) window.showToast('saved to ' + location, 'success');
          }
        } catch(_) {
          if (window.showToast) window.showToast('saved to ' + location, 'success');
        }
      } else {
        if (window.showToast) window.showToast('not ready', 'error');
      }
    } catch (e) {
      if (window.showToast) window.showToast('failed to save', 'error');
    }
  };

  const handleInsertJob = async (jobId: string) => {
    // Guard against concurrent inserts
    if ((window as any).__insertingGuard) return;
    (window as any).__insertingGuard = true;
    
    try {
      const job = jobs.find(j => String(j.id) === String(jobId)) || { id: jobId, status: 'completed' };
      const saveLocation = settings.saveLocation || 'project';
      let location = saveLocation === 'documents' || saveLocation === 'universal' ? 'documents' : 'project';
      let targetDir = '';
      
      if (location === 'project') {
        try {
          const nleToUse = (window as any).nle || nle;
          if (nleToUse && typeof nleToUse.getProjectDir === 'function') {
            const r = await nleToUse.getProjectDir();
            if (r && r.ok) {
              targetDir = r.outputDir || r.projectDir;
            } else if (r && r.error) {
              debugError('[handleInsertJob] getProjectDir error:', r.error);
            }
          }
        } catch(err) {
          debugError('[handleInsertJob] Error getting project directory', err);
        }
        
        if (!targetDir) {
          if (window.showToast) window.showToast('could not resolve project folder; open/switch to a saved project and try again', 'error');
          const mainInsertBtn = document.getElementById('insertBtn');
          const mainInsertWasDisabled = mainInsertBtn ? (mainInsertBtn as HTMLButtonElement).disabled : false;
          if (mainInsertBtn) {
            const span = mainInsertBtn.querySelector('span');
            if (span) span.textContent = 'insert';
            (mainInsertBtn as HTMLButtonElement).disabled = mainInsertWasDisabled;
          }
          (window as any).__insertingGuard = false;
          return;
        }
      }
      
      const apiKey = settings.syncApiKey || '';
      let savedPath = '';
      
      // Show toast and mark button as working
      if (window.showToast) window.showToast('inserting…', 'info');
      const insertBtn = document.getElementById(`insert-${jobId}`);
      const mainInsertBtn = document.getElementById('insertBtn');
      const originalText = insertBtn?.querySelector('span')?.textContent || 'insert';
      const mainInsertWasDisabled = mainInsertBtn ? (mainInsertBtn as HTMLButtonElement).disabled : false;
      
      if (insertBtn) {
        const span = insertBtn.querySelector('span');
        if (span) span.textContent = 'inserting…';
        (insertBtn as HTMLButtonElement).disabled = true;
      }
      if (mainInsertBtn) {
        (mainInsertBtn as HTMLButtonElement).disabled = true;
        const span = mainInsertBtn.querySelector('span');
        if (span) span.textContent = 'inserting…';
      }
      
      try {
        const headers = await authHeaders();
        const response = await fetch(getApiUrl(`/jobs/${jobId}/save`), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...headers
          },
          body: JSON.stringify({ location, targetDir, syncApiKey: apiKey })
        });
        
        const data = await response.json().catch(() => null);
        if (response.ok && data && data.outputPath) {
          savedPath = data.outputPath;
        } else if (!response.ok) {
          if (insertBtn) {
            const span = insertBtn.querySelector('span');
            if (span) span.textContent = originalText;
            (insertBtn as HTMLButtonElement).disabled = false;
          }
          if (mainInsertBtn) {
            (mainInsertBtn as HTMLButtonElement).disabled = mainInsertWasDisabled;
            const span = mainInsertBtn.querySelector('span');
            if (span) span.textContent = 'insert';
          }
          if (window.showToast) window.showToast('failed to insert', 'error');
          (window as any).__insertingGuard = false;
          return;
        }
      } catch(_) {
        if (insertBtn) {
          const span = insertBtn.querySelector('span');
          if (span) span.textContent = originalText;
          (insertBtn as HTMLButtonElement).disabled = false;
        }
        if (mainInsertBtn) {
          (mainInsertBtn as HTMLButtonElement).disabled = mainInsertWasDisabled;
          const span = mainInsertBtn.querySelector('span');
          if (span) span.textContent = 'insert';
        }
        if (window.showToast) window.showToast('failed to insert', 'error');
        (window as any).__insertingGuard = false;
        return;
      }

      if (!savedPath) {
        try {
          const headers = await authHeaders();
          const res = await fetch(getApiUrl(`/jobs/${jobId}`), { headers });
          const j = await res.json().catch(() => null);
          if (j && j.outputPath) savedPath = j.outputPath;
        } catch(_) {}
      }
      
      // Reset button text
      if (insertBtn) {
        const span = insertBtn.querySelector('span');
        if (span) span.textContent = originalText;
        (insertBtn as HTMLButtonElement).disabled = false;
      }
      
      if (!savedPath) {
        if (mainInsertBtn) {
          (mainInsertBtn as HTMLButtonElement).disabled = mainInsertWasDisabled;
          const span = mainInsertBtn.querySelector('span');
          if (span) span.textContent = 'insert';
        }
        if (window.showToast) window.showToast('not ready', 'error');
        (window as any).__insertingGuard = false;
        return;
      }

      try {
        const nleToUse = (window as any).nle || nle;
        if (nleToUse && typeof nleToUse.insertFileAtPlayhead === 'function') {
          const result = await nleToUse.insertFileAtPlayhead(savedPath);
          if (mainInsertBtn) {
            (mainInsertBtn as HTMLButtonElement).disabled = mainInsertWasDisabled;
            const span = mainInsertBtn.querySelector('span');
            if (span) span.textContent = 'insert';
          }
          (window as any).__insertingGuard = false;
          if (result && result.ok) {
            if (window.showToast) window.showToast('inserted' + (result.diag ? ' [' + result.diag + ']' : ''), 'success');
        } else {
            if (window.showToast) window.showToast('insert failed' + (result && result.error ? ' (' + result.error + ')' : ''), 'error');
          }
        } else {
              if (mainInsertBtn) {
                (mainInsertBtn as HTMLButtonElement).disabled = mainInsertWasDisabled;
                const span = mainInsertBtn.querySelector('span');
                if (span) span.textContent = 'insert';
              }
              (window as any).__insertingGuard = false;
          if (window.showToast) window.showToast('insert failed', 'error');
        }
      } catch(_) {
        if (mainInsertBtn) {
          (mainInsertBtn as HTMLButtonElement).disabled = mainInsertWasDisabled;
          const span = mainInsertBtn.querySelector('span');
          if (span) span.textContent = 'insert';
        }
        (window as any).__insertingGuard = false;
        if (window.showToast) window.showToast('insert failed', 'error');
      }
    } catch (e) {
      if (window.showToast) window.showToast('failed to insert', 'error');
      (window as any).__insertingGuard = false;
    }
  };

  const handleCopyOutputLink = (jobId: string) => {
    const job = jobs.find(j => String(j.id) === String(jobId));
    const outputPath = job?.outputPath || job?.outputUrl;
    if (!job || !outputPath) {
      if (window.showToast) window.showToast('output path not available', 'error');
      return;
    }
    
    if (copyToClipboard(outputPath)) {
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

  const handleLoadJobIntoSources = useCallback((jobId: string) => {
    const job = jobs.find(j => String(j.id) === String(jobId));
    
    if (!job) {
      if ((window as any).showToast) {
        (window as any).showToast('job not found', 'error');
      }
      return;
    }
    
    const outputPath = job.outputPath || job.outputUrl;
    const isCompleted = job.status === 'COMPLETED' || job.status === 'completed';
    if (!isCompleted || !outputPath) {
      if ((window as any).showToast) {
        (window as any).showToast('job is not completed yet', 'error');
      }
      return;
    }
    
    // Set flag to indicate we're loading a job (prevents clearing sources tab)
    (window as any).__loadingJobIntoSources = true;
    
    // Disable lipsync button (keep visible, greyed out) and hide audio section
    const lipsyncBtn = document.getElementById('lipsyncBtn');
    if (lipsyncBtn) {
      (lipsyncBtn as HTMLButtonElement).disabled = true;
      lipsyncBtn.style.display = 'flex';
    }
    const audioSection = document.getElementById('audioSection');
    if (audioSection) audioSection.style.display = 'none';
    
    // Switch to sources tab (use window.showTab like main branch)
    if (typeof (window as any).showTab === 'function') {
      (window as any).showTab('sources');
      
      // Ensure button stays disabled after tab switch (showTab might re-enable it)
      setTimeout(() => {
        const btn = document.getElementById('lipsyncBtn');
        if (btn) {
          (btn as HTMLButtonElement).disabled = true;
        }
      }, 50);
    } else {
      // Fallback to React setActiveTab
      setActiveTab('sources');
    }

    // Render the output video and actions immediately (like main branch)
    // Elements are always in DOM, just hidden/shown with CSS
    if ((window as any).renderOutputVideo) {
      (window as any).renderOutputVideo(job);
    }
    if ((window as any).showPostLipsyncActions) {
      (window as any).showPostLipsyncActions(job);
    }
    
    // Clear the flag after a short delay
    setTimeout(() => {
      delete (window as any).__loadingJobIntoSources;
    }, 1000);
    
    if ((window as any).showToast) {
      (window as any).showToast('generation loaded', 'success');
    }
  }, [jobs, setActiveTab]);

  // Keep ref updated
  useEffect(() => {
    handleLoadJobIntoSourcesRef.current = handleLoadJobIntoSources;
  }, [handleLoadJobIntoSources]);

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
      } catch (e) {
        debugError('Failed to redo generation', e);
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
  // Calculate which jobs to render - matching main branch exactly
  // Main branch behavior:
  // - Initially: displayedCount=0, show first 10 items (slice(0, 10))
  // - After first loadMore: displayedCount=10, show first 10 items (slice(0, 10)) - same items
  // - After second loadMore: displayedCount=20, show first 20 items (slice(0, 20))
  // So displayedCount represents the total number of items to show
  const pageSize = 10;
  const currentDisplayedCount = typeof displayedCount === 'number' ? displayedCount : 0;
  // If displayedCount is 0, show first page (10 items). Otherwise show all up to displayedCount
  const endIndex = currentDisplayedCount === 0 
    ? Math.min(pageSize, safeJobs.length)
    : Math.min(currentDisplayedCount, safeJobs.length);
  const jobsToRender = safeJobs.slice(0, endIndex);
  
  // Calculate hasMore based on actual rendered count
  // hasMore = there are more jobs beyond what we've rendered
  const actualHasMore = endIndex < safeJobs.length;

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
    // Enable buttons if job is completed and has outputPath or outputUrl
    // Jobs from Sync API may have outputUrl instead of outputPath
    // Check for both uppercase (Sync API) and lowercase status
    const hasOutput = (isCompleted || job.status === 'COMPLETED') && (job.outputPath || job.outputUrl);

    const timestamp = formatHistoryTimestamp(job);
    const modelText = getModelText(job);
    const thumbnailUrl = thumbnailUrls[job.id];

    return (
      <div
        key={job.id || `job-${index}`}
        className="history-card"
        data-job-id={job.id}
        onClick={(e) => {
          debugLog('[HistoryCard] Clicked', { 
            jobId: job.id, 
            hasOutput, 
            status: job.status,
            outputPath: job.outputPath,
            outputUrl: job.outputUrl,
            clickedButton: !!(e.target as HTMLElement).closest('button'),
            hasHandleLoadJobIntoSources: typeof handleLoadJobIntoSources === 'function'
          });
          if (hasOutput && !(e.target as HTMLElement).closest('button')) {
            // Load job into sources (outputPath or outputUrl from API)
            debugLog('[HistoryCard] Calling handleLoadJobIntoSources', { jobId: job.id });
            try {
            handleLoadJobIntoSources(job.id);
            } catch (error: any) {
              debugError('[HistoryCard] Error calling handleLoadJobIntoSources', error);
            }
          } else {
            debugLog('[HistoryCard] Click ignored', { 
              hasOutput, 
              clickedButton: !!(e.target as HTMLElement).closest('button')
            });
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
              <img
                src={thumbnailUrl || ''}
                alt="Thumbnail"
                className="history-thumbnail"
                data-job-id={job.id}
                loading="lazy"
                decoding="async"
                style={{ opacity: thumbnailUrl ? 1 : 0 }}
                onLoad={(e) => {
                  // Fade in when loaded (matching main branch)
                  (e.target as HTMLImageElement).style.opacity = '1';
                }}
                onError={(e) => {
                  // Hide broken image
                  (e.target as HTMLImageElement).style.opacity = '0';
                }}
              />
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
                      title="save to disk"
                    >
                      <DownloadCloud size={16} />
                      <span>save</span>
                    </button>
                    <button
                      className="history-btn history-btn-primary"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleInsertJob(job.id);
                      }}
                      title="insert into timeline"
                    >
                      <ArrowRightToLine size={16} />
                      <span>insert</span>
                    </button>
                  </>
                ) : (
                  <>
                    <button className="history-btn history-btn-disabled" disabled title="save to disk">
                      <DownloadCloud size={16} />
                      <span>save</span>
                    </button>
                    <button className="history-btn history-btn-disabled" disabled title="insert into timeline">
                      <ArrowRightToLine size={16} />
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
                    <Link size={16} />
                  </button>
                ) : (
                  <button className="history-btn-icon history-btn-disabled" disabled title="copy output link">
                    <Link size={16} />
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
            {serverState?.isOffline ? (
              <div className="history-empty-state">
                <div className="history-empty-icon">
                  <WifiOff size={24} />
                </div>
                <div className="history-empty-message">
                  hmm... you might be offline, or<br />
                  the local server is down. <a onClick={async () => {
                    const nle = window.nle;
                    debugLog("[HistoryTab] Clicked fix this", { hasNLE: !!nle });
                    if (!nle) {
                      debugError("[HistoryTab] nle is null - JSX script failed to load (CEP error code 27)");
                      alert("JSX script failed to load. Check CEP logs at ~/Library/Logs/CSXS/CEP12-PPRO.log for error code 27. The extension may need to be rebuilt.");
                      return;
                    }
                    if (!nle.startBackend) {
                      debugError("[HistoryTab] startBackend function missing");
                      alert("startBackend function is missing. JSX script may not have loaded correctly.");
                      return;
                    }
                    try {
                      const result = await nle.startBackend();
                      debugLog("[HistoryTab] startBackend result", { result });
                      if (result && result.ok) {
                        setTimeout(() => {
                          window.location.reload();
                        }, 2000);
                      } else {
                        alert("Server startup failed: " + (result?.error || "Unknown error"));
                      }
                    } catch (error) {
                      debugError("[HistoryTab] Error calling startBackend", error);
                      alert("Error starting server: " + String(error));
                    }
                  }}>fix this</a>
                </div>
              </div>
          ) : hasError || serverError ? (
            <div className="history-empty-state">
              <div className="history-empty-icon">
                <AlertCircle size={24} />
              </div>
              <div className="history-empty-message">
                {serverError || "failed to load history. please try again."}
              </div>
            </div>
          ) : !hasApiKey ? (
            <div className="history-empty-state">
              <div className="history-empty-icon icon-key">
                <KeyRound size={24} />
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
                <Clapperboard size={24} />
              </div>
              <div className="history-empty-message">
                no generations yet. <a onClick={() => setActiveTab && setActiveTab("sources")}>get started</a>
              </div>
            </div>
          ) : (
            <>
              {jobsToRender.map((job, index) => {
                // Calculate actual index in the full jobs array
                const actualIndex = index;
                return renderHistoryCard(job, actualIndex);
              })}
              {actualHasMore && (
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
