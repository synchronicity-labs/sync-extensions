import { useEffect, useRef } from "react";
import { formatTime } from "../utils/stringUtils";
import { renderIconAsHTML } from "../utils/iconUtils";
import { DELAYS } from "../utils/constants";
import { debugLog, debugError } from "../utils/debugLog";

export const useVideoPlayer = (videoSrc: string | null) => {
  const playerInitialized = useRef(false);
  const listenersSetup = useRef(false); // Track if listeners are already set up
  const cleanupRef = useRef<(() => void) | null>(null);
  const videoSrcRef = useRef<string | null>(null);

  useEffect(() => {
    // Cleanup if videoSrc becomes null
    if (!videoSrc) {
      playerInitialized.current = false;
      listenersSetup.current = false;
      videoSrcRef.current = null;
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
      return;
    }

    // Skip if same src (already initialized)
    if (videoSrcRef.current === videoSrc && playerInitialized.current && listenersSetup.current) {
      return;
    }

    // If src changed, reset listeners setup flag
    if (videoSrcRef.current !== videoSrc && videoSrcRef.current !== null) {
      listenersSetup.current = false;
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    }

    videoSrcRef.current = videoSrc;

    const video = document.getElementById("mainVideo") as HTMLVideoElement;
    const videoPreview = document.getElementById("videoPreview");
    
    // If video was reloaded (readyState is 0 but we had listeners), reset them
    if (video && video.readyState === 0 && listenersSetup.current) {
      debugLog('[useVideoPlayer] Video was reloaded (readyState=0), resetting listeners');
      listenersSetup.current = false;
      playerInitialized.current = false;
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    }
    
    if (!video || !videoPreview) {
      debugLog('[useVideoPlayer] Video element or preview not found', {
        hasVideo: !!video,
        hasVideoPreview: !!videoPreview,
      });
      return;
    }

    // Wait for React to set the src - check if it matches what we expect
    const expectedSrc = videoSrc.startsWith('file://') || videoSrc.startsWith('http') 
      ? videoSrc 
      : `file://${videoSrc.replace(/ /g, '%20')}`;
    
    debugLog('[useVideoPlayer] Initializing player', {
      videoSrc,
      expectedSrc: expectedSrc.substring(0, 100) + '...',
      currentVideoSrc: video.src?.substring(0, 100) + '...',
      videoReadyState: video.readyState,
      videoNetworkState: video.networkState,
    });
    
    const checkAndInit = () => {
      const currentSrc = video.src || video.getAttribute('src') || '';
      const isVisible = window.getComputedStyle(videoPreview).display !== 'none';
      
      debugLog('[useVideoPlayer] checkAndInit', {
        currentSrc: currentSrc.substring(0, 100) + '...',
        expectedSrc: expectedSrc.substring(0, 100) + '...',
        videoSrc,
        isVisible,
        videoReadyState: video.readyState,
        videoDuration: video.duration,
        videoNetworkState: video.networkState,
        playerInitialized: playerInitialized.current,
        listenersSetup: listenersSetup.current,
      });
      
      // Check if src matches (allowing for URL encoding differences)
      // Also allow HTTP/HTTPS URLs even if videoSrc is a local path (uploaded URL case)
      const exactMatch = currentSrc === expectedSrc;
      const rawMatch = currentSrc === videoSrc;
      let decodedMatch = false;
      let filenameMatch = false;
      const isHttpUrl = currentSrc.startsWith('http://') || currentSrc.startsWith('https://');
      
      try {
        decodedMatch = decodeURIComponent(currentSrc) === decodeURIComponent(expectedSrc);
      } catch (e) {
        // Silent fail
      }
      
      const filename = videoSrc.split('/').pop() || '';
      filenameMatch = currentSrc.includes(filename);
      
      // If video has HTTP URL and we have a videoSrc (local path), consider it a match
      const httpUrlMatch = isHttpUrl && videoSrc && !expectedSrc.startsWith('file://');
      
      const srcMatches = currentSrc && (exactMatch || rawMatch || decodedMatch || filenameMatch || httpUrlMatch);
      
      debugLog('[useVideoPlayer] checkAndInit: Matching results', {
        exactMatch,
        rawMatch,
        decodedMatch,
        filenameMatch,
        httpUrlMatch,
        srcMatches,
        isHttpUrl,
        isVisible,
      });
      
      // Don't block initialization based on visibility - React may not have updated DOM yet
      // The video element exists and has a src, so we should initialize
      if (!isVisible) {
        debugLog('[useVideoPlayer] checkAndInit: Preview not visible, but allowing init anyway (React may not have updated DOM yet)');
        // Don't return false - allow initialization even if preview appears hidden
        // The visibility check was too strict and prevented initialization
      }
      
      if (!srcMatches && !isHttpUrl) {
        debugLog('[useVideoPlayer] checkAndInit: Src does not match and not HTTP URL, skipping');
        return false;
      }
      
      // If HTTP URL and video has metadata loaded, allow initialization
      if (isHttpUrl && video.readyState >= 1 && video.duration > 0) {
        if (playerInitialized.current && listenersSetup.current) {
          debugLog('[useVideoPlayer] checkAndInit: Already initialized, skipping');
          return false;
        }
        debugLog('[useVideoPlayer] checkAndInit: HTTP URL with metadata, allowing init');
        return true;
      }
      
      if (playerInitialized.current && listenersSetup.current) {
        debugLog('[useVideoPlayer] checkAndInit: Already initialized, skipping');
        return false;
      }
      
      debugLog('[useVideoPlayer] checkAndInit: Allowing initialization');
      return true;
    };

    // Initialize function
    const initPlayer = () => {
      debugLog('[useVideoPlayer] initPlayer: Called');
      if (!checkAndInit()) {
        debugLog('[useVideoPlayer] initPlayer: checkAndInit returned false, aborting');
        return;
      }
      
      // Prevent duplicate listener setup
      if (listenersSetup.current) {
        debugLog('[useVideoPlayer] initPlayer: Listeners already setup, aborting');
        return;
      }
      
      debugLog('[useVideoPlayer] initPlayer: Proceeding with initialization', {
        videoSrc,
        videoSrcRef: videoSrcRef.current,
        videoCurrentSrc: video.src?.substring(0, 100) + '...',
      });
      
      // Now initialize
      const centerPlayBtn = document.getElementById("centerPlayBtn");
      const playOverlay = document.getElementById("videoPlayOverlay");
      const timeDisplay = document.getElementById("videoTime");
      const frameInfo = document.getElementById("videoFrameInfo");
      const progressFill = document.getElementById("videoProgress");
      const progressThumb = document.getElementById("videoThumb");
      const progressBar = document.querySelector(".video-progress-bar");
      const volumeBtn = document.getElementById("volumeBtn");
      const volumeSlider = document.getElementById("volumeSlider") as HTMLInputElement;

      // Mark listeners as set up to prevent duplicates
      listenersSetup.current = true;
      
      // Mark as initializing - will be set to true only after video loads successfully
      playerInitialized.current = false;

      // Initialize display when metadata loads
      const updateVideoDuration = () => {
        const duration = video.duration || 0;
        const currentTime = video.currentTime || 0;
        debugLog('[useVideoPlayer] updateVideoDuration', {
          duration,
          currentTime,
          isFinite: isFinite(duration),
          readyState: video.readyState,
          networkState: video.networkState,
          src: video.src?.substring(0, 100) + '...',
          currentSrc: video.currentSrc?.substring(0, 100) + '...',
        });
        if (!duration || duration === 0 || !isFinite(duration)) {
          debugError('[useVideoPlayer] Invalid video duration', {
            duration,
            readyState: video.readyState,
            networkState: video.networkState,
            src: video.src,
            currentSrc: video.currentSrc,
            error: video.error,
          });
        }
        const durationStr = isFinite(duration) && duration > 0 ? formatTime(duration) : "--";
        const currentStr = formatTime(currentTime);
        if (timeDisplay) timeDisplay.textContent = `${currentStr} / ${durationStr}`;
        if (frameInfo) {
          const totalFrames = isFinite(duration) && duration > 0 ? Math.floor(duration * 30) : 0;
          const currentFrame = Math.floor(currentTime * 30);
          frameInfo.textContent = `${currentFrame} / ${totalFrames || "--"}`;
        }
        
        // Reset progress bar to start if at end
        if (duration > 0 && currentTime >= duration - 0.1) {
          if (progressFill) (progressFill as HTMLElement).style.width = '0%';
          if (progressThumb) (progressThumb as HTMLElement).style.left = '0%';
        }
      };

      // Mark initialization complete when metadata loads
      const markInitialized = () => {
        if (!playerInitialized.current) {
          playerInitialized.current = true;
          // Ensure video starts at the beginning
          if (video.currentTime > 0 && video.paused) {
            video.currentTime = 0;
          }
        }
      };

      // Check if metadata is already loaded
      debugLog('[useVideoPlayer] initPlayer: Checking if metadata already loaded', {
        readyState: video.readyState,
        duration: video.duration,
        src: video.src?.substring(0, 100) + '...',
      });
      if (video.readyState >= 1 && video.duration > 0) {
        debugLog('[useVideoPlayer] initPlayer: Metadata already loaded, updating duration');
        updateVideoDuration();
        markInitialized();
      } else {
        debugLog('[useVideoPlayer] initPlayer: Metadata not loaded yet, setting up listeners');
        // Wait for metadata to load before marking as initialized
        const handleMetadataLoaded = () => {
          debugLog('[useVideoPlayer] handleMetadataLoaded: Metadata loaded', {
            duration: video.duration,
            readyState: video.readyState,
            src: video.src?.substring(0, 100) + '...',
          });
          updateVideoDuration();
          markInitialized();
        };
        video.addEventListener("loadedmetadata", handleMetadataLoaded, { once: true });
        
        // Also listen for loadeddata as fallback
        const handleLoadedData = () => {
          debugLog('[useVideoPlayer] handleLoadedData: Data loaded', {
            duration: video.duration,
            readyState: video.readyState,
          });
          if (video.duration > 0) {
            updateVideoDuration();
            markInitialized();
          } else {
            debugError('[useVideoPlayer] handleLoadedData: Duration still 0 after loadeddata', {
              duration: video.duration,
              readyState: video.readyState,
              networkState: video.networkState,
              src: video.src,
              error: video.error,
            });
          }
        };
        video.addEventListener("loadeddata", handleLoadedData, { once: true });
      }

      // Listen for duration changes
      const handleDurationChange = () => {
        updateVideoDuration();
        if (video.duration > 0) {
          markInitialized();
        }
      };
      video.addEventListener("durationchange", handleDurationChange);

      const handleCanPlayMetadata = () => {
        updateVideoDuration();
        markInitialized();
      };
      video.addEventListener("canplay", handleCanPlayMetadata);

      // Use requestAnimationFrame for smooth, real-time progress updates
      // No throttling - update on every frame for zero lag
      let animationFrameId: number | null = null;
      
      const updateProgress = () => {
        const currentTime = video.currentTime || 0;
        const duration = video.duration || 0;
        
        if (!isFinite(duration) || duration <= 0) {
          // Keep looping if playing, even without duration yet
          if (!video.paused && !video.ended) {
            animationFrameId = requestAnimationFrame(updateProgress);
          } else {
            animationFrameId = null;
          }
          return;
        }

        // Always update DOM immediately for zero lag
        const current = formatTime(currentTime);
        const durationStr = formatTime(duration);
        const progress = Math.max(0, Math.min(100, (currentTime / duration) * 100));

        // Update all UI elements synchronously
        if (timeDisplay) timeDisplay.textContent = `${current} / ${durationStr}`;
        if (progressFill) (progressFill as HTMLElement).style.width = `${progress}%`;
        if (progressThumb) (progressThumb as HTMLElement).style.left = `${progress}%`;

        // Frame info (approximate)
        if (frameInfo) {
          const currentFrame = Math.floor(currentTime * 30); // Assume 30fps
          const totalFrames = Math.floor(duration * 30);
          frameInfo.textContent = `${currentFrame} / ${totalFrames}`;
        }

        // Continue animation loop while playing - always request next frame immediately
        if (!video.paused && !video.ended) {
          animationFrameId = requestAnimationFrame(updateProgress);
        } else {
          animationFrameId = null;
        }
      };

      // Hide overlay when playing, show when paused
      const handlePlay = () => {
        if (playOverlay) playOverlay.classList.add("hidden");
        // Always start animation loop immediately for smooth, lag-free updates
        if (!animationFrameId) {
          animationFrameId = requestAnimationFrame(updateProgress);
        }
      };

      const handlePause = () => {
        if (playOverlay) playOverlay.classList.remove("hidden");
        // Stop animation loop when paused
        if (animationFrameId) {
          cancelAnimationFrame(animationFrameId);
          animationFrameId = null;
        }
        // Update one final time to show current position
        updateProgress();
      };

      const handleEnded = () => {
        if (playOverlay) playOverlay.classList.remove("hidden");
        // Stop animation loop when ended
        if (animationFrameId) {
          cancelAnimationFrame(animationFrameId);
          animationFrameId = null;
        }
        // Update one final time to show end position
        updateProgress();
      };

      // Listen to timeupdate as sync check (ensures we're in sync with actual playback)
      // The animation loop handles smooth updates, this is just a safety net
      const handleTimeUpdate = () => {
        // Animation loop should handle all updates smoothly
        // This is just a fallback if animation loop somehow stops
        if (video.duration > 0 && !animationFrameId && !video.paused && !video.ended) {
          // Restart animation loop if it stopped unexpectedly
          animationFrameId = requestAnimationFrame(updateProgress);
        }
      };

      // Handle buffering - show overlay when video is waiting for data
      const handleWaiting = () => {
        debugLog('[useVideoPlayer] Video waiting for data (buffering)', {
          readyState: video.readyState,
          buffered: video.buffered.length > 0 ? video.buffered.end(0) : 0,
          currentTime: video.currentTime,
        });
        // Show play overlay while buffering
        if (playOverlay) playOverlay.classList.remove("hidden");
      };

      const handleCanPlayBuffering = () => {
        debugLog('[useVideoPlayer] Video can play (buffered)', {
          readyState: video.readyState,
          buffered: video.buffered.length > 0 ? video.buffered.end(0) : 0,
        });
        // Hide overlay if video is playing
        if (!video.paused && playOverlay) {
          playOverlay.classList.add("hidden");
        }
      };

      // Track buffering progress to reduce lag
      const handleProgress = () => {
        if (video.buffered.length > 0) {
          const bufferedEnd = video.buffered.end(video.buffered.length - 1);
          const bufferedAhead = bufferedEnd - video.currentTime;
          debugLog('[useVideoPlayer] Video buffering progress', {
            bufferedAhead: bufferedAhead.toFixed(2),
            bufferedEnd: bufferedEnd.toFixed(2),
            currentTime: video.currentTime.toFixed(2),
            readyState: video.readyState,
          });
          // If we have less than 2 seconds buffered and video is playing, try to buffer more
          if (!video.paused && bufferedAhead < 2 && video.readyState < 4) {
            // Video might need more buffering - browser will handle this automatically
            // but we can log it for debugging
          }
        }
      };

      video.addEventListener("play", handlePlay);
      video.addEventListener("pause", handlePause);
      video.addEventListener("ended", handleEnded);
      video.addEventListener("waiting", handleWaiting);
      video.addEventListener("canplay", handleCanPlayBuffering);
      video.addEventListener("progress", handleProgress);
      video.addEventListener("timeupdate", handleTimeUpdate);
      
      // Start animation if video is already playing
      if (!video.paused && !video.ended) {
        animationFrameId = requestAnimationFrame(updateProgress);
      }

      // Progress bar scrubbing - support both click and drag
      let isDragging = false;
      
      const handleProgressMouseDown = (e: MouseEvent) => {
        if (!progressBar || !video.duration) return;
        e.stopPropagation();
        e.preventDefault();
        isDragging = true;
        
        const rect = progressBar.getBoundingClientRect();
        const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        video.currentTime = pos * video.duration;
      };
      
      const handleProgressMouseMove = (e: MouseEvent) => {
        if (!isDragging || !progressBar || !video.duration) return;
        e.stopPropagation();
        e.preventDefault();
        
        const rect = progressBar.getBoundingClientRect();
        const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        video.currentTime = pos * video.duration;
      };
      
      const handleProgressMouseUp = () => {
        isDragging = false;
      };
      
      const handleProgressClick = (e: MouseEvent) => {
        if (!progressBar || !video.duration) return;
        e.stopPropagation();
        e.preventDefault();
        const rect = progressBar.getBoundingClientRect();
        const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        video.currentTime = pos * video.duration;
      };

      if (progressBar) {
        progressBar.addEventListener("mousedown", handleProgressMouseDown);
        progressBar.addEventListener("click", handleProgressClick);
        document.addEventListener("mousemove", handleProgressMouseMove);
        document.addEventListener("mouseup", handleProgressMouseUp);
      }

      // Play/pause functionality
      const togglePlay = async (e?: Event) => {
        if (e) {
          e.stopPropagation();
        }
        if (video.paused) {
          // Ensure we start from the beginning if at the end
          if (video.duration > 0 && video.currentTime >= video.duration - 0.1) {
            video.currentTime = 0;
          }
          
          // Check if video has metadata (readyState >= 1)
          // readyState: 0=HAVE_NOTHING, 1=HAVE_METADATA, 2=HAVE_CURRENT_DATA, 3=HAVE_FUTURE_DATA, 4=HAVE_ENOUGH_DATA
          if (video.readyState === 0) {
            debugLog('[useVideoPlayer] togglePlay: Video has no data, loading...', {
              readyState: video.readyState,
              duration: video.duration,
              networkState: video.networkState,
            });
            // Video has no data, try to load it
            video.load();
            // Wait for metadata before playing
            const playWhenReady = () => {
              video.currentTime = 0; // Ensure we start at the beginning
              video.play().catch((err) => {
                debugError('[useVideoPlayer] togglePlay: Play failed after loading', {
                  error: err,
                  readyState: video.readyState,
                });
              });
              video.removeEventListener('loadedmetadata', playWhenReady);
            };
            video.addEventListener('loadedmetadata', playWhenReady, { once: true });
            return;
          }
          
          // Video has metadata (readyState >= 1), try to play immediately
          // Don't wait for buffering - let the browser handle it naturally
          try {
            await video.play();
            debugLog('[useVideoPlayer] togglePlay: Play started successfully', {
              readyState: video.readyState,
              buffered: video.buffered.length > 0 ? video.buffered.end(0) : 0,
            });
          } catch (err) {
            debugError('[useVideoPlayer] togglePlay: Play failed, will retry on canplay', {
              error: err,
              readyState: video.readyState,
              duration: video.duration,
              networkState: video.networkState,
              paused: video.paused,
            });
            // If play failed, wait for canplay event and retry
            const retryPlay = () => {
              video.currentTime = 0; // Ensure we start at the beginning
              video.play().catch((retryErr) => {
                debugError('[useVideoPlayer] togglePlay: Retry play also failed', {
                  error: retryErr,
                  readyState: video.readyState,
                });
              });
              video.removeEventListener('canplay', retryPlay);
            };
            video.addEventListener('canplay', retryPlay, { once: true });
          }
        } else {
          video.pause();
        }
      };

      // Center play button click handler
      const handleCenterPlayBtnClick = (e: MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        debugLog('[useVideoPlayer] Center play button clicked', {
          videoPaused: video.paused,
          readyState: video.readyState,
          duration: video.duration,
          src: video.src?.substring(0, 100) + '...',
        });
        togglePlay(e);
      };

      if (centerPlayBtn) {
        // Clone and replace to remove all existing listeners
        const newBtn = centerPlayBtn.cloneNode(true) as HTMLElement;
        centerPlayBtn.parentNode?.replaceChild(newBtn, centerPlayBtn);
        
        // Attach fresh listener
        newBtn.addEventListener("click", handleCenterPlayBtnClick);
        // Ensure button is clickable
        newBtn.style.pointerEvents = 'auto';
        newBtn.style.cursor = 'pointer';
        newBtn.style.zIndex = '1000';
        newBtn.style.position = 'relative';
        
        debugLog('[useVideoPlayer] Center play button listener attached', {
          hasButton: !!newBtn,
          buttonId: newBtn.id,
        });
      } else {
        debugError('[useVideoPlayer] Center play button not found!');
      }

      // Video element click handler - clicking anywhere on video pauses it
      // But exclude clicks on controls (progress bar, buttons, etc.)
      const handleVideoClick = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        // Don't toggle if clicking on controls or buttons
        if (
          target.closest('.video-controls') ||
          target.closest('.video-play-overlay') ||
          target.closest('button') ||
          target.closest('.video-progress-bar')
        ) {
          return;
        }
        togglePlay(e);
      };

      video.addEventListener("click", handleVideoClick);

      // Volume control
      const handleVolumeSliderInput = (e: Event) => {
        e.stopPropagation();
        video.volume = (e.target as HTMLInputElement).valueAsNumber / 100;
      };

      if (volumeSlider) {
        volumeSlider.addEventListener("input", handleVolumeSliderInput);
      }

      // Volume button
      const handleVolumeBtnClick = (e: MouseEvent) => {
        e.stopPropagation();
        video.muted = !video.muted;
        if (video.muted) {
          volumeBtn.innerHTML = renderIconAsHTML("volume-x", { size: 12 });
        } else {
          volumeBtn.innerHTML = renderIconAsHTML("volume-2", { size: 12 });
        }
      };

      if (volumeBtn) {
        volumeBtn.addEventListener("click", handleVolumeBtnClick);
      }

      // Handle video errors - don't reset listeners
      const handleVideoError = () => {
        // Don't reset playerInitialized or listenersSetup - keep listeners attached
        // The video might recover or the user might select a different file
      };
      video.addEventListener("error", handleVideoError);

      // Don't mark as initialized here - wait for loadedmetadata/canplay
      // If video already has metadata, markInitialized() was called above
      if (video.readyState >= 1 && video.duration > 0) {
        markInitialized();
      }

      // Store cleanup function
      cleanupRef.current = () => {
        // Cancel animation frame if running
        if (animationFrameId !== null) {
          cancelAnimationFrame(animationFrameId);
          animationFrameId = null;
        }
        
        // Note: loadedmetadata and loadeddata listeners use { once: true } so they auto-remove
        video.removeEventListener("durationchange", handleDurationChange);
        video.removeEventListener("canplay", handleCanPlayMetadata);
        video.removeEventListener("canplay", handleCanPlayBuffering);
        video.removeEventListener("error", handleVideoError);
        video.removeEventListener("timeupdate", handleTimeUpdate);
        video.removeEventListener("play", handlePlay);
        video.removeEventListener("pause", handlePause);
        video.removeEventListener("ended", handleEnded);
        video.removeEventListener("waiting", handleWaiting);
        video.removeEventListener("progress", handleProgress);
        video.removeEventListener("click", handleVideoClick);
        if (progressBar) {
          progressBar.removeEventListener("mousedown", handleProgressMouseDown);
          progressBar.removeEventListener("click", handleProgressClick);
          document.removeEventListener("mousemove", handleProgressMouseMove);
          document.removeEventListener("mouseup", handleProgressMouseUp);
        }
        if (volumeSlider) {
          volumeSlider.removeEventListener("input", handleVolumeSliderInput);
        }
        if (volumeBtn) {
          volumeBtn.removeEventListener("click", handleVolumeBtnClick);
        }
        // Note: centerPlayBtn was cloned, so we don't need to remove listeners
        // The cloned node will be garbage collected
      };
    };

    // Try immediately
    debugLog('[useVideoPlayer] Attempting immediate initialization');
    if (checkAndInit()) {
      debugLog('[useVideoPlayer] Immediate checkAndInit passed, calling initPlayer');
      initPlayer();
    } else {
      debugLog('[useVideoPlayer] Immediate checkAndInit failed, will retry');
    }
    
    // Also listen for loadedmetadata event (fires when React sets src and browser loads it)
    const handleLoadedMetadata = () => {
      debugLog('[useVideoPlayer] handleLoadedMetadata: Event fired', {
        duration: video.duration,
        readyState: video.readyState,
        src: video.src?.substring(0, 100) + '...',
        listenersSetup: listenersSetup.current,
        playerInitialized: playerInitialized.current,
      });
      // If listeners aren't set up yet, initialize
      if (!listenersSetup.current) {
        debugLog('[useVideoPlayer] handleLoadedMetadata: Listeners not setup, checking init');
        if (checkAndInit()) {
          debugLog('[useVideoPlayer] handleLoadedMetadata: checkAndInit passed, calling initPlayer');
          initPlayer();
        } else {
          debugLog('[useVideoPlayer] handleLoadedMetadata: checkAndInit failed');
        }
      } else {
        debugLog('[useVideoPlayer] handleLoadedMetadata: Listeners already setup');
        // Listeners already set up, just mark as initialized if metadata loaded
        if (video.duration > 0 && !playerInitialized.current) {
          debugLog('[useVideoPlayer] handleLoadedMetadata: Marking as initialized');
          playerInitialized.current = true;
        } else {
          debugLog('[useVideoPlayer] handleLoadedMetadata: Not marking initialized', {
            duration: video.duration,
            playerInitialized: playerInitialized.current,
          });
        }
      }
    };
    
    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    
    // Fallback: retry a few times in case React hasn't set src yet
    let retries = 0;
    const maxRetries = 10;
    const retryInterval = setInterval(() => {
      retries++;
      debugLog('[useVideoPlayer] Retry attempt', { 
        retries, 
        maxRetries,
        playerInitialized: playerInitialized.current,
        listenersSetup: listenersSetup.current,
        videoSrc: video.src?.substring(0, 100) + '...',
        videoReadyState: video.readyState,
        videoDuration: video.duration,
      });
      // Stop if already initialized
      if (playerInitialized.current && listenersSetup.current) {
        debugLog('[useVideoPlayer] Retry: Already initialized, stopping');
        clearInterval(retryInterval);
        return;
      }
      
      if (checkAndInit()) {
        debugLog('[useVideoPlayer] Retry: checkAndInit passed, calling initPlayer');
        initPlayer();
        clearInterval(retryInterval);
      } else if (retries >= maxRetries) {
        debugError('[useVideoPlayer] Retry: Max retries reached, giving up', {
          retries,
          maxRetries,
          videoSrc,
          videoCurrentSrc: video.src?.substring(0, 100) + '...',
          videoReadyState: video.readyState,
          videoDuration: video.duration,
          videoNetworkState: video.networkState,
          videoError: video.error,
        });
        clearInterval(retryInterval);
      }
    }, 100);

    // Store cleanup function
    cleanupRef.current = () => {
      clearInterval(retryInterval);
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
    };

    // Cleanup on unmount or src change
    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
      playerInitialized.current = false;
      listenersSetup.current = false;
    };
  }, [videoSrc]);
};
