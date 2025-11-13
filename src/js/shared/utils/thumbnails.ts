/**
 * Thumbnail generation and caching for history items
 * Matches main branch implementation in ui/thumbnails.js
 */

// Cache directory in Application Support
const CACHE_DIR = 'sync. extensions/sync-thumbnails';

/**
 * Logs to file using the debug system
 */
function logToFile(message: string) {
  try {
    if (typeof (window as any).logToFile === 'function') {
      (window as any).logToFile(message);
    } else {
      console.log(message);
    }
  } catch(e) {
    console.log(message);
  }
}

/**
 * Gets the cache directory path from CEP
 */
async function getCacheDir(): Promise<string | null> {
  try {
    if (!window.CSInterface) return null;
    const cs = new window.CSInterface();
    const userDataPath = cs.getSystemPath(window.CSInterface.SystemPath.USER_DATA);
    // On macOS: ~/Library/Application Support
    // On Windows: %APPDATA%
    return `${userDataPath}/${CACHE_DIR}`;
  } catch(e: any) {
    logToFile(`Failed to get cache dir: ${e.message}`);
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
    
    // Create video element to capture frame
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    (video as any).playsInline = true;
    
    // For HTTP URLs, try with and without crossOrigin
    if (videoUrl.startsWith('http://') || videoUrl.startsWith('https://')) {
      // Try with anonymous crossOrigin first - required for canvas.toDataURL
      video.crossOrigin = 'anonymous';
      // If that fails, we'll try without it in the error handler
    } else {
      video.crossOrigin = 'anonymous';
    }
    
    return new Promise((resolve) => {
      let hasResolved = false;
      let retryAttempted = false;
      let currentTimeout: NodeJS.Timeout | null = null;
      
      const cleanup = () => {
        try {
          if (currentTimeout) {
            clearTimeout(currentTimeout);
            currentTimeout = null;
          }
          video.pause();
          video.src = '';
          video.load();
        } catch(e) {}
      };
      
      const resolveOnce = (value: string | null) => {
        if (!hasResolved) {
          hasResolved = true;
          cleanup();
          resolve(value);
        }
      };
      
      const tryLoadVideo = (url: string, useCors: boolean) => {
        // Clear previous timeout
        if (currentTimeout) {
          clearTimeout(currentTimeout);
          currentTimeout = null;
        }
        
        // Remove old event listeners
        video.onloadedmetadata = null;
        video.onseeked = null;
        video.onerror = null;
        
        video.crossOrigin = useCors ? 'anonymous' : null;
        video.src = url;
        video.load();
        
        // Timeout after 10 seconds
        currentTimeout = setTimeout(() => {
          logToFile(`[Thumbnails] Thumbnail generation timeout for: ${jobId}`);
          resolveOnce(null);
        }, 10000);
        
        video.onloadedmetadata = () => {
          logToFile(`[Thumbnails] Video metadata loaded, seeking for: ${jobId}`);
          try {
            // Seek to 0.5 seconds to avoid black frames
            video.currentTime = Math.min(0.5, video.duration || 0);
          } catch(e: any) {
            logToFile(`[Thumbnails] Seek error for ${jobId}: ${e.message}`);
            if (currentTimeout) clearTimeout(currentTimeout);
            resolveOnce(null);
          }
        };
        
        video.onseeked = async () => {
          try {
            logToFile(`[Thumbnails] Seeked successfully, capturing frame for: ${jobId}`);
            
            // Create canvas to capture frame
            const canvas = document.createElement('canvas');
            const maxWidth = 200; // Low-res thumbnail
            
            if (!video.videoWidth || !video.videoHeight) {
              logToFile(`[Thumbnails] Invalid video dimensions for: ${jobId}`);
              if (currentTimeout) clearTimeout(currentTimeout);
              resolveOnce(null);
              return;
            }
            
            const aspectRatio = video.videoHeight / video.videoWidth;
            canvas.width = maxWidth;
            canvas.height = Math.round(maxWidth * aspectRatio);
            
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              if (currentTimeout) clearTimeout(currentTimeout);
              resolveOnce(null);
              return;
            }
            
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            
            // Convert to JPEG data URL
            const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
            logToFile(`[Thumbnails] Thumbnail generated successfully for: ${jobId}`);
            
            if (currentTimeout) clearTimeout(currentTimeout);
            resolveOnce(dataUrl);
          } catch(e: any) {
            logToFile(`[Thumbnails] Frame capture error for ${jobId}: ${e.message}`);
            if (currentTimeout) clearTimeout(currentTimeout);
            resolveOnce(null);
          }
        };
        
        video.onerror = (e) => {
          logToFile(`[Thumbnails] Video load error for job: ${jobId} - Error: ${(e as any).type || 'unknown'}`);
          if (currentTimeout) clearTimeout(currentTimeout);
          
          // If CORS failed and we haven't retried, try without crossOrigin for HTTP URLs
          if (url.startsWith('http://') || url.startsWith('https://')) {
            if (useCors && !retryAttempted) {
              logToFile(`[Thumbnails] CORS failed, trying without crossOrigin for: ${jobId}`);
              retryAttempted = true;
              tryLoadVideo(url, false);
              return; // Don't resolve yet, let it try again
            }
          }
          
          resolveOnce(null);
        };
      };
      
      // Start loading with CORS for HTTP URLs
      const useCors = videoUrl.startsWith('http://') || videoUrl.startsWith('https://');
      tryLoadVideo(videoUrl, useCors);
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
    const thumbnailPath = await getThumbnailPath(jobId);
    if (!thumbnailPath) {
      logToFile(`[Thumbnails] No cache path available for: ${jobId}`);
      return false;
    }
    
    // Ensure cache directory exists
    const cacheDir = await getCacheDir();
    if (cacheDir) {
      await ensureCacheDir();
    }
    
    // Save thumbnail using host function
    const isAE = (window.HOST_CONFIG && (window.HOST_CONFIG as any).isAE);
    const saveFn = isAE ? 'AEFT_saveThumbnail' : 'PPRO_saveThumbnail';
    
    // saveThumbnail expects a JSON string payload
    const payload = JSON.stringify({
      path: thumbnailPath,
      dataUrl: thumbnailDataUrl
    });
    
    const result = await (window as any).evalExtendScript?.(saveFn, payload);
    if (result?.ok) {
      logToFile(`[Thumbnails] Cached thumbnail successfully: ${jobId}`);
      return true;
    } else {
      logToFile(`[Thumbnails] Failed to cache thumbnail: ${result?.error || 'unknown error'}`);
      return false;
    }
  } catch(e: any) {
    logToFile(`[Thumbnails] Cache error: ${e.message}`);
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
    logToFile(`[Thumbnails] Updating card thumbnail: ${jobId} - ${thumbnailUrl}`);
    img.onload = () => {
      img.style.opacity = '1';
    };
    img.onerror = () => {
      logToFile(`[Thumbnails] Failed to load image: ${thumbnailUrl}`);
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
  if (!Array.isArray(jobs) || jobs.length === 0) {
    logToFile('[Thumbnails] No jobs to generate thumbnails for');
    return;
  }
  
  logToFile(`[Thumbnails] Starting generation for batch: ${jobs.length} jobs`);
  
  // Only process completed jobs
  const completedJobs = jobs.filter(j => j && j.status === 'completed' && j.id && (j.outputPath || j.videoPath || j.outputUrl));
  logToFile(`[Thumbnails] Completed jobs with video: ${completedJobs.length}`);
  
  for (const job of completedJobs) {
    try {
      logToFile(`[Thumbnails] Processing job: ${job.id} - outputPath: ${job.outputPath || 'none'}, videoPath: ${job.videoPath || 'none'}, outputUrl: ${job.outputUrl || 'none'}, status: ${job.status}`);
      
      // Check for cached thumbnail first
      logToFile(`[Thumbnails] Checking cache for job: ${job.id}`);
      const existing = await loadThumbnail(job.id);
      if (existing) {
        logToFile(`[Thumbnails] Using cached thumbnail: ${job.id}`);
        updateCardThumbnail(job.id, existing);
        continue;
      } else {
        logToFile(`[Thumbnails] No cached thumbnail found, generating new one for: ${job.id}`);
      }
      
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
        continue;
      }
      
      // For HTTP URLs, try to generate through backend proxy
      let finalVideoUrl = videoUrl;
      if (videoUrl.startsWith('http://') || videoUrl.startsWith('https://')) {
        logToFile(`[Thumbnails] HTTP URL detected, will try with CORS: ${videoUrl}`);
        // We'll try to load it directly - many CDNs support CORS
        // If it fails, the onerror handler will hide the loader
        finalVideoUrl = videoUrl;
      } else if (videoUrl.startsWith('file://')) {
        finalVideoUrl = videoUrl;
      } else {
        // Local path without file:// prefix
        finalVideoUrl = 'file://' + videoUrl;
      }
      
      logToFile(`[Thumbnails] Generating thumbnail from: ${finalVideoUrl}`);
      const thumbnailDataUrl = await generateThumbnail(finalVideoUrl, job.id);
      if (thumbnailDataUrl) {
        logToFile(`[Thumbnails] Generated thumbnail successfully for: ${job.id}`);
        updateCardThumbnail(job.id, thumbnailDataUrl);
        
        // Cache the generated thumbnail (only for local files, not URLs)
        if (!videoUrl.startsWith('http://') && !videoUrl.startsWith('https://')) {
          try {
            await cacheThumbnail(job.id, thumbnailDataUrl);
          } catch(e: any) {
            logToFile(`[Thumbnails] Failed to cache thumbnail: ${e.message}`);
          }
        }
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
            placeholder.innerHTML = '<i data-lucide="video"></i>';
            wrapper.appendChild(placeholder);
            if (typeof (window as any).lucide !== 'undefined' && (window as any).lucide.createIcons) {
              (window as any).lucide.createIcons();
            }
          }
        }
      }
    } catch(e: any) {
      logToFile(`[Thumbnails] Error processing job: ${job.id} - ${e.message}`);
    }
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

