/**
 * Thumbnail generation and caching for history items
 * Matches main branch implementation in ui/thumbnails.js
 */

import { debugLog as debugLogFn } from './debugLog';
import { renderIconAsHTML } from './iconUtils';

// Cache directory in Application Support
const CACHE_DIR = 'sync. extensions/sync-thumbnails';

/**
 * Logs to file using the debug system
 */
function logToFile(message: string) {
  try {
    // Use debugLog which sends to server /debug endpoint
    // This ensures logs appear in sync_ppro_debug.log or sync_ae_debug.log
    debugLogFn(`[Thumbnails] ${message}`);
  } catch(e) {
      // Silent failure - logging shouldn't break thumbnails
    try {
      if (typeof (window as any).logToFile === 'function') {
        (window as any).logToFile(message);
    }
    } catch(_) {}
  }
}

/**
 * Gets the cache directory path from CEP
 */
async function getCacheDir(): Promise<string | null> {
  try {
    // Try CSInterface first (preferred method)
    if (window.CSInterface) {
      try {
        const cs = new window.CSInterface();
        const userDataPath = cs.getSystemPath(window.CSInterface.SystemPath.USER_DATA);
        if (userDataPath) {
          // On macOS: ~/Library/Application Support
          // On Windows: %APPDATA%
          const cacheDir = `${userDataPath}/${CACHE_DIR}`;
          logToFile(`[Thumbnails] Cache directory path (from CSInterface): ${cacheDir}`);
          return cacheDir;
        }
      } catch(e: any) {
        logToFile(`[Thumbnails] CSInterface.getSystemPath failed: ${e.message}`);
      }
    }
    
    // Fallback: Try to load CSInterface shim if it exists
    // The shim at src/js/lib/CSInterface.js should be loaded, but if not, we'll try to construct path
    logToFile(`[Thumbnails] CSInterface not available, trying fallback methods`);
    
    // Try to use __adobe_cep__ directly if available (what CSInterface shim uses internally)
    if (typeof (window as any).__adobe_cep__ !== 'undefined' && 
        typeof (window as any).__adobe_cep__.getSystemPath === 'function') {
      try {
        const userDataPath = (window as any).__adobe_cep__.getSystemPath('userData');
        if (userDataPath) {
          const cacheDir = `${userDataPath}/${CACHE_DIR}`;
          logToFile(`[Thumbnails] Cache directory path (from __adobe_cep__): ${cacheDir}`);
          return cacheDir;
        }
      } catch(e: any) {
        logToFile(`[Thumbnails] __adobe_cep__.getSystemPath failed: ${e.message}`);
      }
    }
    
    // Last resort: Use known macOS path structure
    // On macOS, CEP typically uses ~/Library/Application Support
    // We can't access process.env in browser context, so we'll construct a reasonable default
    // Note: This is a best-effort fallback and may not work in all cases
    logToFile(`[Thumbnails] All CEP methods failed, cannot determine cache directory`);
    logToFile(`[Thumbnails] Thumbnails will be generated but not cached to disk`);
    return null;
  } catch(e: any) {
    logToFile(`[Thumbnails] Failed to get cache dir: ${e.message}`);
    return null;
  }
}

/**
 * Ensures cache directory exists
 */
async function ensureCacheDir(): Promise<boolean> {
  const cacheDir = await getCacheDir();
  if (!cacheDir) return false;
  
  try {
    // Call host script to create directory if it doesn't exist
    const isAE = (window.HOST_CONFIG && (window.HOST_CONFIG as any).isAE);
    const fn = isAE ? 'AEFT_ensureDir' : 'PPRO_ensureDir';
    
    const result = await (window as any).evalExtendScript?.(fn, cacheDir);
    return result?.ok === true;
  } catch(e: any) {
    logToFile(`Failed to ensure cache dir: ${e.message}`);
    return false;
  }
}

/**
 * Generates thumbnail file path for a job
 */
async function getThumbnailPath(jobId: string): Promise<string | null> {
  const cacheDir = await getCacheDir();
  if (!cacheDir) return null;
  return `${cacheDir}/${jobId}.jpg`;
}

/**
 * Generates a thumbnail from video URL or path  
 */
async function generateThumbnail(videoUrl: string, jobId: string): Promise<string | null> {
  try {
    logToFile(`[Thumbnails] Generating thumbnail for: ${jobId} from URL: ${videoUrl}`);
    
    // Show loader while generating
    const card = document.querySelector(`.history-card[data-job-id="${jobId}"]`);
    if (card) {
      const loader = card.querySelector('.history-thumbnail-loader') as HTMLElement;
      if (loader) loader.style.display = 'flex';
    }
    
    // Create a NEW video element for each job to avoid conflicts
    // Don't reuse video elements across multiple thumbnail generations
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    (video as any).playsInline = true;
    
    // For HTTP URLs, try without crossOrigin first - works for many CDNs
    if (videoUrl.startsWith('http://') || videoUrl.startsWith('https://')) {
      video.crossOrigin = null;
    } else {
      video.crossOrigin = 'anonymous';
    }
    
    return new Promise((resolve) => {
      let hasResolved = false;
      
      const cleanup = () => {
        try {
          // Remove event handlers FIRST to prevent error events during cleanup
          video.onloadedmetadata = null;
          video.onseeked = null;
          video.onerror = null;
          video.pause();
          video.src = '';
          video.load();
        } catch(e) {
          // Silent cleanup failure
        }
      };
      
      const resolveOnce = (value: string | null) => {
        if (!hasResolved) {
          hasResolved = true;
          cleanup();
          resolve(value);
        }
      };
      
      // Reduced timeout to 8 seconds for faster failure detection
      const timeout = setTimeout(() => {
        logToFile(`[Thumbnails] Thumbnail generation timeout for: ${jobId}`);
        resolveOnce(null);
      }, 8000);
      
      video.onloadedmetadata = () => {
        logToFile(`[Thumbnails] Video metadata loaded, seeking for: ${jobId}`);
        try {
          // Seek to 0.3 seconds (faster than 0.5s) to avoid black frames but load faster
          const seekTime = Math.min(0.3, (video.duration || 0) * 0.1);
          video.currentTime = seekTime;
        } catch(e: any) {
          logToFile(`[Thumbnails] Seek error for ${jobId}: ${e.message}`);
          clearTimeout(timeout);
          resolveOnce(null);
        }
      };
      
      video.onseeked = async () => {
        try {
          logToFile(`[Thumbnails] Seeked successfully, capturing frame for: ${jobId}`);
          
          // Create canvas to capture frame
          const canvas = document.createElement('canvas');
          const maxWidth = 200; // Low-res thumbnail for fast loading
          
          if (!video.videoWidth || !video.videoHeight) {
            logToFile(`[Thumbnails] Invalid video dimensions for: ${jobId}`);
            clearTimeout(timeout);
            resolveOnce(null);
            return;
          }
          
          const aspectRatio = video.videoHeight / video.videoWidth;
          canvas.width = maxWidth;
          canvas.height = Math.round(maxWidth * aspectRatio);
          
          const ctx = canvas.getContext('2d', { 
            willReadFrequently: false, // Optimize for single read
            alpha: false // No alpha channel needed for thumbnails
          });
          if (!ctx) {
            clearTimeout(timeout);
            resolveOnce(null);
            return;
          }
          
          // Use imageSmoothingEnabled for faster rendering
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'low'; // Faster rendering
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          
          // Convert to JPEG data URL with lower quality (0.6) for faster encoding
          const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
          logToFile(`[Thumbnails] Thumbnail generated successfully for: ${jobId}`);
          
          clearTimeout(timeout);
          resolveOnce(dataUrl);
        } catch(e: any) {
          logToFile(`[Thumbnails] Frame capture error for ${jobId}: ${e.message}`);
          clearTimeout(timeout);
          resolveOnce(null);
        }
      };
      
      video.onerror = (e) => {
        logToFile(`[Thumbnails] Video load error for job: ${jobId} - Error: ${(e as any).type || 'unknown'}`);
        clearTimeout(timeout);
        resolveOnce(null);
      };
      
      // Set video source and start loading
      try {
        video.src = videoUrl;
        video.load();
      } catch (e: any) {
        logToFile(`[Thumbnails] Failed to set video source for ${jobId}: ${e.message}`);
        clearTimeout(timeout);
        resolveOnce(null);
      }
    });
  } catch(e: any) {
    logToFile(`[Thumbnails] Generate error for ${jobId}: ${e.message}`);
    // Hide loader on error
    const card = document.querySelector(`.history-card[data-job-id="${jobId}"]`);
    if (card) {
      const loader = card.querySelector('.history-thumbnail-loader') as HTMLElement;
      if (loader) loader.style.display = 'none';
    }
    return null;
  }
}

/**
 * Loads thumbnail for a job if it exists
 * Returns data URL from cached file
 */
async function loadThumbnail(jobId: string): Promise<string | null> {
  const thumbnailPath = await getThumbnailPath(jobId);
  if (!thumbnailPath) {
    logToFile(`[Thumbnails] No thumbnail path for job: ${jobId}`);
    return null;
  }
  
  logToFile(`[Thumbnails] Checking if thumbnail exists at: ${thumbnailPath}`);
  
  try {
    // Check if thumbnail file exists and read it
    const isAE = (window.HOST_CONFIG && (window.HOST_CONFIG as any).isAE);
    const fnExists = isAE ? 'AEFT_fileExists' : 'PPRO_fileExists';
    
    const existsResult = await (window as any).evalExtendScript?.(fnExists, thumbnailPath);
    if (existsResult?.ok && existsResult?.exists) {
      logToFile(`[Thumbnails] Thumbnail file exists, reading: ${jobId}`);
      // File exists, read it and convert to data URL
      const readFn = isAE ? 'AEFT_readThumbnail' : 'PPRO_readThumbnail';
      const readResult = await (window as any).evalExtendScript?.(readFn, thumbnailPath);
      if (readResult?.ok && readResult?.dataUrl) {
        logToFile(`[Thumbnails] Successfully loaded cached thumbnail: ${jobId}`);
        return readResult.dataUrl;
      } else {
        logToFile(`[Thumbnails] Failed to read cached thumbnail for: ${jobId}`);
        return null;
      }
    } else {
      logToFile(`[Thumbnails] Thumbnail file does not exist: ${jobId}`);
      return null;
    }
  } catch(e: any) {
    logToFile(`[Thumbnails] Load error: ${e.message}`);
    return null;
  }
}

/**
 * Caches a thumbnail to disk
 */
async function cacheThumbnail(jobId: string, thumbnailDataUrl: string): Promise<boolean> {
  try {
    logToFile(`[Thumbnails] cacheThumbnail called for: ${jobId}, dataUrl length: ${thumbnailDataUrl?.length || 0}`);
    
    const thumbnailPath = await getThumbnailPath(jobId);
    if (!thumbnailPath) {
      logToFile(`[Thumbnails] No cache path available for: ${jobId}`);
      return false;
    }
    logToFile(`[Thumbnails] Thumbnail path: ${thumbnailPath}`);
    
    // Ensure cache directory exists
    const cacheDir = await getCacheDir();
    logToFile(`[Thumbnails] Cache dir: ${cacheDir || 'null'}`);
    if (cacheDir) {
      const ensured = await ensureCacheDir();
      logToFile(`[Thumbnails] Directory ensured: ${ensured}`);
    }
    
    // Save thumbnail using host function
    const isAE = (window.HOST_CONFIG && (window.HOST_CONFIG as any).isAE);
    const saveFn = isAE ? 'AEFT_saveThumbnail' : 'PPRO_saveThumbnail';
    logToFile(`[Thumbnails] Using save function: ${saveFn}, isAE: ${isAE}`);
    
    // saveThumbnail expects a JSON string payload
    const payload = JSON.stringify({
      path: thumbnailPath,
      dataUrl: thumbnailDataUrl
    });
    logToFile(`[Thumbnails] Payload length: ${payload.length}, path in payload: ${thumbnailPath}`);
    
    if (!(window as any).evalExtendScript) {
      logToFile(`[Thumbnails] evalExtendScript not available!`);
      return false;
    }
    
    logToFile(`[Thumbnails] Calling evalExtendScript for: ${saveFn}`);
    const result = await (window as any).evalExtendScript(saveFn, payload);
    logToFile(`[Thumbnails] evalExtendScript result: ${JSON.stringify(result)}`);
    
    if (result?.ok) {
      logToFile(`[Thumbnails] Cached thumbnail successfully: ${jobId}`);
      return true;
    } else {
      logToFile(`[Thumbnails] Failed to cache thumbnail: ${result?.error || 'unknown error'}, result: ${JSON.stringify(result)}`);
      return false;
    }
  } catch(e: any) {
    logToFile(`[Thumbnails] Cache error: ${e.message}, stack: ${e.stack}`);
    return false;
  }
}

/**
 * Updates thumbnail for a specific card
 */
function updateCardThumbnail(jobId: string, thumbnailUrl: string) {
  if (!thumbnailUrl) return;
  
  // Find the card element
  const card = document.querySelector(`.history-card[data-job-id="${jobId}"]`);
  if (!card) {
    logToFile(`[Thumbnails] Card not found for job: ${jobId}`);
    return;
  }
  
  // Hide the loader
  const loader = card.querySelector('.history-thumbnail-loader') as HTMLElement;
  if (loader) {
    loader.style.display = 'none';
  }
  
  // Update the thumbnail image
  const img = card.querySelector(`.history-thumbnail[data-job-id="${jobId}"]`) as HTMLImageElement;
  if (img) {
    logToFile(`[Thumbnails] Updating card thumbnail: ${jobId} - ${thumbnailUrl.substring(0, 50)}...`);
    img.onload = () => {
      img.style.opacity = '1';
      // Trigger custom event to update React state
      window.dispatchEvent(new CustomEvent('thumbnailUpdated', { 
        detail: { jobId, thumbnailUrl } 
      }));
    };
    img.onerror = () => {
      logToFile(`[Thumbnails] Failed to load image: ${jobId}`);
      img.style.opacity = '0';
    };
    img.src = thumbnailUrl;
  } else {
    logToFile(`[Thumbnails] Image element not found for job: ${jobId}`);
  }
}

/**
 * Generates thumbnails for a batch of jobs
 * Matches main branch implementation exactly
 */
export async function generateThumbnailsForJobs(jobs: any[]): Promise<void> {
  logToFile(`[Thumbnails] generateThumbnailsForJobs CALLED with ${jobs?.length || 0} jobs`);
  
  if (!Array.isArray(jobs) || jobs.length === 0) {
    logToFile('[Thumbnails] No jobs to generate thumbnails for (empty or not array)');
    return;
  }
  
  logToFile(`[Thumbnails] Starting generation for batch: ${jobs.length} jobs`);
  
  // Debug: log first few jobs to see their structure
  if (jobs.length > 0) {
    const sampleJob = jobs[0];
    logToFile(`[Thumbnails] Sample job structure: ${JSON.stringify({
      id: sampleJob?.id,
      status: sampleJob?.status,
      hasOutputPath: !!sampleJob?.outputPath,
      hasOutputUrl: !!sampleJob?.outputUrl,
      hasVideoPath: !!sampleJob?.videoPath,
      outputPath: sampleJob?.outputPath?.substring(0, 50),
      outputUrl: sampleJob?.outputUrl?.substring(0, 50),
      videoPath: sampleJob?.videoPath?.substring(0, 50),
      allKeys: Object.keys(sampleJob || {})
    })}`);
  }
  
  // Process jobs that have video URLs - be more lenient with status
  // Some jobs might have different statuses but still have output videos
  const jobsWithVideo = jobs.filter(j => {
    if (!j || !j.id) return false;
    const hasVideo = !!(j.outputPath || j.videoPath || j.outputUrl);
    return hasVideo;
  });
  logToFile(`[Thumbnails] Jobs with video URLs: ${jobsWithVideo.length} out of ${jobs.length}`);
  
  // Log status breakdown for debugging
  if (jobs.length > 0) {
    const statusCounts: Record<string, number> = {};
    jobs.forEach(j => {
      if (j) {
        const status = j.status || 'no-status';
        statusCounts[status] = (statusCounts[status] || 0) + 1;
      }
    });
    logToFile(`[Thumbnails] Job status breakdown: ${JSON.stringify(statusCounts)}`);
  }
  
  // Process only COMPLETED jobs from Sync API (all jobs in history are from Sync API)
  // The Sync API returns "COMPLETED" (uppercase)
  const completedJobs = jobsWithVideo.filter(j => {
    return j.status === 'COMPLETED';
  });
  
  // Only process completed jobs from Sync API
  const jobsToProcess = completedJobs;
  
  if (completedJobs.length < jobsWithVideo.length) {
    logToFile(`[Thumbnails] Filtered out ${jobsWithVideo.length - completedJobs.length} jobs (not COMPLETED status from Sync API)`);
  }
  logToFile(`[Thumbnails] Processing ${jobsToProcess.length} COMPLETED jobs with video URLs from Sync API`);
  
  // First, check all cached thumbnails in parallel for faster loading
  const cacheCheckPromises = jobsToProcess.map(async (job) => {
    try {
      logToFile(`[Thumbnails] Checking cache for job: ${job.id}`);
      const existing = await loadThumbnail(job.id);
      if (existing) {
        logToFile(`[Thumbnails] Using cached thumbnail (skipping generation): ${job.id}`);
        updateCardThumbnail(job.id, existing);
        return { job, cached: true, thumbnail: existing };
      } else {
        logToFile(`[Thumbnails] No cached thumbnail found, will generate new one for: ${job.id}`);
        return { job, cached: false, thumbnail: null };
      }
    } catch (e: any) {
      logToFile(`[Thumbnails] Error checking cache for ${job.id}: ${e.message}`);
      return { job, cached: false, thumbnail: null };
    }
  });
  
  const cacheResults = await Promise.all(cacheCheckPromises);
  
  // Filter out jobs that already have cached thumbnails
  const jobsNeedingGeneration = cacheResults
    .filter(result => !result.cached)
    .map(result => result.job);
  
  logToFile(`[Thumbnails] ${cacheResults.filter(r => r.cached).length} thumbnails loaded from cache, ${jobsNeedingGeneration.length} need generation`);
  
  // Process jobs that need generation in parallel with concurrency limit
  // This significantly speeds up thumbnail loading while avoiding too many simultaneous video elements
  const CONCURRENCY_LIMIT = 5; // Process 5 thumbnails at once
  
  const processJob = async (job: any) => {
    try {
      logToFile(`[Thumbnails] Processing job: ${job.id} - outputPath: ${job.outputPath || 'none'}, videoPath: ${job.videoPath || 'none'}, outputUrl: ${job.outputUrl || 'none'}, status: ${job.status}`);
      
      // Try to generate from outputPath, outputUrl, or videoPath (in that order)
      // outputPath might be a URL if it came from Sync API
      const videoUrl = job.outputPath || job.outputUrl || job.videoPath;
      if (!videoUrl) {
        logToFile(`[Thumbnails] No video URL for job: ${job.id}`);
        // Hide loader if no video
        const card = document.querySelector(`.history-card[data-job-id="${job.id}"]`);
        if (card) {
          const loader = card.querySelector('.history-thumbnail-loader') as HTMLElement;
          if (loader) loader.style.display = 'none';
        }
        return;
      }
      
      // For HTTP URLs, try to generate through backend proxy
      let finalVideoUrl = videoUrl;
      if (videoUrl.startsWith('http://') || videoUrl.startsWith('https://')) {
        logToFile(`[Thumbnails] HTTP URL detected, will try with CORS: ${videoUrl.substring(0, 100)}`);
        // We'll try to load it directly - many CDNs support CORS
        // If it fails, the onerror handler will hide the loader
        finalVideoUrl = videoUrl;
      } else if (videoUrl.startsWith('file://')) {
        finalVideoUrl = videoUrl;
      } else {
        // Local path without file:// prefix
        finalVideoUrl = 'file://' + videoUrl;
      }
      
      logToFile(`[Thumbnails] Generating thumbnail from: ${finalVideoUrl.substring(0, 100)}`);
      const thumbnailDataUrl = await generateThumbnail(finalVideoUrl, job.id);
      if (thumbnailDataUrl) {
        logToFile(`[Thumbnails] Generated thumbnail successfully for: ${job.id}`);
        updateCardThumbnail(job.id, thumbnailDataUrl);
        
        // Cache the generated thumbnail (don't await to avoid blocking)
        cacheThumbnail(job.id, thumbnailDataUrl).catch((e: any) => {
          logToFile(`[Thumbnails] Failed to cache thumbnail: ${e.message}`);
        });
      } else {
        logToFile(`[Thumbnails] Failed to generate thumbnail, showing placeholder for: ${job.id}`);
        // Show placeholder on failure
        const card = document.querySelector(`.history-card[data-job-id="${job.id}"]`);
        if (card) {
          const loader = card.querySelector('.history-thumbnail-loader') as HTMLElement;
          if (loader) loader.style.display = 'none';
          
          // Replace with placeholder icon
          const wrapper = card.querySelector('.history-thumbnail-wrapper');
          const img = card.querySelector('.history-thumbnail') as HTMLElement;
          if (img) img.remove();
          
          if (wrapper && !wrapper.querySelector('.history-thumbnail-placeholder')) {
            const placeholder = document.createElement('div');
            placeholder.className = 'history-thumbnail-placeholder';
            placeholder.innerHTML = renderIconAsHTML('video', { size: 24 });
            wrapper.appendChild(placeholder);
          }
        }
      }
    } catch(e: any) {
      logToFile(`[Thumbnails] Error processing job: ${job.id} - ${e.message}`);
    }
  };
  
  // Process jobs in parallel batches with concurrency limit
  for (let i = 0; i < jobsNeedingGeneration.length; i += CONCURRENCY_LIMIT) {
    const batch = jobsNeedingGeneration.slice(i, i + CONCURRENCY_LIMIT);
    await Promise.all(batch.map(processJob));
  }
  
  logToFile('[Thumbnails] Batch generation complete');
}

// Expose functions globally for backward compatibility
if (typeof window !== 'undefined') {
  (window as any).generateThumbnailsForJobs = generateThumbnailsForJobs;
  (window as any).updateCardThumbnail = updateCardThumbnail;
  (window as any).loadThumbnail = loadThumbnail;
  (window as any).cacheThumbnail = cacheThumbnail;
}

