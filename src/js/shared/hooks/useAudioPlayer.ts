import { useEffect, useRef } from "react";
import { formatTime } from "../utils/formatTime";
import { useCore } from "./useCore";
import { getApiUrl } from "../utils/serverConfig";
import { loaderHTML } from "../utils/loader";
import { debugLog, debugError, debugWarn } from "../utils/debugLog";

interface WaveformBar {
  x: number;
  height: number;
  centerY: number;
}

function buildPlaceholderBars(displayWidth: number, displayHeight: number): WaveformBar[] {
  const barSpacing = 2;
  const barCount = Math.max(1, Math.floor(displayWidth / barSpacing));
  const centerY = displayHeight / 2;
  const bars: WaveformBar[] = [];
  // Smooth random peaks to mimic a waveform
  let current = 0.2;
  for (let i = 0; i < barCount; i++) {
    const target = 0.1 + Math.random() * 0.9;
    current = current * 0.85 + target * 0.15;
    const peak = Math.min(1, Math.max(0.05, current * (0.6 + 0.4 * Math.sin(i * 0.05))));
    const barHeight = Math.max(2, peak * (displayHeight * 0.9));
    bars.push({ x: i * barSpacing, height: barHeight, centerY });
  }
  return bars;
}

function buildBarsFromBuffer(
  buffer: AudioBuffer,
  canvas: HTMLCanvasElement,
  displayWidth: number,
  displayHeight: number
): WaveformBar[] {
  const channels = Math.min(2, buffer.numberOfChannels || 1);
  let left: Float32Array;
  let right: Float32Array | null = null;
  try {
    left = buffer.getChannelData(0);
  } catch (_) {
    left = new Float32Array(0);
  }
  try {
    right = channels > 1 ? buffer.getChannelData(1) : null;
  } catch (_) {
    right = null;
  }
  if (!left || left.length === 0) {
    return [];
  }
  const barSpacing = 2; // 1px bar with 1px gap
  const barCount = Math.max(1, Math.floor(displayWidth / barSpacing));
  const samplesPerBar = Math.max(1, Math.floor(buffer.length / barCount));
  const sampleStride = Math.max(1, Math.floor(samplesPerBar / 64));
  const centerY = displayHeight / 2;
  // First pass: RMS energy per bar
  const energies = new Array(barCount).fill(0);
  let globalMax = 0;
  for (let i = 0; i < barCount; i++) {
    const start = i * samplesPerBar;
    const end = Math.min(buffer.length, start + samplesPerBar);
    let sumSquares = 0;
    let n = 0;
    for (let s = start; s < end; s += sampleStride) {
      const l = left[s] || 0;
      const r = right ? (right[s] || 0) : 0;
      const mono = right ? (l + r) * 0.5 : l;
      sumSquares += mono * mono;
      n++;
    }
    const rms = Math.sqrt(sumSquares / Math.max(1, n));
    energies[i] = rms;
    if (rms > globalMax) globalMax = rms;
  }
  // Avoid division by tiny values
  const norm = globalMax > 1e-6 ? 1 / globalMax : 1;
  const bars: WaveformBar[] = [];
  for (let i = 0; i < barCount; i++) {
    const normalized = Math.min(1, Math.max(0, energies[i] * norm));
    const barHeight = Math.max(2, normalized * (displayHeight * 0.92));
    bars.push({ x: i * barSpacing, height: barHeight, centerY });
  }
  return bars;
}

function renderWaveform(
  canvas: HTMLCanvasElement,
  bars: WaveformBar[],
  progress: number,
  displayWidthOverride?: number,
  displayHeightOverride?: number
) {
  if (!canvas) {
    debugError("[Waveform] Canvas is null or undefined");
    return;
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    debugError("[Waveform] Could not get canvas context");
    return;
  }

  const displayWidth = displayWidthOverride || canvas.clientWidth || canvas.offsetWidth || 600;
  const displayHeight = displayHeightOverride || canvas.clientHeight || canvas.offsetHeight || 40;

  if (displayWidth <= 0 || displayHeight <= 0) {
    debugError("[Waveform] Invalid canvas dimensions", { displayWidth, displayHeight });
    return;
  }

  // Clear canvas
  ctx.clearRect(0, 0, displayWidth, displayHeight);

  const progressX = progress * displayWidth;

  if (!Array.isArray(bars)) {
    debugError("[Waveform] Bars is not an array", { bars });
    return;
  }

  bars.forEach((bar) => {
    // Color based on progress: orange for played, grey for unplayed
    ctx.fillStyle = bar.x <= progressX ? "#ff7700" : "#a1a1aa";

    // Draw rounded rect for each bar
    const barWidth = 1;
    const barHeight = bar.height;
    const x = bar.x;
    const y = bar.centerY - barHeight / 2;
    const radius = 2;

    ctx.beginPath();
    if ((ctx as any).roundRect) {
      (ctx as any).roundRect(x, y, barWidth, barHeight, radius);
    } else {
      // Fallback for browsers without roundRect support
      ctx.rect(x, y, barWidth, barHeight);
    }
    ctx.fill();
  });
}

function updateWaveformProgress(
  canvas: HTMLCanvasElement,
  bars: WaveformBar[],
  progress: number,
  w: number,
  h: number
) {
  renderWaveform(canvas, bars, progress, w, h);
}

export const useAudioPlayer = (audioSrc: string | null) => {
  const { authHeaders, ensureAuthToken } = useCore();
  const playerInitialized = useRef(false);
  const waveformBarsRef = useRef<WaveformBar[]>([]);
  const animationFrameIdRef = useRef<number | null>(null);
  const audioFinishedRef = useRef(false);

  useEffect(() => {
    if (!audioSrc) {
      playerInitialized.current = false;
      return;
    }

    const audio = document.getElementById("audioPlayer") as HTMLAudioElement;
    const playBtn = document.getElementById("audioPlayBtn");
    const timeDisplay = document.getElementById("audioTime");
    const canvas = document.getElementById("waveformCanvas") as HTMLCanvasElement;

    if (!audio || !canvas) return;

    // Reset initialization flag
    if (playerInitialized.current) {
      playerInitialized.current = false;
    }

    // Store the audio buffer for rebuilding waveform on resize
    let audioBufferRef: AudioBuffer | null = null;
    
    // Build static waveform once from decoded PCM
    // This function will be called when canvas is resized
    const buildWaveformForSize = async (displayWidth: number, displayHeight: number) => {
      try {
        const dpr = Math.max(1, window.devicePixelRatio || 1);
        canvas.width = Math.max(1, Math.floor(displayWidth * dpr));
        canvas.height = Math.max(1, Math.floor(displayHeight * dpr));
        const ctx2 = canvas.getContext("2d");
        if (ctx2 && dpr !== 1) ctx2.scale(dpr, dpr);

        // If we already have the audio buffer, rebuild bars with new dimensions
        if (audioBufferRef) {
          waveformBarsRef.current = buildBarsFromBuffer(audioBufferRef, canvas, displayWidth, displayHeight);
          debugLog("[Waveform] Rebuilt", { bars: waveformBarsRef.current.length, size: `${displayWidth}x${displayHeight}` });
          renderWaveform(canvas, waveformBarsRef.current, 0, displayWidth, displayHeight);
          return;
        }

        function normalizePath(p: string | null): string {
          try {
            if (!p) return "";
            p = String(p).replace(/^file:\/\//, "");
            try {
              p = decodeURI(p);
            } catch (_) {
              p = p.replace(/%20/g, " ");
            }
            if (p && p[0] !== "/" && p.indexOf("Volumes/") === 0) p = "/" + p;
            return p;
          } catch (_) {
            return String(p || "");
          }
        }
        let localPath = normalizePath((window as any).selectedAudio || "");
        if (!localPath) {
          try {
            const u = normalizePath(audio.getAttribute("src") || "");
            localPath = u;
          } catch (_) {}
        }
        debugLog("[Waveform] Audio info", { selectedAudio: (window as any).selectedAudio, src: audio.getAttribute("src"), localPath });
        if (!localPath) {
          debugWarn("[Waveform] No path found, using placeholder");
          waveformBarsRef.current = buildPlaceholderBars(displayWidth, displayHeight);
          renderWaveform(canvas, waveformBarsRef.current, 0, displayWidth, displayHeight);
          return;
        }
        // This endpoint is now public to avoid blank waveform when token fails
        await ensureAuthToken();
        const waveformUrl = `${getApiUrl("/waveform/file")}?${new URLSearchParams({ path: localPath })}`;
        debugLog("[Waveform] Fetching from", { waveformUrl });
        const resp = await fetch(waveformUrl, {
          headers: authHeaders(),
          cache: "no-store",
        }).catch((e) => {
          debugError("[Waveform] Fetch exception", e);
          return null;
        });
        if (!resp || !resp.ok) {
          // Fallback: draw placeholder waveform so UI isn't blank
          debugError("[Waveform] Fetch failed", { status: resp ? resp.status : "no response" });
          waveformBarsRef.current = buildPlaceholderBars(displayWidth, displayHeight);
          renderWaveform(canvas, waveformBarsRef.current, 0, displayWidth, displayHeight);
          return;
        }
        debugLog("[Waveform] Fetch successful, decoding");
        const ab = await resp.arrayBuffer();
        debugLog("[Waveform] ArrayBuffer size", { size: ab ? ab.byteLength : 0 });
        const ac = new (window.AudioContext || (window as any).webkitAudioContext)();
        let buf: AudioBuffer | null = null;
        try {
          buf = await ac.decodeAudioData(ab);
        } catch (_) {
          try {
            // Safari-style decode fallback
            buf = await new Promise<AudioBuffer>((resolve, reject) => {
              ac.decodeAudioData(ab.slice(0), resolve, reject);
            });
          } catch (e) {
            buf = null;
          }
        }
        if (!buf) {
          debugError("[Waveform] Decode failed");
          waveformBarsRef.current = buildPlaceholderBars(displayWidth, displayHeight);
          renderWaveform(canvas, waveformBarsRef.current, 0, displayWidth, displayHeight);
          try {
            ac.close();
          } catch (_) {}
          return;
        }
        // Store the buffer for future resizes
        audioBufferRef = buf;
        debugLog("[Waveform] Decoded successfully", { sampleRate: buf.sampleRate, length: buf.length });
        waveformBarsRef.current = buildBarsFromBuffer(buf, canvas, displayWidth, displayHeight);
        debugLog("[Waveform] Generated", { bars: waveformBarsRef.current.length });
        renderWaveform(canvas, waveformBarsRef.current, 0, displayWidth, displayHeight);
        try {
          ac.close();
        } catch (_) {}
      } catch (err) {
        debugError("[Waveform] Exception", err);
        waveformBarsRef.current = buildPlaceholderBars(displayWidth, displayHeight);
        renderWaveform(canvas, waveformBarsRef.current, 0, displayWidth, displayHeight);
      }
    };
    
    // Initial waveform build
    (async function buildWaveform() {
      try {
        // Ensure layout is ready so canvas has non-zero size (retry a few frames)
        let tries = 0;
        while (tries < 8) {
          await new Promise((r) => requestAnimationFrame(() => r()));
          const rw = canvas.clientWidth || canvas.offsetWidth || 0;
          const rh = canvas.clientHeight || canvas.offsetHeight || 0;
          if (rw > 0 && rh > 0) break;
          tries++;
        }
        let displayWidth = canvas.clientWidth || canvas.offsetWidth || 0;
        let displayHeight = canvas.clientHeight || canvas.offsetHeight || 0;
        if (!displayWidth || !displayHeight) {
          displayWidth = 600;
          displayHeight = 80;
        }
        
        await buildWaveformForSize(displayWidth, displayHeight);
      } catch (err) {
        debugError("[Waveform] Build exception", err);
        const w = canvas.clientWidth || 600;
        const h = canvas.clientHeight || 80;
        waveformBarsRef.current = buildPlaceholderBars(w, h);
        renderWaveform(canvas, waveformBarsRef.current, 0, w, h);
      }
    })();
    
    // Resize observer to rebuild waveform when canvas size changes
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          // Rebuild waveform with new dimensions (bars will maintain width, more will be added)
          buildWaveformForSize(width, height);
        }
      }
    });
    
    resizeObserver.observe(canvas);

    // Initialize time display when metadata loads
    const updateAudioDuration = () => {
      const duration = audio.duration || 0;
      const durationStr = isFinite(duration) && duration > 0 ? formatTime(duration) : "--";
      if (timeDisplay)
        timeDisplay.innerHTML = `<span class="time-current">0:00</span> <span class="time-total">/ ${durationStr}</span>`;
    };

    // Check if metadata is already loaded
    if (audio.readyState >= 1) {
      updateAudioDuration();
    } else {
      audio.addEventListener("loadedmetadata", updateAudioDuration);
    }

    // Listen for duration changes
    audio.addEventListener("durationchange", () => {
      updateAudioDuration();
    });

    // Listen for canplay event (when enough data is loaded)
    audio.addEventListener("canplay", () => {
      updateAudioDuration();
    });

    // Additional retry mechanism for WebM files and file:// URLs
    let audioRetryCount = 0;
    const audioMaxRetries = 20; // Increased retries for file:// URLs
    const audioRetryInterval = setInterval(() => {
      if (audio.duration && audio.duration > 0) {
        updateAudioDuration();
        clearInterval(audioRetryInterval);
      } else if (audioRetryCount >= audioMaxRetries) {
        clearInterval(audioRetryInterval);
        // Try to force load by seeking to a small time
        if (audio.readyState >= 1 && !audio.duration) {
          const savedTime = audio.currentTime;
          audio.currentTime = 0.1;
          setTimeout(() => {
            if (audio.duration > 0) {
              updateAudioDuration();
            }
            audio.currentTime = savedTime;
          }, 100);
        }
      } else {
        audioRetryCount++;
        updateAudioDuration();
        // Try to trigger metadata load by setting currentTime
        if (audioRetryCount === 5 && audio.readyState >= 1 && !audio.duration) {
          const savedTime = audio.currentTime;
          audio.currentTime = 0.01;
          setTimeout(() => {
            audio.currentTime = savedTime;
          }, 50);
        }
      }
    }, 200);
    
    // Fallback: try to load duration after a delay
    setTimeout(() => {
      if (!audio.duration || audio.duration === 0) {
        // Try seeking to trigger duration load
        const savedTime = audio.currentTime;
        audio.currentTime = 0.01;
        setTimeout(() => {
          if (audio.duration > 0) {
            updateAudioDuration();
          }
          audio.currentTime = savedTime;
        }, 100);
      }
    }, 500);

    // Smooth waveform update using requestAnimationFrame for real-time syncing
    const updateWaveform = () => {
      if (audioFinishedRef.current || audio.ended || audio.paused) {
        animationFrameIdRef.current = null;
        return;
      }

      const duration = audio.duration || 0;
      const currentTime = audio.currentTime || 0;

      // Check if we've reached the end
      if (duration > 0 && currentTime >= duration - 0.1) {
        audioFinishedRef.current = true;
        animationFrameIdRef.current = null;
        // Reset button to play state
        if (playBtn) {
          playBtn.innerHTML = '<i data-lucide="play" style="width: 18px; height: 18px;"></i>';
          if ((window as any).lucide && (window as any).lucide.createIcons) {
            (window as any).lucide.createIcons();
          }
        }
        // Final update to show completed progress
        const durationStr = isFinite(duration) ? formatTime(duration) : "0:00";
        if (timeDisplay)
          timeDisplay.innerHTML = `<span class="time-current">${durationStr}</span> <span class="time-total">/ ${durationStr}</span>`;
        const w = canvas.clientWidth || canvas.offsetWidth || 600;
        const h = canvas.clientHeight || canvas.offsetHeight || 80;
        if (waveformBarsRef.current && waveformBarsRef.current.length) {
          updateWaveformProgress(canvas, waveformBarsRef.current, 1, w, h);
        }
        return;
      }

      // Update waveform progress smoothly
      const w = canvas.clientWidth || canvas.offsetWidth || 600;
      const h = canvas.clientHeight || canvas.offsetHeight || 80;
      if (waveformBarsRef.current && waveformBarsRef.current.length) {
        const progress = Math.min(1, currentTime / (duration || 1));
        updateWaveformProgress(canvas, waveformBarsRef.current, progress, w, h);
      }

      // Continue animation loop
      animationFrameIdRef.current = requestAnimationFrame(updateWaveform);
    };

    // Update time display
    const handleTimeUpdate = () => {
      if (audioFinishedRef.current || audio.ended) {
        return;
      }
      const current = formatTime(audio.currentTime);
      const duration = audio.duration || 0;
      const durationStr = isFinite(duration) ? formatTime(duration) : "0:00";
      if (timeDisplay)
        timeDisplay.innerHTML = `<span class="time-current">${current}</span> <span class="time-total">/ ${durationStr}</span>`;
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);

    // Handle audio ending
    const handleEnded = () => {
      audioFinishedRef.current = true;
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
      }
      // Reset button to play state
      if (playBtn) {
        playBtn.innerHTML = '<i data-lucide="play" style="width: 18px; height: 18px;"></i>';
        if ((window as any).lucide && (window as any).lucide.createIcons) {
          (window as any).lucide.createIcons();
        }
      }
      // Final update to show completed progress
      const duration = audio.duration || 0;
      const durationStr = isFinite(duration) ? formatTime(duration) : "0:00";
      if (timeDisplay)
        timeDisplay.innerHTML = `<span class="time-current">${durationStr}</span> <span class="time-total">/ ${durationStr}</span>`;
      const w = canvas.clientWidth || canvas.offsetWidth || 600;
      const h = canvas.clientHeight || canvas.offsetHeight || 80;
      if (waveformBarsRef.current && waveformBarsRef.current.length && duration > 0) {
        updateWaveformProgress(canvas, waveformBarsRef.current, 1, w, h);
      }
    };

    audio.addEventListener("ended", handleEnded);

    // Reset finished flag and start animation loop when play starts
    const handlePlay = () => {
      audioFinishedRef.current = false;
      if (!animationFrameIdRef.current && !audio.paused) {
        animationFrameIdRef.current = requestAnimationFrame(updateWaveform);
      }
    };

    audio.addEventListener("play", handlePlay);

    // Stop animation loop when paused
    const handlePause = () => {
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
      }
    };

    audio.addEventListener("pause", handlePause);

    // Play/pause functionality
    const toggleAudioPlay = () => {
      if (audio.paused) {
        audio.play();
        if (playBtn) {
          playBtn.innerHTML = '<i data-lucide="pause" style="width: 18px; height: 18px;"></i>';
          if ((window as any).lucide && (window as any).lucide.createIcons) {
            (window as any).lucide.createIcons();
          }
        }
      } else {
        audio.pause();
        if (playBtn) {
          playBtn.innerHTML = '<i data-lucide="play" style="width: 18px; height: 18px;"></i>';
          if ((window as any).lucide && (window as any).lucide.createIcons) {
            (window as any).lucide.createIcons();
          }
        }
      }
    };

    // Play/pause button
    if (playBtn) {
      playBtn.addEventListener("click", toggleAudioPlay);
    }

    // Click to seek on waveform
    const handleCanvasClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const pos = (e.clientX - rect.left) / rect.width;
      audio.currentTime = pos * audio.duration;
    };

    canvas.addEventListener("click", handleCanvasClick);

    // Dubbing dropdown functionality
    const dubbingBtn = document.getElementById("dubbingBtn");
    const dubbingDropdown = document.getElementById("dubbingDropdown");
    const dubbingSearch = document.getElementById("dubbingSearch") as HTMLInputElement;

    // Declare handlers outside if block for cleanup
    let handleDubbingBtnClick: ((e: MouseEvent) => void) | null = null;
    let handleOutsideClick: ((e: MouseEvent) => void) | null = null;
    let handleSearchInput: ((e: Event) => void) | null = null;
    let handleSearchClick: ((e: MouseEvent) => void) | null = null;
    let handleSubmitClick: ((e: MouseEvent) => void) | null = null;

    if (dubbingBtn && dubbingDropdown) {
      // Filter languages based on search term
      const filterLanguages = (searchTerm: string) => {
        const options = dubbingDropdown.querySelectorAll(".dubbing-option");
        options.forEach((option) => {
          const langName = option.textContent?.toLowerCase() || "";
          if (langName.includes(searchTerm)) {
            (option as HTMLElement).style.display = "flex";
          } else {
            (option as HTMLElement).style.display = "none";
          }
        });
      };

      // Toggle dropdown
      handleDubbingBtnClick = (e: MouseEvent) => {
        e.stopPropagation();
        const isVisible = dubbingDropdown.style.display === "block";
        dubbingDropdown.style.display = isVisible ? "none" : "block";

        // Focus search input when opening
        if (dubbingDropdown.style.display === "block" && dubbingSearch) {
          setTimeout(() => dubbingSearch.focus(), 50);
        }
      };

      dubbingBtn.addEventListener("click", handleDubbingBtnClick);

      // Close dropdown when clicking outside
      handleOutsideClick = (e: MouseEvent) => {
        const target = e.target as Node;
        if (
          dubbingBtn &&
          !dubbingBtn.contains(target) &&
          dubbingDropdown &&
          !dubbingDropdown.contains(target)
        ) {
          dubbingDropdown.style.display = "none";
          // Clear search on close
          if (dubbingSearch) {
            dubbingSearch.value = "";
            filterLanguages("");
          }
        }
      };

      document.addEventListener("click", handleOutsideClick);

      // Search functionality
      if (dubbingSearch) {
        handleSearchInput = (e: Event) => {
          const searchTerm = (e.target as HTMLInputElement).value.toLowerCase();
          filterLanguages(searchTerm);
        };

        handleSearchClick = (e: MouseEvent) => {
          e.stopPropagation();
        };

        dubbingSearch.addEventListener("input", handleSearchInput);
        dubbingSearch.addEventListener("click", handleSearchClick);
      }

      // Handle language selection
      const options = dubbingDropdown.querySelectorAll(".dubbing-option");
      options.forEach((option) => {
        const handleOptionClick = (e: MouseEvent) => {
          const lang = option.getAttribute("data-lang");
          const langName = option.textContent || "";

          // Remove active class from all options
          options.forEach((opt) => opt.classList.remove("active"));
          // Add active class to selected option
          option.classList.add("active");

          // Close dropdown
          dubbingDropdown.style.display = "none";

          // Clear search
          if (dubbingSearch) {
            dubbingSearch.value = "";
            filterLanguages("");
          }

          // Update button text and show submit button
          const dubbingBtnText = document.getElementById("dubbingBtnText");
          const dubbingSubmitBtn = document.getElementById("dubbingSubmitBtn");

          if (dubbingBtnText) {
            dubbingBtnText.textContent = langName.toLowerCase();
          }

          if (dubbingSubmitBtn) {
            dubbingSubmitBtn.style.display = "flex";
            dubbingSubmitBtn.setAttribute("data-target-lang", lang || "");
            dubbingSubmitBtn.setAttribute("data-lang-name", langName);
          }

          debugLog("Selected language", { lang, langName });
        };

        option.addEventListener("click", handleOptionClick);
      });

      // Custom scrollbar functionality
      const optionsContainer = dubbingDropdown.querySelector(".dubbing-dropdown-options");
      const scrollbar = dubbingDropdown.querySelector(".dubbing-dropdown-scrollbar");

      if (optionsContainer && scrollbar) {
        const updateScrollbar = () => {
          const scrollTop = optionsContainer.scrollTop;
          const scrollHeight = optionsContainer.scrollHeight;
          const clientHeight = optionsContainer.clientHeight;
          const maxScroll = scrollHeight - clientHeight;

          if (maxScroll > 0) {
            const scrollbarHeight = Math.max(18, (clientHeight / scrollHeight) * clientHeight);
            const scrollbarTop = (scrollTop / maxScroll) * (clientHeight - scrollbarHeight);

            (scrollbar as HTMLElement).style.height = `${scrollbarHeight}px`;
            (scrollbar as HTMLElement).style.top = `${36 + scrollbarTop}px`;
            (scrollbar as HTMLElement).style.display = "block";
          } else {
            (scrollbar as HTMLElement).style.display = "none";
          }
        };

        optionsContainer.addEventListener("scroll", updateScrollbar);
        updateScrollbar(); // Initial update
      }

      // Handle submit button click
      const dubbingSubmitBtn = document.getElementById("dubbingSubmitBtn");
      if (dubbingSubmitBtn) {
        handleSubmitClick = async (e: MouseEvent) => {
          e.stopPropagation();

          const targetLang = dubbingSubmitBtn.getAttribute("data-target-lang");
          const langName = dubbingSubmitBtn.getAttribute("data-lang-name");

          if (!targetLang) {
            if ((window as any).showToast) {
              (window as any).showToast("please select a target language first", "error");
            }
            return;
          }

          // Get ElevenLabs API key from settings
          const settings = JSON.parse(localStorage.getItem("syncSettings") || "{}");
          const elevenLabsApiKey = settings.elevenlabsApiKey || settings.elevenLabsApiKey;

          if (!elevenLabsApiKey) {
            if ((window as any).showToast) {
              (window as any).showToast("elevenlabs api key required", "error");
            }
            return;
          }

          // Show loading state
          dubbingSubmitBtn.setAttribute("disabled", "true");
          dubbingSubmitBtn.innerHTML = loaderHTML({ size: "sm", color: "white" });

          // Disable lipsync button during dubbing
          const lipsyncBtn = document.getElementById("lipsyncBtn");
          if (lipsyncBtn) {
            (lipsyncBtn as HTMLButtonElement).disabled = true;
            const span = lipsyncBtn.querySelector("span");
            if (span) span.textContent = "dubbing...";
          }

          // Show loading state in audio preview
          const audioPreview = document.getElementById("audioPreview");
          const audioSection = document.getElementById("audioSection");
          if (audioPreview) {
            audioPreview.classList.add("loading-audio");
            // Also add to audio section to prevent border
            if (audioSection) {
              audioSection.classList.add("loading-audio");
            }
            const loadingOverlay = document.createElement("div");
            loadingOverlay.className = "audio-loading-overlay";
            loadingOverlay.innerHTML = `
              <div class="audio-loading-spinner">
                ${loaderHTML({ size: "sm", color: "white" })}
              </div>
              <div class="audio-loading-text">dubbing to ${langName?.toLowerCase()}...</div>
            `;
            audioPreview.appendChild(loadingOverlay);
          }

          if ((window as any).showToast) {
            (window as any).showToast(`dubbing to ${langName?.toLowerCase()}...`, "info");
          }

          try {
            await ensureAuthToken();

            // Get audio path - prefer selectedAudio, fall back to audioUrl or audio src
            let selectedAudio = (window as any).selectedAudio;
            let selectedAudioUrl = (window as any).selectedAudioUrl;
            
            // If no local path, try to get from audio element
            if (!selectedAudio) {
              try {
                const audioEl = document.getElementById("audioPlayer") as HTMLAudioElement;
                if (audioEl && audioEl.src) {
                  const src = audioEl.src;
                  // Check if it's a file:// URL
                  if (src.startsWith("file://")) {
                    selectedAudio = src.replace(/^file:\/\//, "").replace(/%20/g, " ");
                  } else if (src.startsWith("http://") || src.startsWith("https://")) {
                    selectedAudioUrl = src;
                  }
                }
              } catch (_) {
                // Silently fail
              }
            }
            
            // Normalize the path
            function normalizePath(p: string | null | undefined): string {
              if (!p) return "";
              try {
                let path = String(p).replace(/^file:\/\//, "");
                try {
                  path = decodeURIComponent(path);
                } catch (_) {
                  path = path.replace(/%20/g, " ");
                }
                return path;
              } catch (_) {
                return String(p || "");
              }
            }
            
            const normalizedPath = normalizePath(selectedAudio);
            
            if (!normalizedPath && !selectedAudioUrl) {
              if ((window as any).showToast) {
                (window as any).showToast("no audio file selected", "error");
              }
              return;
            }

            const body = {
              audioPath: normalizedPath || undefined,
              audioUrl: selectedAudioUrl || undefined,
              targetLang: targetLang,
              elevenApiKey: elevenLabsApiKey,
            };

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minute timeout

            const response = await fetch(getApiUrl("/dubbing"), {
              method: "POST",
              headers: authHeaders({ "Content-Type": "application/json" }),
              body: JSON.stringify(body),
              signal: controller.signal,
            });

            clearTimeout(timeoutId);

            const result = await response.json().catch(() => null);

            if (!response.ok || !result || !result.ok) {
              throw new Error(result?.error || "Dubbing failed");
            }

            // Update the audio source to the dubbed version
            if (result.audioPath) {
              (window as any).selectedAudio = result.audioPath;
              (window as any).selectedAudioIsTemp = true;
              (window as any).selectedAudioUrl = "";
              (window as any).selectedAudioIsUrl = false;

              // Upload dubbed audio to R2 for lipsync
              try {
                debugLog("[Dubbing] Starting R2 upload for dubbed audio", { audioPath: result.audioPath });
                const uploadBody = { path: result.audioPath, apiKey: settings.syncApiKey || "" };
                const uploadResponse = await fetch(getApiUrl("/upload"), {
                  method: "POST",
                  headers: authHeaders({ "Content-Type": "application/json" }),
                  body: JSON.stringify(uploadBody),
                });

                const uploadResult = await uploadResponse.json().catch(() => null);
                debugLog("[Dubbing] R2 upload response", { ok: uploadResponse.ok, result: uploadResult });

                if (uploadResponse.ok && uploadResult && uploadResult.ok && uploadResult.url) {
                  (window as any).uploadedAudioUrl = uploadResult.url;
                  localStorage.setItem("uploadedAudioUrl", uploadResult.url);
                  debugLog("[Dubbing] Uploaded dubbed audio to R2", { url: uploadResult.url });
                } else {
                  debugWarn("[Dubbing] R2 upload failed", { status: uploadResponse.status, result: uploadResult });
                }
              } catch (uploadError) {
                debugWarn("[Dubbing] Upload of dubbed audio failed", uploadError);
              }

              // Re-render the audio preview with the new dubbed audio
              if ((window as any).renderInputPreview) {
                (window as any).renderInputPreview("dubbing");
              }

              if ((window as any).showToast) {
                (window as any).showToast(`dubbing to ${langName?.toLowerCase()} completed`);
              }
            }
          } catch (error: any) {
            debugError("Dubbing error", error);
            if ((window as any).showToast) {
              (window as any).showToast(`dubbing failed: ${error.message}`, "error");
            }
          } finally {
            // Remove loading state from audio preview
            const audioPreview = document.getElementById("audioPreview");
            const audioSection = document.getElementById("audioSection");
            if (audioPreview) {
              audioPreview.classList.remove("loading-audio");
              const loadingOverlay = audioPreview.querySelector(".audio-loading-overlay");
              if (loadingOverlay) {
                loadingOverlay.remove();
              }
            }
            if (audioSection) {
              audioSection.classList.remove("loading-audio");
            }

            // Reset submit button
            dubbingSubmitBtn.removeAttribute("disabled");
            dubbingSubmitBtn.innerHTML = '<i data-lucide="arrow-right" style="width: 18px; height: 18px;"></i>';

            // Re-enable lipsync button
            const lipsyncBtn = document.getElementById("lipsyncBtn");
            if (lipsyncBtn) {
              (lipsyncBtn as HTMLButtonElement).disabled = false;
              const span = lipsyncBtn.querySelector("span");
              if (span) span.textContent = "lipsync";
            }

            // Re-initialize Lucide icons
            if ((window as any).lucide && (window as any).lucide.createIcons) {
              (window as any).lucide.createIcons();
            }
          }
        };

        dubbingSubmitBtn.addEventListener("click", handleSubmitClick);
      }
    }

    playerInitialized.current = true;

    // Cleanup
    return () => {
      // Cleanup resize observer
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      
      clearInterval(audioRetryInterval);
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
      }
      audio.removeEventListener("loadedmetadata", updateAudioDuration);
      audio.removeEventListener("durationchange", updateAudioDuration);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      if (playBtn) {
        playBtn.removeEventListener("click", toggleAudioPlay);
      }
      canvas.removeEventListener("click", handleCanvasClick);

      // Cleanup dubbing handlers
      if (dubbingBtn && handleDubbingBtnClick) {
        dubbingBtn.removeEventListener("click", handleDubbingBtnClick);
      }
      if (handleOutsideClick) {
        document.removeEventListener("click", handleOutsideClick);
      }
      if (dubbingSearch && handleSearchInput && handleSearchClick) {
        dubbingSearch.removeEventListener("input", handleSearchInput);
        dubbingSearch.removeEventListener("click", handleSearchClick);
      }
      const dubbingSubmitBtn = document.getElementById("dubbingSubmitBtn");
      if (dubbingSubmitBtn && handleSubmitClick) {
        dubbingSubmitBtn.removeEventListener("click", handleSubmitClick);
      }
    };
  }, [audioSrc, authHeaders, ensureAuthToken]);
};

