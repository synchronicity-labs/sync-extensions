import { useEffect, useRef } from "react";
import { formatTime } from "../utils/formatTime";

export const useVideoPlayer = (videoSrc: string | null) => {
  const playerInitialized = useRef(false);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!videoSrc) {
      playerInitialized.current = false;
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
      return;
    }

    // Wait for React to finish rendering the video element with correct src
    let retryCount = 0;
    const maxRetries = 20;
    const tryInit = () => {
      const video = document.getElementById("mainVideo") as HTMLVideoElement;
      const videoPreview = document.getElementById("videoPreview");
      
      // Check if element exists and is visible
      if (!video || !videoPreview) {
        if (retryCount < maxRetries) {
          retryCount++;
          setTimeout(tryInit, 50);
          return;
        }
        return;
      }
      
      // Check if video preview is visible
      const isVisible = window.getComputedStyle(videoPreview).display !== 'none';
      if (!isVisible) {
        if (retryCount < maxRetries) {
          retryCount++;
          setTimeout(tryInit, 50);
          return;
        }
        return;
      }
      
      // Check if video has src set (React may not have updated it yet)
      const currentSrc = video.getAttribute('src') || video.src;
      const expectedSrc = videoSrc.startsWith('file://') ? videoSrc : (videoSrc ? `file://${videoSrc.replace(/ /g, '%20')}` : '');
      if (!currentSrc || (videoSrc && !currentSrc.includes(videoSrc.replace(/ /g, '%20').split('/').pop() || ''))) {
        if (retryCount < maxRetries) {
          retryCount++;
          setTimeout(tryInit, 50);
          return;
        }
      }
      
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

      // Reset initialization flag
      if (playerInitialized.current) {
        playerInitialized.current = false;
      }

      // Initialize display when metadata loads
      const updateVideoDuration = () => {
          const duration = video.duration || 0;
        const durationStr = isFinite(duration) && duration > 0 ? formatTime(duration) : "--";
        if (timeDisplay) timeDisplay.textContent = `00:00 / ${durationStr}`;
        if (frameInfo) {
          const totalFrames = isFinite(duration) && duration > 0 ? Math.floor(duration * 30) : 0;
          frameInfo.textContent = `0 / ${totalFrames || "--"}`;
        }
      };

      // Check if metadata is already loaded
      if (video.readyState >= 1) {
        updateVideoDuration();
      } else {
        video.addEventListener("loadedmetadata", updateVideoDuration);
      }

      // Listen for duration changes
      video.addEventListener("durationchange", () => {
        updateVideoDuration();
      });

      // Additional retry mechanism for WebM files
      let retryCount = 0;
      const maxRetries = 10;
      const retryInterval = setInterval(() => {
        if (video.duration && video.duration > 0) {
          updateVideoDuration();
          clearInterval(retryInterval);
        } else if (retryCount >= maxRetries) {
          clearInterval(retryInterval);
        } else {
          retryCount++;
          updateVideoDuration();
        }
      }, 200);

      video.addEventListener("canplay", () => {
        updateVideoDuration();
      });

      // Fallback updates
      setTimeout(() => {
        if (video.readyState >= 1 && video.duration > 0) {
          updateVideoDuration();
        }
      }, 100);

      setTimeout(() => {
        if (video.readyState >= 1 && video.duration > 0) {
          updateVideoDuration();
        } else if (video.readyState >= 1 && !video.duration) {
          video.currentTime = 0.1;
          setTimeout(() => {
            if (video.duration > 0) {
              updateVideoDuration();
            }
          }, 50);
        }
      }, 500);

      // Update time and progress during playback
      const handleTimeUpdate = () => {
        const current = formatTime(video.currentTime);
        const duration = video.duration || 0;
        const durationStr = isFinite(duration) ? formatTime(duration) : "0:00";
        const progress = (video.currentTime / (duration || 1)) * 100;

        if (timeDisplay) timeDisplay.textContent = `${current} / ${durationStr}`;
        if (progressFill) (progressFill as HTMLElement).style.width = `${progress}%`;
        if (progressThumb) (progressThumb as HTMLElement).style.left = `${progress}%`;

        // Frame info (approximate)
        if (frameInfo && isFinite(duration)) {
          const currentFrame = Math.floor(video.currentTime * 30); // Assume 30fps
          const totalFrames = Math.floor(duration * 30);
          frameInfo.textContent = `${currentFrame} / ${totalFrames}`;
        }
      };

      video.addEventListener("timeupdate", handleTimeUpdate);

      // Hide overlay when playing, show when paused
      const handlePlay = () => {
        if (playOverlay) playOverlay.classList.add("hidden");
      };

      const handlePause = () => {
        if (playOverlay) playOverlay.classList.remove("hidden");
      };

      const handleEnded = () => {
        if (playOverlay) playOverlay.classList.remove("hidden");
      };

      video.addEventListener("play", handlePlay);
      video.addEventListener("pause", handlePause);
      video.addEventListener("ended", handleEnded);

      // Progress bar scrubbing
      const handleProgressClick = (e: MouseEvent) => {
        if (!progressBar) return;
        const rect = progressBar.getBoundingClientRect();
        const pos = (e.clientX - rect.left) / rect.width;
        video.currentTime = pos * video.duration;
      };

      if (progressBar) {
        progressBar.addEventListener("click", handleProgressClick);
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
        centerPlayBtn.addEventListener("click", togglePlay);
      }
      video.addEventListener("click", togglePlay);

      // Volume control
      if (volumeSlider) {
        volumeSlider.addEventListener("input", (e) => {
          video.volume = (e.target as HTMLInputElement).valueAsNumber / 100;
        });
      }

      // Volume button
      if (volumeBtn) {
        volumeBtn.addEventListener("click", () => {
          video.muted = !video.muted;
          if (video.muted) {
            volumeBtn.innerHTML =
              '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="11,5 6,9 2,9 2,15 6,15 11,19 11,5"/><line x1="23" y1="9" x2="17" y2="15" stroke="currentColor" stroke-width="2"/><line x1="17" y1="9" x2="23" y2="15" stroke="currentColor" stroke-width="2"/></svg>';
          } else {
            volumeBtn.innerHTML =
              '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="11,5 6,9 2,9 2,15 6,15 11,19 11,5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>';
          }
        });
      }

      playerInitialized.current = true;

      // Store cleanup function
      cleanupRef.current = () => {
        clearInterval(retryInterval);
        video.removeEventListener("loadedmetadata", updateVideoDuration);
        video.removeEventListener("durationchange", updateVideoDuration);
        video.removeEventListener("canplay", updateVideoDuration);
        video.removeEventListener("timeupdate", handleTimeUpdate);
        video.removeEventListener("play", handlePlay);
        video.removeEventListener("pause", handlePause);
        video.removeEventListener("ended", handleEnded);
        video.removeEventListener("click", togglePlay);
        if (progressBar) {
          progressBar.removeEventListener("click", handleProgressClick);
        }
        if (volumeSlider) {
          volumeSlider.removeEventListener("input", () => {});
        }
        if (volumeBtn) {
          volumeBtn.removeEventListener("click", () => {});
        }
        if (centerPlayBtn) {
          centerPlayBtn.removeEventListener("click", togglePlay);
        }
      };
    };
    
    // Start initialization attempt
    setTimeout(() => {
      requestAnimationFrame(() => {
        tryInit();
      });
    }, 0);

    // Cleanup
    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
      playerInitialized.current = false;
    };
  }, [videoSrc]);
};
