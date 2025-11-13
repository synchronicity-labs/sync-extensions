import React, { useEffect, useRef, useState, Component, ErrorInfo, ReactNode, useMemo } from "react";
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
  const displayedCountRef = useRef(displayedCount);
  
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

  // Generate thumbnails for currently rendered jobs - matching main branch behavior
  // This calls generateThumbnailsForJobs like the main branch does
  // Track previous displayedCount to only generate thumbnails for NEW jobs
  const prevDisplayedCountForThumbnailsRef = useRef(0);
  useEffect(() => {
    if (activeTab !== "history" || !jobs || jobs.length === 0) return;

    const pageSize = 10;
    const currentDisplayedCount = typeof displayedCount === 'number' ? displayedCount : 0;
    
    // Calculate which jobs are currently rendered
    // When displayedCount = 0, show first 10 (slice(0, 10)) - generate thumbnails for 0-9
    // When displayedCount = 10, show first 10 (slice(0, 10)) - same items, don't regenerate
    // When displayedCount = 20, show first 20 (slice(0, 20)) - generate thumbnails for 10-19
    const prevDisplayedCount = prevDisplayedCountForThumbnailsRef.current;
    const currentShown = currentDisplayedCount === 0 ? Math.min(pageSize, jobs.length) : Math.min(currentDisplayedCount, jobs.length);
    const prevShown = prevDisplayedCount === 0 ? Math.min(pageSize, jobs.length) : Math.min(prevDisplayedCount, jobs.length);
    
    // Only generate thumbnails for the NEW jobs (the ones just added)
    // If displayedCount hasn't changed, don't regenerate
    if (currentShown === prevShown) {
      return;
    }
    
    // Generate thumbnails for the NEW jobs (from prevShown to currentShown)
    const startIndex = prevShown;
    const endIndex = currentShown;
    const renderedJobs = jobs.slice(startIndex, endIndex);
    
    // Update ref for next time
    prevDisplayedCountForThumbnailsRef.current = currentDisplayedCount;

    // Call generateThumbnailsForJobs like main branch does
    const generateThumbnailsForRendered = async () => {
      if (renderedJobs.length > 0) {
        console.log('[HistoryTab] Calling generateThumbnailsForJobs for', renderedJobs.length, 'new jobs (indices', startIndex, 'to', endIndex, ')');
        console.log('[HistoryTab] Jobs to generate thumbnails for:', renderedJobs.map(j => ({ id: j.id, status: j.status, outputPath: j.outputPath, outputUrl: j.outputUrl })));
        // Use the imported function directly - this will cache thumbnails before they load
        await generateThumbnailsForJobs(renderedJobs);
      }
    };

    const timeout = setTimeout(generateThumbnailsForRendered, 100);
    return () => clearTimeout(timeout);
  }, [jobs, displayedCount, activeTab]);

  // Use ref to access current thumbnailUrls in generateThumbnailsForJobs
  const thumbnailUrlsRef = useRef(thumbnailUrls);
  useEffect(() => {
    thumbnailUrlsRef.current = thumbnailUrls;
  }, [thumbnailUrls]);

  // Expose generateThumbnailsForJobs globally for backward compatibility
  // The thumbnails utility already sets this, but we ensure it's available
  useEffect(() => {
    // The generateThumbnailsForJobs function from thumbnails.ts is already exposed globally
    // We just need to ensure it's available and update React state when thumbnails are set
    const originalGenerateThumbnails = window.generateThumbnailsForJobs;
    if (originalGenerateThumbnails) {
      window.generateThumbnailsForJobs = async (jobsToRender: any[]) => {
        console.log('[generateThumbnailsForJobs] Called with', jobsToRender?.length || 0, 'jobs');
        
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

  // Re-initialize Lucide icons - only when new items are added, not on every render
  const prevDisplayedCountForIconsRef = useRef(displayedCount);
  useEffect(() => {
    if (activeTab === "history" && window.lucide && window.lucide.createIcons) {
      // Only re-initialize if displayedCount actually changed (new items added)
      if (displayedCount !== prevDisplayedCountForIconsRef.current) {
        prevDisplayedCountForIconsRef.current = displayedCount;
        const timer = setTimeout(() => {
          window.lucide.createIcons();
        }, 200); // Slight delay to ensure DOM is updated
        return () => clearTimeout(timer);
      }
    }
  }, [activeTab, displayedCount]);

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
          if (nle && typeof nle.getProjectDir === 'function') {
            const r = await nle.getProjectDir();
            if (r && r.ok && r.outputDir) targetDir = r.outputDir;
          } else if (window.CSInterface) {
            const cs = new window.CSInterface();
            await new Promise((resolve) => {
              cs.evalScript('PPRO_getProjectDir()', (resp: string) => {
                try { 
                  const r = JSON.parse(resp || '{}'); 
                  if (r && r.ok && r.outputDir) targetDir = r.outputDir; 
                } catch(_) {}
                resolve(undefined);
              });
            });
          }
        } catch(_) {}
        
        // If project selected but host didn't resolve, fallback to Documents in AE
        try {
          if (!targetDir && window.HOST_CONFIG && window.HOST_CONFIG.isAE) {
            location = 'documents';
          }
        } catch(_) {}
      }
      
      const apiKey = settings.syncApiKey || '';
      let savedPath = '';
      
      // Mark button as working
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
          const errorMsg = data?.error || `Server returned error ${response.status}`;
          console.error('[handleSaveJob] Save failed:', errorMsg, data);
          if (window.showToast) window.showToast(`failed to save: ${errorMsg}`, 'error');
          return;
        } else {
          // Response OK but no outputPath - might still be processing
          console.warn('[handleSaveJob] Save response OK but no outputPath:', data);
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
      
      // Wait briefly for file to exist on disk if path looks local
      try {
        if (savedPath && savedPath.indexOf('://') === -1 && window.CSInterface) {
          const cs = new window.CSInterface();
          const safe = String(savedPath).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
          let tries = 0;
          let exists = false;
          while (tries < 20 && !exists) {
            await new Promise(resolve => {
              const es = `(function(){try{var f=new File("${safe}");return (f&&f.exists)?'1':'0';}catch(e){return '0';}})()`;
              cs.evalScript(es, (r: string) => {
                exists = String(r || '0') === '1';
                resolve(undefined);
              });
            });
            if (!exists) await new Promise(r => setTimeout(r, 250));
            tries++;
          }
        }
      } catch(_) {}
      
      // Reset button
      if (saveBtn) {
        const span = saveBtn.querySelector('span');
        if (span) span.textContent = originalText;
        (saveBtn as HTMLButtonElement).disabled = false;
      }
      
      if (savedPath) {
        const fp = savedPath.replace(/"/g, '\\"');
        try {
          if (!window.CSInterface) {
            if (window.showToast) window.showToast('saved to ' + location, 'success');
            return;
          }
          
          const cs = new window.CSInterface();
          const isAE = window.HOST_CONFIG ? window.HOST_CONFIG.isAE : false;
          const hostId = window.HOST_CONFIG ? window.HOST_CONFIG.hostId : null;
          const isAEConfirmed = isAE && hostId !== 'PPRO';
          
          if (isAEConfirmed) {
            try {
              const extPath = cs.getSystemPath(window.CSInterface.SystemPath?.EXTENSION || 'EXTENSION').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
              const payload = JSON.stringify({ path: savedPath, binName: 'sync. outputs' }).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
              cs.evalScript(`$.evalFile("${extPath}/host/ae.jsx"); AEFT_importFileToBin("${payload}")`, (r: string) => {
                try {
                  let ok = false;
                  let out: any = null;
                  if (typeof r === 'string') {
                    try {
                      out = JSON.parse(r || '{}');
                    } catch(parseErr) {
                      if (r === '[object Object]' || r.indexOf('ok') !== -1) {
                        out = { ok: true };
      } else {
                        out = { ok: false, error: r };
                      }
                    }
                  } else if (typeof r === 'object' && r !== null) {
                    out = r;
                  } else {
                    out = { ok: false, error: String(r) };
                  }
                  ok = !!(out && out.ok);
                  
                  if (ok) {
                    if (window.showToast) window.showToast('saved to project', 'success');
                  } else {
                    if (window.showToast) window.showToast('save failed', 'error');
                  }
                } catch(_) {
                  if (window.showToast) window.showToast('saved to ' + location, 'success');
                }
              });
            } catch(e) {
              if (window.showToast) window.showToast('saved to ' + location, 'success');
            }
          } else {
            // PPro - import to bin
            try {
              if (nle && typeof nle.importFileToBin === 'function') {
                const result = await nle.importFileToBin(savedPath, 'sync. outputs');
                if (result?.ok) {
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
          }
        } catch(_) {
          if (window.showToast) window.showToast('saved to ' + location, 'success');
        }
      } else {
        if (window.showToast) window.showToast('failed to save', 'error');
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
          if (nle && typeof nle.getProjectDir === 'function') {
            const r = await nle.getProjectDir();
            if (r && r.ok && r.outputDir) targetDir = r.outputDir;
          } else if (window.CSInterface) {
            const cs = new window.CSInterface();
            await new Promise((resolve) => {
              cs.evalScript('PPRO_getProjectDir()', (resp: string) => {
                try { 
                  const r = JSON.parse(resp || '{}'); 
                  if (r && r.ok && r.outputDir) targetDir = r.outputDir; 
                } catch(_) {}
                resolve(undefined);
              });
            });
          }
        } catch(_) {}
        
        // If project selected but host didn't resolve, fallback to Documents in AE
        try {
          if (!targetDir && window.HOST_CONFIG && window.HOST_CONFIG.isAE) {
            location = 'documents';
          }
        } catch(_) {}
      }
      
      const apiKey = settings.syncApiKey || '';
      let savedPath = '';
      
      // Mark button as working
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
          const errorMsg = data?.error || `Server returned error ${response.status}`;
          console.error('[handleInsertJob] Insert failed:', errorMsg, data);
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

      const fp = savedPath.replace(/"/g, '\\"');
      try {
        if (!window.CSInterface) {
          if (mainInsertBtn) {
            (mainInsertBtn as HTMLButtonElement).disabled = mainInsertWasDisabled;
            const span = mainInsertBtn.querySelector('span');
            if (span) span.textContent = 'insert';
          }
          (window as any).__insertingGuard = false;
          if (window.showToast) window.showToast('insert failed', 'error');
          return;
        }
        
        const cs = new window.CSInterface();
        const isAE = window.HOST_CONFIG ? window.HOST_CONFIG.isAE : false;
        const hostId = window.HOST_CONFIG ? window.HOST_CONFIG.hostId : null;
        const isAEConfirmed = isAE && hostId !== 'PPRO';
        
        if (isAEConfirmed) {
          try {
            const extPath = cs.getSystemPath(window.CSInterface.SystemPath?.EXTENSION || 'EXTENSION').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
            cs.evalScript(`$.evalFile("${extPath}/host/ae.jsx"); AEFT_insertFileAtPlayhead("${fp.replace(/\\/g, '\\\\')}")`, (r: string) => {
              try {
                let out: any = null;
                if (typeof r === 'string') {
                  try {
                    out = JSON.parse(r || '{}');
                  } catch(parseErr) {
                    if (r === '[object Object]' || r.indexOf('ok') !== -1) {
                      out = { ok: true };
      } else {
                      out = { ok: false, error: r };
                    }
                  }
                } else if (typeof r === 'object' && r !== null) {
                  out = r;
                } else {
                  out = { ok: false, error: String(r) };
                }
                
                if (out && out.ok === true) {
                  if (window.showToast) window.showToast('inserted' + (out.diag ? ' [' + out.diag + ']' : ''), 'success');
                } else {
                  if (window.showToast) window.showToast('insert failed' + (out && out.error ? ' (' + out.error + ')' : ''), 'error');
                }
              } catch(_) {
                if (window.showToast) window.showToast('insert failed', 'error');
              }
              if (mainInsertBtn) {
                (mainInsertBtn as HTMLButtonElement).disabled = mainInsertWasDisabled;
                const span = mainInsertBtn.querySelector('span');
                if (span) span.textContent = 'insert';
              }
              (window as any).__insertingGuard = false;
            });
          } catch(e) {
            if (window.showToast) window.showToast('insert failed (error)', 'error');
            if (mainInsertBtn) {
              (mainInsertBtn as HTMLButtonElement).disabled = mainInsertWasDisabled;
              const span = mainInsertBtn.querySelector('span');
              if (span) span.textContent = 'insert';
            }
            (window as any).__insertingGuard = false;
          }
        } else {
          // PPro fallback
          try {
            const extPath = cs.getSystemPath(window.CSInterface.SystemPath?.EXTENSION || 'EXTENSION').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
            const payload = JSON.stringify({ path: savedPath }).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
            cs.evalScript(`$.evalFile("${extPath}/host/ppro.jsx"); PPRO_insertFileAtPlayhead("${payload}")`, (r: string) => {
              try {
                const out = (typeof r === 'string') ? JSON.parse(r || '{}') : r;
                if (out && out.ok === true) {
                  if (window.showToast) window.showToast('inserted' + (out.diag ? ' [' + out.diag + ']' : ''), 'success');
                } else {
                  if (window.showToast) window.showToast('insert failed' + (out && out.error ? ' (' + out.error + ')' : ''), 'error');
                }
              } catch(_) {
                if (window.showToast) window.showToast('insert failed', 'error');
              }
              if (mainInsertBtn) {
                (mainInsertBtn as HTMLButtonElement).disabled = mainInsertWasDisabled;
                const span = mainInsertBtn.querySelector('span');
                if (span) span.textContent = 'insert';
              }
              (window as any).__insertingGuard = false;
            });
          } catch(e) {
            if (window.showToast) window.showToast('insert failed', 'error');
            if (mainInsertBtn) {
              (mainInsertBtn as HTMLButtonElement).disabled = mainInsertWasDisabled;
              const span = mainInsertBtn.querySelector('span');
              if (span) span.textContent = 'insert';
            }
            (window as any).__insertingGuard = false;
          }
        }
      } catch(_) {
        if (window.showToast) window.showToast('insert failed', 'error');
        if (mainInsertBtn) {
          (mainInsertBtn as HTMLButtonElement).disabled = mainInsertWasDisabled;
          const span = mainInsertBtn.querySelector('span');
          if (span) span.textContent = 'insert';
        }
        (window as any).__insertingGuard = false;
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

  const handleLoadJobIntoSources = (jobId: string) => {
    console.log('[loadJobIntoSources] Called with jobId:', jobId);
    const job = jobs.find(j => String(j.id) === String(jobId));
    
    if (!job) {
      console.warn('[loadJobIntoSources] Job not found:', jobId);
      if ((window as any).showToast) {
        (window as any).showToast('job not found', 'error');
      }
      return;
    }
    
    console.log('[loadJobIntoSources] Found job:', {
      id: job.id,
      status: job.status,
      outputPath: job.outputPath,
      outputUrl: job.outputUrl
    });
    
    const outputPath = job.outputPath || job.outputUrl;
    if (job.status !== 'completed' || !outputPath) {
      console.warn('[loadJobIntoSources] Job not ready:', {
        status: job.status,
        hasOutputPath: !!job.outputPath,
        hasOutputUrl: !!job.outputUrl
      });
      if ((window as any).showToast) {
        (window as any).showToast('job is not completed yet', 'error');
      }
      return;
    }
    
    console.log('[loadJobIntoSources] Loading job into sources tab...');
    
    // Disable lipsync button (keep visible, greyed out) and hide audio section FIRST
    // Do this before switching tabs to prevent showTab from re-enabling it
    const lipsyncBtn = document.getElementById('lipsyncBtn');
    if (lipsyncBtn) {
      (lipsyncBtn as HTMLButtonElement).disabled = true;
      lipsyncBtn.style.display = 'flex';
    }
    const audioSection = document.getElementById('audioSection');
    if (audioSection) audioSection.style.display = 'none';
    
    // Switch to sources tab
    setActiveTab('sources');
    
    // Ensure button stays disabled after tab switch
    setTimeout(() => {
      const btn = document.getElementById('lipsyncBtn');
      if (btn) {
        (btn as HTMLButtonElement).disabled = true;
      }
    }, 50);
    
    // Render the output video and actions
    if ((window as any).renderOutputVideo) {
      (window as any).renderOutputVideo(job);
    }
    if ((window as any).showPostLipsyncActions) {
      (window as any).showPostLipsyncActions(job);
    }
    
    // Show toast
    if ((window as any).showToast) {
      (window as any).showToast('generation loaded', 'success');
    }
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
    const hasOutput = isCompleted && (job.outputPath || job.outputUrl);

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
            // Load job into sources (outputPath or outputUrl from API)
            handleLoadJobIntoSources(job.id);
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
                style={{ opacity: thumbnailUrl ? 1 : 0 }}
                onLoad={(e) => {
                  // Fade in when loaded (matching main branch)
                  (e.target as HTMLImageElement).style.opacity = '1';
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
