import React, { useState, useEffect, useRef } from "react";
import { Upload, MousePointerSquareDashed, Webcam, Link, Mic, MousePointerClick, TextSelect, FileVideo2, FileVideo, Clapperboard, FileAudio, AudioLines, Play, Pause, Trash2, Volume2, VolumeX, Search, ArrowRight, Globe, X, DownloadCloud } from "lucide-react";
import { useMedia } from "../hooks/useMedia";
import { useRecording } from "../hooks/useRecording";
import { useNLE } from "../hooks/useNLE";
import { useTabs } from "../hooks/useTabs";
import { useSettings } from "../hooks/useSettings";
import { useCore } from "../hooks/useCore";
import { useDragAndDrop } from "../hooks/useDragAndDrop";
import { getApiUrl } from "../utils/serverConfig";
import TTSVoiceSelector from "./TTSVoiceSelector";
import TTSInterface from "./TTSInterface";
import TTSVoiceCloneModal from "./TTSVoiceCloneModal";
import { useVideoPlayer } from "../hooks/useVideoPlayer";
import { useAudioPlayer } from "../hooks/useAudioPlayer";
import { debugLog, debugError } from "../utils/debugLog";

const SourcesTab: React.FC = () => {
  const { selection, selectVideo, selectAudio, clearVideo, clearAudio, setVideoPath, setAudioPath } = useMedia();
  const { isRecording, recordingType, startRecording, stopRecording } = useRecording();
  const { nle } = useNLE();
  const { activeTab, setActiveTab } = useTabs();
  const { settings } = useSettings();
  const { serverState } = useCore();
  const [urlInputMode, setUrlInputMode] = useState<"video" | "audio" | null>(null);
  const [videoUrlValue, setVideoUrlValue] = useState("");
  const [audioUrlValue, setAudioUrlValue] = useState("");
  const [ttsInterfaceOpen, setTtsInterfaceOpen] = useState(false);
  const [ttsVoiceSelectorOpen, setTtsVoiceSelectorOpen] = useState(false);
  const [ttsVoiceCloneModalOpen, setTtsVoiceCloneModalOpen] = useState(false);
  const isOffline = serverState?.isOffline || false;

  // Initialize drag and drop
  useDragAndDrop({
    onVideoSelected: setVideoPath,
    onAudioSelected: setAudioPath,
  });

  // Initialize video player
  const videoSrc = (selection.video || selection.videoUrl) 
    ? (selection.videoIsUrl && selection.videoUrl ? selection.videoUrl : (selection.video ? selection.video : null))
    : null;
  useVideoPlayer(videoSrc);

  // Initialize audio player
  const audioSrc = (selection.audio || selection.audioUrl)
    ? (selection.audioIsUrl && selection.audioUrl ? selection.audioUrl : (selection.audio ? selection.audio : null))
    : null;
  useAudioPlayer(audioSrc);

  // Expose functions on window for backward compatibility with original code
  useEffect(() => {
    // Expose setVideoPath and setAudioPath for useRecording
    (window as any).setVideoPath = setVideoPath;
    (window as any).setAudioPath = setAudioPath;
    
    // Update lipsync button function
    (window as any).updateLipsyncButton = () => {
      const btn = document.getElementById("lipsyncBtn");
      if (!btn) return;
      
      // Check if video is ready (URL or local file with R2 URL)
      const hasVideoReady = (selection.videoIsUrl && selection.videoUrl) || 
        (selection.video && !selection.videoIsUrl && ((window as any).uploadedVideoUrl || localStorage.getItem("uploadedVideoUrl")));
      
      // Check if audio is ready (URL or local file with R2 URL)
      const hasAudioReady = (selection.audioIsUrl && selection.audioUrl) || 
        (selection.audio && !selection.audioIsUrl && ((window as any).uploadedAudioUrl || localStorage.getItem("uploadedAudioUrl")));
      
      (btn as HTMLButtonElement).disabled = !(hasVideoReady && hasAudioReady);
    };

    // Render input preview function
    (window as any).renderInputPreview = (source?: string) => {
      // In React, the preview is rendered conditionally based on selection state
      // This function is kept for backward compatibility but doesn't need to do anything
      // since React handles the rendering automatically
      if (typeof (window as any).debugLog === "function") {
        (window as any).debugLog("renderInputPreview_called", {
          selectedVideo: selection.video,
          selectedVideoUrl: selection.videoUrl,
          selectedAudio: selection.audio,
          selectedAudioUrl: selection.audioUrl,
          source: source || "unknown",
        });
      }
    };

    // Update input status function
    (window as any).updateInputStatus = () => {
      const status = document.getElementById("statusMessage");
      if (status) {
        status.textContent = "";
      }
      // Only show "ready for lipsync" when both video and audio are selected
      if ((selection.video || selection.videoUrl) && (selection.audio || selection.audioUrl)) {
        if (typeof (window as any).showToast === "function") {
          (window as any).showToast("ready for lipsync", "success");
        }
      }
    };

    // Video functions
    (window as any).selectVideo = selectVideo;
    (window as any).selectVideoInOut = async () => {
      if (nle?.exportInOutVideo) {
        // Map settings.renderVideo to codec value
        // For Premiere: mp4 -> h264, prores_422 -> prores_422, prores_422hq -> prores_422hq
        // For After Effects: mp4 -> h264, anything else -> prores (handled in aeft.ts)
        let codec = "h264"; // default
        if (settings.renderVideo === "mp4" || settings.renderVideo === "h264") {
          codec = "h264";
        } else if (settings.renderVideo === "prores_422") {
          codec = "prores_422";
        } else if (settings.renderVideo === "prores_422hq") {
          codec = "prores_422hq";
        }
        
        const result = await nle.exportInOutVideo({ codec });
        if (result?.ok && result?.path) {
          await selectVideo();
        } else if (result?.error) {
          // Show error toast
          if ((window as any).showToast) {
            (window as any).showToast(result.error, "error");
          }
        }
      }
    };
    (window as any).selectVideoUrl = () => {
      setUrlInputMode("video");
      // Use DOM manipulation to match main branch behavior
      setTimeout(() => {
        const videoSection = document.getElementById('videoSection');
        const videoDropzone = document.getElementById('videoDropzone');
        const videoUploadVisual = document.getElementById('videoUploadVisual');
        const videoUploadActions = document.getElementById('videoUploadActions');
        const videoUrlInput = document.getElementById('videoUrlInput');
        
        if (videoSection) videoSection.classList.add('url-input-active');
        if (videoUploadVisual) {
          videoUploadVisual.style.transition = 'opacity 0.2s ease';
          videoUploadVisual.style.opacity = '0';
          setTimeout(() => { videoUploadVisual.style.display = 'none'; }, 200);
        }
        if (videoUploadActions) {
          videoUploadActions.style.transition = 'opacity 0.2s ease';
          videoUploadActions.style.opacity = '0';
          setTimeout(() => { videoUploadActions.style.display = 'none'; }, 200);
        }
        if (videoDropzone) videoDropzone.classList.add('url-input-mode');
        if (videoUrlInput) {
          videoUrlInput.style.display = 'flex';
          setTimeout(() => {
            videoUrlInput.classList.add('show');
            const field = document.getElementById('videoUrlField') as HTMLInputElement;
            if (field) {
              setTimeout(() => field.focus(), 100);
            }
          }, 10);
        }
      }, 0);
    };
    (window as any).startVideoRecording = async () => {
        if ((window as any).debugLog) {
          (window as any).debugLog('video_record_clicked', { isRecording, recordingType });
        }
        if (isRecording && recordingType === "video") {
          stopRecording();
          return;
        }
        
        try {
          const videoSection = document.getElementById('videoSection');
          const videoDropzone = document.getElementById('videoDropzone');
          const videoPreview = document.getElementById('videoPreview');
          
          if (!videoSection || !videoDropzone || !videoPreview) {
            throw new Error('Video elements not found');
          }
          
          // Hide dropzone, show recording UI
          videoDropzone.style.display = 'none';
          videoPreview.style.display = 'flex';
          videoSection.classList.add('recording');
          
          // Create recording UI first
          const preview = document.getElementById('videoPreview');
          if (preview && !preview.querySelector('.recording-container')) {
            preview.innerHTML = `
              <div class="recording-container">
                <video id="videoRecordPreview" class="recording-preview" autoplay muted playsinline></video>
                <button class="recording-close-btn" id="videoBackBtn">
                  <i data-lucide="x"></i>
                </button>
                <div class="recording-device-switcher" id="videoDeviceSwitcher">
                  <select id="videoDeviceSelect" class="device-select">
                  </select>
                </div>
                <button class="recording-stop-btn" id="videoStopBtn">
                  <div class="recording-stop-icon"></div>
                  <span class="recording-timer" id="videoTimer">00:00</span>
                </button>
              </div>
            `;
            
            // Initialize icons
            if ((window as any).lucide && (window as any).lucide.createIcons) {
              (window as any).lucide.createIcons();
            }
            
            // Setup handlers
            const stopBtn = document.getElementById('videoStopBtn');
            if (stopBtn) {
              stopBtn.addEventListener('click', () => {
                stopRecording();
              });
            }
            
            const backBtn = document.getElementById('videoBackBtn');
            if (backBtn) {
              backBtn.addEventListener('click', () => {
                stopRecording();
                // Reset UI
                videoDropzone.style.display = 'flex';
                videoPreview.style.display = 'none';
                videoSection.classList.remove('recording');
                const video = document.getElementById('videoRecordPreview') as HTMLVideoElement;
                if (video) video.srcObject = null;
              });
            }
          }
          
          // Start recording
          await startRecording("video");
          
          // Attach stream to video element after recording starts
          setTimeout(() => {
            const video = document.getElementById('videoRecordPreview') as HTMLVideoElement;
            if (video && (window as any).__recordingStream) {
              video.srcObject = (window as any).__recordingStream;
            }
          }, 300);
        } catch (error) {
          debugError('Video recording error', error);
          // Error handling and UI reset is done in useRecording hook
          // Just ensure UI is reset here as well
          const videoSection = document.getElementById('videoSection');
          const videoDropzone = document.getElementById('videoDropzone');
          const videoPreview = document.getElementById('videoPreview');
          if (videoDropzone) videoDropzone.style.display = 'flex';
          if (videoPreview) videoPreview.style.display = 'none';
          if (videoSection) videoSection.classList.remove('recording');
        }
    };

    // Audio functions
    (window as any).selectAudio = selectAudio;
    (window as any).selectAudioInOut = async () => {
      if (nle?.exportInOutAudio) {
        // Use settings.renderAudio directly (wav or mp3)
        const format = settings.renderAudio || "wav";
        
        const result = await nle.exportInOutAudio({ format });
        if (result?.ok && result?.path) {
          await selectAudio();
        } else if (result?.error) {
          // Show error toast
          if ((window as any).showToast) {
            (window as any).showToast(result.error, "error");
          }
        }
      }
    };
    (window as any).selectAudioUrl = () => {
      setUrlInputMode("audio");
      // Use DOM manipulation to match main branch behavior
      setTimeout(() => {
        const audioSection = document.getElementById('audioSection');
        const audioDropzone = document.getElementById('audioDropzone');
        const audioUploadVisual = document.getElementById('audioUploadVisual');
        const audioUploadActions = document.getElementById('audioUploadActions');
        const audioUrlInput = document.getElementById('audioUrlInput');
        
        if (audioSection) audioSection.classList.add('url-input-active');
        if (audioUploadVisual) {
          audioUploadVisual.style.transition = 'opacity 0.2s ease';
          audioUploadVisual.style.opacity = '0';
          setTimeout(() => { audioUploadVisual.style.display = 'none'; }, 200);
        }
        if (audioUploadActions) {
          audioUploadActions.style.transition = 'opacity 0.2s ease';
          audioUploadActions.style.opacity = '0';
          setTimeout(() => { audioUploadActions.style.display = 'none'; }, 200);
        }
        if (audioDropzone) audioDropzone.classList.add('url-input-mode');
        if (audioUrlInput) {
          audioUrlInput.style.display = 'flex';
          setTimeout(() => {
            audioUrlInput.classList.add('show');
            const field = document.getElementById('audioUrlField') as HTMLInputElement;
            if (field) {
              setTimeout(() => field.focus(), 100);
            }
          }, 10);
        }
      }, 0);
    };
    (window as any).startAudioRecording = async () => {
        if ((window as any).debugLog) {
          (window as any).debugLog('audio_record_clicked', { isRecording, recordingType });
        }
        if (isRecording && recordingType === "audio") {
          stopRecording();
          return;
        }
        
        try {
          const audioSection = document.getElementById('audioSection');
          const audioDropzone = document.getElementById('audioDropzone');
          const audioPreview = document.getElementById('audioPreview');
          
          if (!audioSection || !audioDropzone || !audioPreview) {
            throw new Error('Audio elements not found');
          }
          
          // Hide dropzone, show recording UI
          audioDropzone.style.display = 'none';
          audioPreview.style.display = 'flex';
          audioSection.classList.add('recording');
          
          // Create recording UI first
          const preview = document.getElementById('audioPreview');
          if (preview && !preview.querySelector('.audio-recording-container')) {
            preview.innerHTML = `
              <div class="audio-recording-container">
                <div class="audio-waveform-wrapper">
                  <canvas id="audioRecordWaveform" class="audio-record-waveform"></canvas>
                  <div class="audio-timeline-dots"></div>
                  <div class="audio-playhead" id="audioPlayhead"></div>
                </div>
                <div class="recording-device-switcher" id="audioDeviceSwitcher">
                  <select id="audioDeviceSelect" class="device-select">
                  </select>
                </div>
                <button class="audio-recording-stop-btn" id="audioStopBtn">
                  <div class="audio-stop-icon"></div>
                  <span class="recording-timer" id="audioTimer">00:00</span>
                </button>
                <button class="recording-close-btn" id="audioBackBtn">
                  <i data-lucide="x"></i>
                </button>
              </div>
            `;
            
            // Initialize icons
            if ((window as any).lucide && (window as any).lucide.createIcons) {
              (window as any).lucide.createIcons();
            }
            
            // Setup handlers
            const stopBtn = document.getElementById('audioStopBtn');
            if (stopBtn) {
              stopBtn.addEventListener('click', () => {
                stopRecording();
              });
            }
            
            const backBtn = document.getElementById('audioBackBtn');
            if (backBtn) {
              backBtn.addEventListener('click', () => {
                stopRecording();
                // Reset UI
                audioDropzone.style.display = 'flex';
                audioPreview.style.display = 'none';
                audioSection.classList.remove('recording');
              });
            }
          }
          
          // Start recording
          await startRecording("audio");
        } catch (error) {
          debugError('Audio recording error', error);
          // Error handling and UI reset is done in useRecording hook
          // Just ensure UI is reset here as well
          const audioSection = document.getElementById('audioSection');
          const audioDropzone = document.getElementById('audioDropzone');
          const audioPreview = document.getElementById('audioPreview');
          if (audioDropzone) audioDropzone.style.display = 'flex';
          if (audioPreview) audioPreview.style.display = 'none';
          if (audioSection) audioSection.classList.remove('recording');
        }
    };
    (window as any).selectAudioFromVideo = async () => {
      if (!selection.video && !selection.videoUrl) return;
      
      try {
        const videoPath = selection.video;
        const videoUrl = selection.videoUrl;
        
        if (!videoPath && !videoUrl) return;

        const response = await fetch(getApiUrl("/extract-audio"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ videoPath, videoUrl, format: "wav" }),
        });

        const data = await response.json().catch(() => null);
        if (response.ok && data?.ok && data?.audioPath) {
          await setAudioPath(data.audioPath);
          
          // Update UI state
          if (typeof (window as any).updateLipsyncButton === "function") {
            (window as any).updateLipsyncButton();
          }
          if (typeof (window as any).renderInputPreview === "function") {
            (window as any).renderInputPreview("extract-audio");
          }
          if (typeof (window as any).updateInputStatus === "function") {
            (window as any).updateInputStatus();
          }
          
          // Show success toast
          if ((window as any).showToast) {
            (window as any).showToast("Audio extracted from video", "success");
          }
        } else {
          // Show error toast
          const errorMsg = data?.error || "Failed to extract audio from video";
          if ((window as any).showToast) {
            (window as any).showToast(errorMsg, "error");
          }
        }
      } catch (error) {
        debugError("Error extracting audio from video", error);
        if ((window as any).showToast) {
          (window as any).showToast("Error extracting audio: " + (error as Error).message, "error");
        }
      }
    };
    (window as any).TTSInterface = {
      show: () => {
        setTtsInterfaceOpen(true);
      },
    };

    // Update from video button
    (window as any).updateFromVideoButton = () => {
      const fromVideoBtn = document.querySelector('.audio-upload .action-btn[data-action="audio-from-video"]') as HTMLButtonElement;
      if (!fromVideoBtn) return;
      
      const hasVideo = !!(selection.video || selection.videoUrl);
      
      if (hasVideo) {
        fromVideoBtn.disabled = false;
        fromVideoBtn.style.opacity = '1';
        fromVideoBtn.style.cursor = 'pointer';
      } else {
        fromVideoBtn.disabled = true;
        fromVideoBtn.style.opacity = '0.5';
        fromVideoBtn.style.cursor = 'not-allowed';
      }
    };

    // Show post-lipsync actions
    (window as any).showPostLipsyncActions = (job: any) => {
      const videoSection = document.getElementById('videoSection');
      if (!videoSection) return;
      
      // Remove existing actions if any
      const existingActions = document.getElementById('postLipsyncActions');
      if (existingActions) existingActions.remove();
      
      // Create actions container
      const actionsHtml = `
        <div class="post-lipsync-actions" id="postLipsyncActions">
          <div class="post-lipsync-actions-left">
            <button class="post-action-btn" id="save-${job.id}" onclick="saveCompletedJob('${job.id}')">
              <i data-lucide="cloud-download"></i>
              <span>save</span>
            </button>
            <button class="post-action-btn" id="insert-${job.id}" onclick="insertCompletedJob('${job.id}')">
              <i data-lucide="copy-plus"></i>
              <span>insert</span>
            </button>
          </div>
          <div class="post-lipsync-actions-right">
            <button class="post-action-btn-icon" onclick="copyOutputLink('${job.id}')" title="copy output link">
              <i data-lucide="link"></i>
            </button>
            <button class="post-action-btn-icon" onclick="copyJobId('${job.syncJobId || job.id}')" title="copy job id">
              <span class="post-action-btn-id-text">id</span>
            </button>
            <button class="post-action-btn-icon" onclick="clearCompletedJob()" title="clear">
              <i data-lucide="eraser"></i>
            </button>
          </div>
        </div>`;
      
      // Insert as sibling after videoSection
      videoSection.insertAdjacentHTML('afterend', actionsHtml);
      
      // Initialize Lucide icons for the new buttons
      if ((window as any).lucide && (window as any).lucide.createIcons) {
        setTimeout(() => {
          (window as any).lucide.createIcons();
          
          // Set stroke-width for action button icons (16px icons)
          document.querySelectorAll('.post-action-btn i svg').forEach((svg: any) => {
            svg.setAttribute('stroke-width', '2');
            svg.setAttribute('width', '16');
            svg.setAttribute('height', '16');
            svg.querySelectorAll('path, circle, rect, line, polyline, polygon').forEach((el: any) => {
              el.setAttribute('stroke-width', '2');
            });
          });
          
          // Set stroke-width for icon button icons (18px icons)
          const iconBtns = document.querySelectorAll('.post-action-btn-icon i');
          iconBtns.forEach((icon: any) => {
            const svg = icon.querySelector('svg');
            if (svg) {
              svg.setAttribute('stroke-width', '2');
              svg.setAttribute('width', '18');
              svg.setAttribute('height', '18');
              svg.style.color = 'var(--text-primary)';
              svg.style.stroke = 'var(--text-primary)';
              svg.style.fill = 'none';
              const paths = svg.querySelectorAll('path, circle, line, polyline, polygon');
              paths.forEach((path: any) => {
                path.setAttribute('stroke-width', '2');
                if (!path.getAttribute('stroke')) {
                  path.setAttribute('stroke', 'var(--text-primary)');
                }
                if (!path.getAttribute('fill') || path.getAttribute('fill') === 'currentColor') {
                  path.setAttribute('fill', 'none');
                }
              });
            }
          });
        }, 100);
      }
    };

    // Render output video
    (window as any).renderOutputVideo = (job: any, retryCount: number = 0) => {
      const maxRetries = 3;
      debugLog('[renderOutputVideo] Called', { hasJob: !!job, hasOutputPath: !!job?.outputPath, hasOutputUrl: !!job?.outputUrl, retryCount });
      if (!job || (!job.outputPath && !job.outputUrl)) {
        debugLog('[renderOutputVideo] No job or no output path/url', { job: !!job, outputPath: job?.outputPath, outputUrl: job?.outputUrl });
        return;
      }
      
      const videoSection = document.getElementById('videoSection');
      const videoDropzone = document.getElementById('videoDropzone');
      const videoPreview = document.getElementById('videoPreview');
      const sourcesContainer = document.querySelector('.sources-container');
      
      const hasVideoSection = !!videoSection;
      const hasVideoPreview = !!videoPreview;
      const hasVideoDropzone = !!videoDropzone;
      const hasSourcesContainer = !!sourcesContainer;
      
      debugLog('[renderOutputVideo] Elements check', {
        hasVideoSection,
        hasVideoPreview,
        hasVideoDropzone,
        hasSourcesContainer,
        videoSectionId: videoSection?.id,
        videoPreviewId: videoPreview?.id,
        retryCount
      });
      
      // If elements don't exist and we haven't exceeded retries, wait and try again
      if ((!videoSection || !videoPreview) && retryCount < maxRetries) {
        debugLog('[renderOutputVideo] Elements not found, retrying', { retryCount, maxRetries });
        requestAnimationFrame(() => {
          setTimeout(() => {
            (window as any).renderOutputVideo(job, retryCount + 1);
          }, 50 * (retryCount + 1)); // Increasing delay: 50ms, 100ms, 150ms
        });
        return;
      }
      
      if (videoSection && videoPreview) {
        // Add classes for proper layout
        videoSection.classList.add('has-media');
        if (sourcesContainer) {
          sourcesContainer.classList.add('has-video');
          sourcesContainer.classList.add('has-both');
        }
        
        // Use outputUrl if available, otherwise check if outputPath is a URL or file path
        let videoSrc = '';
        if (job.outputUrl) {
          videoSrc = job.outputUrl;
        } else if (job.outputPath) {
          // Check if outputPath is already a URL
          if (job.outputPath.startsWith('http://') || job.outputPath.startsWith('https://')) {
            videoSrc = job.outputPath;
          } else {
            // It's a file path, prepend file://
            videoSrc = `file://${job.outputPath.replace(/ /g, '%20')}`;
          }
        }
        
        debugLog('[renderOutputVideo] Video source determined', {
          hasVideoSrc: !!videoSrc,
          videoSrcLength: videoSrc?.length,
          outputUrl: job.outputUrl,
          outputPath: job.outputPath
        });
        
        if (!videoSrc) {
          debugLog('[renderOutputVideo] No video source available - exiting', {
            outputUrl: job.outputUrl,
            outputPath: job.outputPath
          });
          return;
        }
        
        // Ensure video preview is visible for output display
        if (videoDropzone) videoDropzone.style.display = 'none';
        videoPreview.style.display = 'block';
        
        debugLog('[renderOutputVideo] Setting video HTML', { videoSrc });
        
        videoPreview.innerHTML = `
          <div class="custom-video-player">
            <video id="outputVideo" class="video-element" src="${videoSrc}" preload="metadata" playsinline>
              <source src="${videoSrc}" type="video/mp4">
            </video>
            <!-- Center play button overlay -->
            <div class="video-play-overlay" id="outputVideoPlayOverlay">
              <button class="center-play-btn" id="outputCenterPlayBtn">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5,3 19,12 5,21"/>
                </svg>
              </button>
            </div>
            <div class="video-controls">
              <div class="video-progress-container">
                <div class="video-progress-bar">
                  <div class="video-progress-fill" id="outputVideoProgress"></div>
                  <div class="video-progress-thumb" id="outputVideoThumb"></div>
                </div>
              </div>
              <div class="video-control-buttons">
                <div class="video-left-controls">
                  <button class="video-control-btn volume-btn" id="outputVolumeBtn">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                      <polygon points="11,5 6,9 2,9 2,15 6,15 11,19 11,5"/>
                      <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>
                    </svg>
                  </button>
                  <input type="range" class="volume-slider" id="outputVolumeSlider" min="0" max="100" value="100">
                </div>
                <div class="video-center-controls">
                  <div class="video-time" id="outputVideoTime">00:00 / 00:00</div>
                  <div class="video-frame-info" id="outputVideoFrameInfo">0 / 0</div>
                </div>
                <div class="video-right-controls">
                </div>
              </div>
            </div>
          </div>`;
        
        debugLog('[renderOutputVideo] Video HTML set, initializing player');
        
        if ((window as any).initOutputVideoPlayer) {
          (window as any).initOutputVideoPlayer();
          debugLog('[renderOutputVideo] Player initialization function called');
        } else {
          debugLog('[renderOutputVideo] initOutputVideoPlayer function not found');
        }
        
        debugLog('[renderOutputVideo] Video rendered successfully', { videoSrc });
      } else {
        debugLog('[renderOutputVideo] Elements missing', {
          hasVideoSection,
          hasVideoPreview,
          videoSectionId: videoSection?.id,
          videoPreviewId: videoPreview?.id
        });
      }
    };

    // Update functions when selection changes
    if (typeof (window as any).updateLipsyncButton === "function") {
      (window as any).updateLipsyncButton();
    }
    if (typeof (window as any).renderInputPreview === "function") {
      (window as any).renderInputPreview("state-change");
    }
    if (typeof (window as any).updateInputStatus === "function") {
      (window as any).updateInputStatus();
    }
    if (typeof (window as any).updateFromVideoButton === "function") {
      (window as any).updateFromVideoButton();
    }
  }, [selectVideo, selectAudio, nle, isRecording, recordingType, startRecording, stopRecording, selection, setTtsInterfaceOpen]);


  // Use event delegation on the sources container - this works even if buttons are recreated
  useEffect(() => {
    if (activeTab !== "sources") return;
    
    // Wait for tab to be visible and DOM to be ready
    const setupHandlers = () => {
      const sourcesContainer = document.getElementById('sources');
      if (!sourcesContainer) {
        if ((window as any).debugLog) {
          (window as any).debugLog('button_not_found', { message: 'Sources container not found, retrying...' });
        }
        return false;
      }
      
      // Check if tab is actually visible
      const isVisible = sourcesContainer.classList.contains('active') && 
                        window.getComputedStyle(sourcesContainer).display !== 'none';
      if (!isVisible) {
        if ((window as any).debugLog) {
          (window as any).debugLog('button_not_found', { message: 'Sources tab not visible yet' });
        }
        return false;
      }
      
      if ((window as any).debugLog) {
        (window as any).debugLog('button_handler_setup', { message: 'Setting up event delegation on sources container' });
      }
      return true;
    };
    
    // Try immediately, then retry if needed
    let retries = 0;
    const maxRetries = 10;
    const trySetup = () => {
      if (setupHandlers()) {
        attachHandlers();
      } else if (retries < maxRetries) {
        retries++;
        setTimeout(trySetup, 100);
            }
    };
    
    let cleanupHandlers: (() => void) | null = null;
    
    const attachHandlers = () => {
      const sourcesContainer = document.getElementById('sources');
      if (!sourcesContainer) return;
    
      const handleClick = async (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        
        // Check if click is on a button or inside a button
        const button = target.closest('button[data-action]') as HTMLButtonElement;
        
        if (!button || button.disabled) {
          return;
        }
        
        const action = button.getAttribute('data-action');
        if (!action) return;
            
        if ((window as any).debugLog) {
          (window as any).debugLog('button_click', { action, disabled: button.disabled });
        }
        
        // Don't prevent default or stop propagation - let React handlers also run if they exist
        // We'll handle the action regardless
        
        try {
          switch (action) {
            case 'video-upload':
            if ((window as any).debugLog) {
              (window as any).debugLog('button_click', { action: 'video-upload', handling: true, hasNLE: !!nle, hasCSInterface: !!(window as any).CSInterface });
            }
            try {
              // Call from window to ensure we get the latest function (not stale closure)
              if (typeof (window as any).selectVideo === 'function') {
                await (window as any).selectVideo();
                if ((window as any).debugLog) {
                  (window as any).debugLog('button_click', { action: 'video-upload', completed: true });
                }
              } else {
                if ((window as any).debugLog) {
                  (window as any).debugLog('button_click', { action: 'video-upload', error: 'selectVideo function not available on window' });
                }
              }
            } catch (error) {
              if ((window as any).debugLog) {
                (window as any).debugLog('button_click', { action: 'video-upload', error: String(error), stack: (error as Error)?.stack });
              }
            }
            break;
          case 'audio-upload':
            if ((window as any).debugLog) {
              (window as any).debugLog('button_click', { action: 'audio-upload', handling: true, hasNLE: !!nle, hasCSInterface: !!(window as any).CSInterface });
            }
            try {
              // Call from window to ensure we get the latest function (not stale closure)
              if (typeof (window as any).selectAudio === 'function') {
                await (window as any).selectAudio();
                if ((window as any).debugLog) {
                  (window as any).debugLog('button_click', { action: 'audio-upload', completed: true });
                }
              } else {
                if ((window as any).debugLog) {
                  (window as any).debugLog('button_click', { action: 'audio-upload', error: 'selectAudio function not available on window' });
                }
              }
            } catch (error) {
              if ((window as any).debugLog) {
                (window as any).debugLog('button_click', { action: 'audio-upload', error: String(error), stack: (error as Error)?.stack });
              }
            }
            break;
          case 'video-record':
            if ((window as any).debugLog) {
              (window as any).debugLog('button_click', { action: 'video-record', handling: true });
            }
            if ((window as any).startVideoRecording) {
              await (window as any).startVideoRecording();
            }
            break;
          case 'audio-record':
            if ((window as any).debugLog) {
              (window as any).debugLog('button_click', { action: 'audio-record', handling: true });
            }
            if ((window as any).startAudioRecording) {
              await (window as any).startAudioRecording();
            }
            break;
          case 'video-link':
            if ((window as any).debugLog) {
              (window as any).debugLog('button_click', { action: 'video-link', handling: true });
            }
            if ((window as any).selectVideoUrl) {
              (window as any).selectVideoUrl();
            }
            break;
          case 'audio-link':
            if ((window as any).debugLog) {
              (window as any).debugLog('button_click', { action: 'audio-link', handling: true });
            }
            if ((window as any).selectAudioUrl) {
              (window as any).selectAudioUrl();
            }
            break;
          }
        } catch (error) {
          if ((window as any).debugLog) {
            (window as any).debugLog('button_click', { error: String(error), action });
          }
        }
      };
      
      // Test: log all clicks on the container to see if events are reaching it
      const testClick = (e: MouseEvent) => {
        if ((window as any).debugLog) {
          const button = (e.target as HTMLElement)?.closest('button');
          (window as any).debugLog('sources_tab_click', {
            hasButton: !!button,
            buttonAction: button?.getAttribute('data-action') || null,
          });
        }
      };
      sourcesContainer.addEventListener('click', testClick, true);
      
      // Use capture phase AND bubble phase to ensure we catch the event
      sourcesContainer.addEventListener('click', handleClick, true);
      sourcesContainer.addEventListener('click', handleClick, false);
      
      cleanupHandlers = () => {
        sourcesContainer.removeEventListener('click', testClick, true);
        sourcesContainer.removeEventListener('click', handleClick, true);
        sourcesContainer.removeEventListener('click', handleClick, false);
      };
        };
    
    trySetup();
    
    // Also set up a MutationObserver to re-attach if DOM changes
    const observer = new MutationObserver(() => {
      const container = document.getElementById('sources');
      if (container && container.classList.contains('active')) {
        // DOM changed, handlers should still work with delegation but log it
        if ((window as any).debugLog) {
          const buttons = container.querySelectorAll('button[data-action]');
          (window as any).debugLog('dom_changed', { buttonCount: buttons.length });
        }
      }
    });
    
    const sourcesContainer = document.getElementById('sources');
    if (sourcesContainer) {
      observer.observe(sourcesContainer, { childList: true, subtree: true });
      }
    
    return () => {
      observer.disconnect();
      if (cleanupHandlers) {
        cleanupHandlers();
      }
    };
  }, [activeTab, selectVideo, selectAudio, nle]);
  
  // Re-initialize Lucide icons when tab becomes active
  useEffect(() => {
    if (activeTab === "sources") {
      const timer = setTimeout(() => {
        if ((window as any).lucide && (window as any).lucide.createIcons) {
          (window as any).lucide.createIcons();
        }
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [activeTab]);

  return (
    <>
      <div id="sources" className={`tab-pane ${activeTab === "sources" ? "active" : ""}`}>
        {isOffline ? (
          <div className="offline-state">
            <div className="offline-icon">
              <i data-lucide="wifi-off"></i>
            </div>
            <div className="offline-message">
              hmm... you might be offline, or<br />
              the local server is down. <a onClick={() => {
                const nle = (window as any).nle;
                if (nle && typeof nle.startBackend === 'function') {
                  nle.startBackend();
                }
              }}>fix this</a>
            </div>
          </div>
        ) : (
        <div className={`sources-container ${selection.video || selection.videoUrl ? "has-video" : ""} ${(selection.video || selection.videoUrl) && (selection.audio || selection.audioUrl) ? "has-both" : ""}`}>
          {/* Video Upload Section */}
          <div className={`upload-box video-upload ${selection.video || selection.videoUrl ? "has-media" : ""}`} id="videoSection">
            <div id="videoDropzone" className="upload-content" style={{ display: (selection.video || selection.videoUrl) ? "none" : "flex" }}>
              <div className="upload-visual" id="videoUploadVisual">
                <div className="icon-group">
                  <div className="icon-float rotate-15">
                    <FileVideo size={39} style={{ color: "#525258" }} />
                  </div>
                  <div className="icon-float rotate-neg-15">
                    <Clapperboard size={32} style={{ color: "#3b3b40" }} />
                  </div>
                  <div className="icon-bg"></div>
                  <div className="icon-main-wrapper">
                    <div className="icon-main">
                      <FileVideo2 size={48} style={{ color: "#d4d4d4" }} />
                    </div>
                  </div>
                </div>
                <p className="upload-text">choose a video to edit</p>
              </div>
              <div className="upload-actions" id="videoUploadActions">
                <div className="action-row">
                  <button 
                    type="button" 
                    draggable="false" 
                    className="action-btn" 
                    data-action="video-upload"
                    onClick={async (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if ((window as any).debugLog) {
                        (window as any).debugLog('button_click', { action: 'video-upload', source: 'react_onclick' });
                      }
                      if (typeof (window as any).selectVideo === 'function') {
                        try {
                          await (window as any).selectVideo();
                        } catch (error) {
                          if ((window as any).debugLog) {
                            (window as any).debugLog('button_click', { action: 'video-upload', error: String(error) });
                          }
                        }
                      }
                    }}
                  >
                    <Upload size={16} />
                    <span>upload</span>
                  </button>
                  <button 
                    type="button" 
                    draggable="false" 
                    className="action-btn" 
                    data-action="video-inout"
                    onClick={async (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      debugLog('[SourcesTab] Video in/out button clicked', { nle: !!nle, settings });
                      if ((window as any).selectVideoInOut) {
                        await (window as any).selectVideoInOut();
                      } else if (nle?.exportInOutVideo) {
                        // Map settings.renderVideo to codec value
                        // For Premiere: mp4 -> h264, prores_422 -> prores_422, prores_422hq -> prores_422_hq
                        // For After Effects: mp4 -> h264, anything else -> prores (handled in aeft.ts)
                        let codec = "h264"; // default
                        if (settings.renderVideo === "mp4" || settings.renderVideo === "h264") {
                          codec = "h264";
                        } else if (settings.renderVideo === "prores_422") {
                          codec = "prores_422";
                        } else if (settings.renderVideo === "prores_422hq") {
                          // Premiere expects prores_422_hq (with underscore), settings use prores_422hq
                          codec = "prores_422_hq";
                        }
                        
                        debugLog('[SourcesTab] Calling exportInOutVideo with codec', { codec });
                        const result = await nle.exportInOutVideo({ codec });
                        debugLog('[SourcesTab] exportInOutVideo result', { result });
                        if (result?.ok && result?.path) {
                          if ((window as any).selectVideo) {
                            await (window as any).selectVideo();
                          }
                        } else if (result?.error && (window as any).showToast) {
                          (window as any).showToast(result.error, "error");
                        } else if (!result?.ok && (window as any).showToast) {
                          (window as any).showToast("Failed to export video in/out", "error");
                        }
                      } else {
                        debugError('[SourcesTab] nle.exportInOutVideo not available');
                        if ((window as any).showToast) {
                          (window as any).showToast("Video export not available. Please ensure you have an active sequence/composition.", "error");
                        }
                      }
                    }}
                  >
                    <MousePointerSquareDashed size={16} />
                    <span>use in/out</span>
                  </button>
                </div>
                <div className="action-row">
                  <button 
                    type="button" 
                    draggable="false" 
                    className={`action-btn ${isRecording && recordingType === "video" ? "recording" : ""}`} 
                    data-action="video-record"
                    onClick={async (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if ((window as any).debugLog) {
                        (window as any).debugLog('button_click', { action: 'video-record', source: 'react_onclick' });
                      }
                      if ((window as any).startVideoRecording) {
                        try {
                          await (window as any).startVideoRecording();
                        } catch (error) {
                          if ((window as any).debugLog) {
                            (window as any).debugLog('button_click', { action: 'video-record', error: String(error) });
                          }
                        }
                      }
                    }}
                  >
                    <Webcam size={16} />
                    <span>{isRecording && recordingType === "video" ? "stop" : "record"}</span>
                  </button>
                  <button 
                    type="button" 
                    draggable="false" 
                    className="action-btn" 
                    data-action="video-link"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if ((window as any).debugLog) {
                        (window as any).debugLog('button_click', { action: 'video-link', source: 'react_onclick' });
                      }
                      if ((window as any).selectVideoUrl) {
                        (window as any).selectVideoUrl();
                      }
                    }}
                  >
                    <Link size={16} />
                    <span>link url</span>
                  </button>
                </div>
              </div>
              {/* Inline URL Input Container */}
              <div className="container-url-input" id="videoUrlInput" style={{ display: "none" }}>
                <button className="url-input-close-btn" id="videoUrlClose" onClick={() => {
                  const videoSection = document.getElementById('videoSection');
                  const videoDropzone = document.getElementById('videoDropzone');
                  const videoUploadVisual = document.getElementById('videoUploadVisual');
                  const videoUploadActions = document.getElementById('videoUploadActions');
                  const videoUrlInput = document.getElementById('videoUrlInput');
                  
                  if (videoUrlInput) {
                    videoUrlInput.classList.remove('show');
                    setTimeout(() => {
                      if (videoUrlInput) videoUrlInput.style.display = 'none';
                      if (videoDropzone) videoDropzone.classList.remove('url-input-mode');
                      if (videoSection) videoSection.classList.remove('url-input-active');
                      
                      if (videoUploadVisual) {
                        videoUploadVisual.style.display = 'flex';
                        videoUploadVisual.style.opacity = '0';
                        setTimeout(() => {
                          videoUploadVisual.style.transition = 'opacity 0.2s ease';
                          videoUploadVisual.style.opacity = '1';
                        }, 10);
                      }
                      if (videoUploadActions) {
                        videoUploadActions.style.display = 'flex';
                        videoUploadActions.style.opacity = '0';
                        setTimeout(() => {
                          videoUploadActions.style.transition = 'opacity 0.2s ease';
                          videoUploadActions.style.opacity = '1';
                        }, 10);
                      }
                    }, 200);
                  }
                  setUrlInputMode(null);
                  setVideoUrlValue("");
                }}>
                  <X size={16} />
                </button>
                <div className="container-url-input-group">
                  <div className="container-url-input-wrapper">
                    <input
                      type="text"
                      className="container-url-input-field"
                      id="videoUrlField"
                      placeholder="enter direct url"
                      autoComplete="off"
                      value={videoUrlValue}
                      onChange={(e) => {
                        setVideoUrlValue(e.target.value);
                        const clearBtn = document.getElementById('videoUrlClear');
                        if (clearBtn) clearBtn.style.display = e.target.value.trim() ? 'flex' : 'none';
                      }}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          const submitBtn = document.getElementById('videoUrlSubmit');
                          if (submitBtn) (submitBtn as HTMLButtonElement).click();
                        }
                      }}
                    />
                    {videoUrlValue && (
                      <button className="container-url-clear" id="videoUrlClear" onClick={() => {
                        setVideoUrlValue("");
                        const field = document.getElementById('videoUrlField') as HTMLInputElement;
                        const clearBtn = document.getElementById('videoUrlClear');
                        if (field) field.focus();
                        if (clearBtn) clearBtn.style.display = 'none';
                      }}>
                        <X size={16} />
                      </button>
                    )}
                  </div>
                  <button className="container-url-submit" id="videoUrlSubmit" onClick={async () => {
                    if (!videoUrlValue.trim()) return;
                    try {
                      const response = await fetch(getApiUrl("/download"), {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ url: videoUrlValue.trim(), type: "video" }),
                      });
                      const data = await response.json().catch(() => null);
                      if (response.ok && data?.ok && data?.path) {
                        const url = videoUrlValue.trim();
                        // Set the video path and URL
                        await setVideoPath(data.path, url);
                        
                        // Update UI state
                        if (typeof (window as any).updateLipsyncButton === "function") {
                          (window as any).updateLipsyncButton();
                        }
                        if (typeof (window as any).renderInputPreview === "function") {
                          (window as any).renderInputPreview("url-load");
                        }
                        if (typeof (window as any).updateInputStatus === "function") {
                          (window as any).updateInputStatus();
                        }
                        
                        setUrlInputMode(null);
                        setVideoUrlValue("");
                        // Close URL input
                        const videoUrlInput = document.getElementById('videoUrlInput');
                        if (videoUrlInput) {
                          videoUrlInput.classList.remove('show');
                          setTimeout(() => {
                            if (videoUrlInput) videoUrlInput.style.display = 'none';
                            const videoDropzone = document.getElementById('videoDropzone');
                            if (videoDropzone) videoDropzone.classList.remove('url-input-mode');
                            const videoSection = document.getElementById('videoSection');
                            if (videoSection) videoSection.classList.remove('url-input-active');
                          }, 200);
                        }
                      } else {
                        // Show error toast
                        const errorMsg = data?.error || "Failed to download video from URL";
                        if ((window as any).showToast) {
                          (window as any).showToast(errorMsg, "error");
                        }
                      }
                    } catch (_) {}
                  }}>
                    <DownloadCloud size={20} />
                  </button>
                </div>
              </div>
            </div>
            {/* Always render videoPreview so it's available for output videos from history */}
            <div id="videoPreview" style={{ display: (selection.video || selection.videoUrl) ? "flex" : "none" }}>
              <div className="custom-video-player">
                <video 
                  id="mainVideo" 
                  className="video-element" 
                  src={selection.videoIsUrl && selection.videoUrl ? selection.videoUrl : (selection.video ? `file://${selection.video.replace(/ /g, '%20')}` : '')} 
                  preload="metadata" 
                  playsInline
                >
                  <source src={selection.videoIsUrl && selection.videoUrl ? selection.videoUrl : (selection.video ? `file://${selection.video.replace(/ /g, '%20')}` : '')} type="video/mp4" />
                </video>
                {/* Center play button overlay */}
                <div className="video-play-overlay" id="videoPlayOverlay">
                  <button className="center-play-btn" id="centerPlayBtn">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                      <polygon points="5,3 19,12 5,21"/>
                    </svg>
                  </button>
                </div>
                <div className="video-controls">
                  <div className="video-progress-container">
                    <div className="video-progress-bar">
                      <div className="video-progress-fill" id="videoProgress"></div>
                      <div className="video-progress-thumb" id="videoThumb"></div>
                    </div>
                  </div>
                  <div className="video-control-buttons">
                    <div className="video-left-controls">
                      <button className="video-control-btn volume-btn" id="volumeBtn">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                          <polygon points="11,5 6,9 2,9 2,15 6,15 11,19 11,5"/>
                          <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>
                        </svg>
                      </button>
                      <input type="range" className="volume-slider" id="volumeSlider" min="0" max="100" defaultValue="100" />
                    </div>
                    <div className="video-center-controls">
                      <div className="video-time" id="videoTime">00:00 / 00:00</div>
                      <div className="video-frame-info" id="videoFrameInfo">0 / 0</div>
                    </div>
                    <div className="video-right-controls">
                      <button className="video-control-btn video-delete-btn" onClick={clearVideo}>
                        <Trash2 size={18} />
                  </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Audio Upload Section */}
          <div 
            className={`upload-box audio-upload ${selection.audio ? "has-media" : ""}`} 
            id="audioSection"
            style={ttsInterfaceOpen && !selection.audio ? { height: '99px', minHeight: '99px', maxHeight: '99px' } : {}}
          >
            {ttsInterfaceOpen && !selection.audio ? (
              <TTSInterface
                isOpen={ttsInterfaceOpen}
                onClose={() => setTtsInterfaceOpen(false)}
                onVoiceSelectClick={() => {
                  debugLog('[SourcesTab] Voice select clicked, opening selector');
                  setTtsVoiceSelectorOpen(true);
                }}
              />
            ) : (
            <div id="audioDropzone" className="upload-content" style={{ display: (selection.audio || selection.audioUrl) ? "none" : "flex" }}>
              <div className="upload-visual" id="audioUploadVisual">
                <div className="icon-group-audio">
                  <div className="icon-float rotate-15">
                    <AudioLines size={39} style={{ color: "#525258" }} />
                  </div>
                  <div className="icon-float rotate-neg-15">
                    <Mic size={32} style={{ color: "#3b3b40" }} />
                  </div>
                  <div className="icon-bg-audio"></div>
                  <div className="icon-main-wrapper icon-main-wrapper-audio">
                    <div className="icon-main icon-main-audio">
                      <FileAudio size={48} style={{ color: "#d4d4d4" }} />
                    </div>
                  </div>
                </div>
                <p className="upload-text">choose an audio to sync</p>
              </div>
              <div className="upload-actions" id="audioUploadActions">
                <div className="action-row">
                  <button 
                    type="button" 
                    draggable="false" 
                    className="action-btn" 
                    data-action="audio-upload"
                    onClick={async (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if ((window as any).debugLog) {
                        (window as any).debugLog('button_click', { action: 'audio-upload', source: 'react_onclick' });
                      }
                      if (typeof (window as any).selectAudio === 'function') {
                        try {
                          await (window as any).selectAudio();
                        } catch (error) {
                          if ((window as any).debugLog) {
                            (window as any).debugLog('button_click', { action: 'audio-upload', error: String(error) });
                          }
                        }
                      }
                    }}
                  >
                    <Upload size={16} />
                    <span>upload</span>
                  </button>
                  <button 
                    type="button" 
                    draggable="false" 
                    className="action-btn" 
                    data-action="audio-inout"
                    onClick={async (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      debugLog('[SourcesTab] Audio in/out button clicked', { nle: !!nle, settings });
                      if ((window as any).selectAudioInOut) {
                        await (window as any).selectAudioInOut();
                      } else if (nle?.exportInOutAudio) {
                        // Use settings.renderAudio directly (wav or mp3)
                        const format = settings.renderAudio || "wav";
                        
                        debugLog('[SourcesTab] Calling exportInOutAudio with format', { format });
                        const result = await nle.exportInOutAudio({ format });
                        debugLog('[SourcesTab] exportInOutAudio result', { result });
                        if (result?.ok && result?.path) {
                          if ((window as any).selectAudio) {
                            await (window as any).selectAudio();
                          }
                        } else if (result?.error && (window as any).showToast) {
                          (window as any).showToast(result.error, "error");
                        } else if (!result?.ok && (window as any).showToast) {
                          (window as any).showToast("Failed to export audio in/out", "error");
                        }
                      } else {
                        debugError('[SourcesTab] nle.exportInOutAudio not available');
                        if ((window as any).showToast) {
                          (window as any).showToast("Audio export not available. Please ensure you have an active sequence/composition.", "error");
                        }
                      }
                    }}
                  >
                    <MousePointerSquareDashed size={16} />
                    <span>use in/out</span>
                  </button>
                </div>
                <div className="action-row">
                  <button 
                    type="button" 
                    draggable="false" 
                    className={`action-btn ${isRecording && recordingType === "audio" ? "recording" : ""}`} 
                    data-action="audio-record"
                    onClick={async (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if ((window as any).debugLog) {
                        (window as any).debugLog('button_click', { action: 'audio-record', source: 'react_onclick' });
                      }
                      if ((window as any).startAudioRecording) {
                        try {
                          await (window as any).startAudioRecording();
                        } catch (error) {
                          if ((window as any).debugLog) {
                            (window as any).debugLog('button_click', { action: 'audio-record', error: String(error) });
                          }
                        }
                      }
                    }}
                  >
                    <Mic size={16} />
                    <span>{isRecording && recordingType === "audio" ? "stop" : "record"}</span>
                  </button>
                  <button 
                    type="button" 
                    draggable="false" 
                    className="action-btn" 
                    data-action="audio-link"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if ((window as any).debugLog) {
                        (window as any).debugLog('button_click', { action: 'audio-link', source: 'react_onclick' });
                      }
                      if ((window as any).selectAudioUrl) {
                        (window as any).selectAudioUrl();
                      }
                    }}
                  >
                    <Link size={16} />
                    <span>link url</span>
                  </button>
                </div>
                <div className="action-row">
                  <button type="button" draggable="false" className="action-btn" data-action="audio-from-video" onClick={async (e) => { 
                    e.preventDefault(); 
                    e.stopPropagation(); 
                    if (!selection.video && !selection.videoUrl) return; 
                    try { 
                      const videoPath = selection.video;
                      const videoUrl = selection.videoUrl;
                      if (!videoPath && !videoUrl) return; 
                      const response = await fetch(getApiUrl("/extract-audio"), { 
                        method: "POST", 
                        headers: { "Content-Type": "application/json" }, 
                        body: JSON.stringify({ videoPath, videoUrl, format: "wav" }), 
                      }); 
                      const data = await response.json().catch(() => null); 
                      if (response.ok && data?.ok && data?.audioPath) { 
                        await setAudioPath(data.audioPath);
                        
                        // Update UI state
                        if (typeof (window as any).updateLipsyncButton === "function") {
                          (window as any).updateLipsyncButton();
                        }
                        if (typeof (window as any).renderInputPreview === "function") {
                          (window as any).renderInputPreview("extract-audio");
                        }
                        if (typeof (window as any).updateInputStatus === "function") {
                          (window as any).updateInputStatus();
                        }
                        
                        // Show success toast
                        if ((window as any).showToast) {
                          (window as any).showToast("Audio extracted from video", "success");
                        }
                      } else {
                        // Show error toast
                        const errorMsg = data?.error || "Failed to extract audio from video";
                        if ((window as any).showToast) {
                          (window as any).showToast(errorMsg, "error");
                        }
                      }
                    } catch (error) { 
                      debugError("Error extracting audio from video", error); 
                      if ((window as any).showToast) {
                        (window as any).showToast("Error extracting audio: " + (error as Error).message, "error");
                      }
                    } 
                  }}>
                    <MousePointerClick size={16} />
                    <span>from video</span>
                  </button>
                  <button type="button" draggable="false" className="action-btn" data-action="audio-tts" onClick={(e) => { 
                    e.preventDefault(); 
                    e.stopPropagation(); 
                    if (!settings.elevenlabsApiKey || !settings.elevenlabsApiKey.trim()) {
                      // Show toast with link to settings
                      if ((window as any).showToast) {
                        const toast = document.createElement("div");
                        toast.className = "history-toast history-toast-info";
                        toast.innerHTML = 'please set your elevenlabs api key <a href="#" style="color: var(--color-primary); text-decoration: underline; cursor: pointer;">here</a>';
                        const link = toast.querySelector('a');
                        if (link) {
                          link.addEventListener('click', (ev) => {
                            ev.preventDefault();
                            setActiveTab('settings');
                            setTimeout(() => {
                              if (toast.parentNode) {
                                toast.parentNode.removeChild(toast);
                              }
                            }, 100);
                          });
                        }
                        document.body.appendChild(toast);
                        // Trigger animation by adding show class
                        requestAnimationFrame(() => {
                          toast.classList.add("show");
                        });
                        setTimeout(() => {
                          toast.classList.remove("show");
                          setTimeout(() => {
                            if (toast.parentNode) {
                              toast.parentNode.removeChild(toast);
                            }
                          }, 300);
                        }, 5000);
                      }
                      return;
                    }
                    setTtsInterfaceOpen(true); 
                  }}>
                    <TextSelect size={16} />
                    <span>generate</span>
                  </button>
                </div>
                </div>
              </div>
            )}
            {/* Inline URL Input Container */}
            <div className="container-url-input" id="audioUrlInput" style={{ display: "none" }}>
                <button className="url-input-close-btn" id="audioUrlClose" onClick={() => {
                  const audioSection = document.getElementById('audioSection');
                  const audioDropzone = document.getElementById('audioDropzone');
                  const audioUploadVisual = document.getElementById('audioUploadVisual');
                  const audioUploadActions = document.getElementById('audioUploadActions');
                  const audioUrlInput = document.getElementById('audioUrlInput');
                  
                  if (audioUrlInput) {
                    audioUrlInput.classList.remove('show');
                    setTimeout(() => {
                      if (audioUrlInput) audioUrlInput.style.display = 'none';
                      if (audioDropzone) audioDropzone.classList.remove('url-input-mode');
                      if (audioSection) audioSection.classList.remove('url-input-active');
                      
                      if (audioUploadVisual) {
                        audioUploadVisual.style.display = 'flex';
                        audioUploadVisual.style.opacity = '0';
                        setTimeout(() => {
                          audioUploadVisual.style.transition = 'opacity 0.2s ease';
                          audioUploadVisual.style.opacity = '1';
                        }, 10);
                      }
                      if (audioUploadActions) {
                        audioUploadActions.style.display = 'flex';
                        audioUploadActions.style.opacity = '0';
                        setTimeout(() => {
                          audioUploadActions.style.transition = 'opacity 0.2s ease';
                          audioUploadActions.style.opacity = '1';
                        }, 10);
                      }
                    }, 200);
                  }
                  setUrlInputMode(null);
                  setAudioUrlValue("");
                }}>
                  <X size={16} />
                </button>
                <div className="container-url-input-group">
                  <div className="container-url-input-wrapper">
                    <input
                      type="text"
                      className="container-url-input-field"
                      id="audioUrlField"
                      placeholder="enter direct url"
                      autoComplete="off"
                      value={audioUrlValue}
                      onChange={(e) => {
                        setAudioUrlValue(e.target.value);
                        const clearBtn = document.getElementById('audioUrlClear');
                        if (clearBtn) clearBtn.style.display = e.target.value.trim() ? 'flex' : 'none';
                      }}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          const submitBtn = document.getElementById('audioUrlSubmit');
                          if (submitBtn) (submitBtn as HTMLButtonElement).click();
                        }
                      }}
                    />
                    {audioUrlValue && (
                      <button className="container-url-clear" id="audioUrlClear" onClick={() => {
                        setAudioUrlValue("");
                        const field = document.getElementById('audioUrlField') as HTMLInputElement;
                        const clearBtn = document.getElementById('audioUrlClear');
                        if (field) field.focus();
                        if (clearBtn) clearBtn.style.display = 'none';
                      }}>
                        <X size={16} />
                      </button>
                    )}
                  </div>
                  <button className="container-url-submit" id="audioUrlSubmit" onClick={async () => {
                    if (!audioUrlValue.trim()) return;
                    try {
                      const response = await fetch(getApiUrl("/download"), {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ url: audioUrlValue.trim(), type: "audio" }),
                      });
                      const data = await response.json().catch(() => null);
                      if (response.ok && data?.ok && data?.path) {
                        const url = audioUrlValue.trim();
                        // Set the audio path and URL
                        await setAudioPath(data.path, url);
                        
                        // Update UI state
                        if (typeof (window as any).updateLipsyncButton === "function") {
                          (window as any).updateLipsyncButton();
                        }
                        if (typeof (window as any).renderInputPreview === "function") {
                          (window as any).renderInputPreview("url-load");
                        }
                        if (typeof (window as any).updateInputStatus === "function") {
                          (window as any).updateInputStatus();
                        }
                        
                        setUrlInputMode(null);
                        setAudioUrlValue("");
                        // Close URL input
                        const audioUrlInput = document.getElementById('audioUrlInput');
                        if (audioUrlInput) {
                          audioUrlInput.classList.remove('show');
                          setTimeout(() => {
                            if (audioUrlInput) audioUrlInput.style.display = 'none';
                            const audioDropzone = document.getElementById('audioDropzone');
                            if (audioDropzone) audioDropzone.classList.remove('url-input-mode');
                            const audioSection = document.getElementById('audioSection');
                            if (audioSection) audioSection.classList.remove('url-input-active');
                          }, 200);
                        }
                      } else {
                        // Show error toast
                        const errorMsg = data?.error || "Failed to download audio from URL";
                        if ((window as any).showToast) {
                          (window as any).showToast(errorMsg, "error");
                        }
                      }
                    } catch (_) {}
                  }}>
                    <DownloadCloud size={20} />
                  </button>
                </div>
              </div>
            {(selection.audio || selection.audioUrl) && (
              <div id="audioPreview" style={{ display: "flex" }}>
                <div className="custom-audio-player">
                  <audio 
                    id="audioPlayer" 
                    src={selection.audioIsUrl && selection.audioUrl ? selection.audioUrl : (selection.audio ? `file://${selection.audio.replace(/ /g, '%20')}` : '')} 
                    preload="auto"
                  />
                  <button className="audio-play-btn" id="audioPlayBtn">
                    <Play size={18} />
                  </button>
                  <div className="audio-waveform-container">
                    <canvas id="waveformCanvas" className="waveform-canvas"></canvas>
                    <div className="audio-time" id="audioTime">0:00 / 0:00</div>
                  </div>
                  <div className="dubbing-dropdown-wrapper">
                    <button className="audio-dubbing-btn" id="dubbingBtn">
                      <Globe size={16} />
                      <span id="dubbingBtnText">dubbing</span>
                    </button>
                    <button className="audio-dubbing-submit-btn" id="dubbingSubmitBtn" style={{ display: "none" }}>
                      <ArrowRight size={18} />
                    </button>
                    <div className="dubbing-dropdown" id="dubbingDropdown" style={{ display: "none" }}>
                      <div className="dubbing-dropdown-header">
                        <Search size={16} />
                        <input type="text" id="dubbingSearch" className="dubbing-search-input" placeholder="target language" autoComplete="off" />
                      </div>
                      <div className="dubbing-dropdown-divider"></div>
                      <div className="dubbing-dropdown-options" id="dubbingOptions">
                        <div className="dubbing-option" data-lang="en">english</div>
                        <div className="dubbing-option" data-lang="hi">hindi</div>
                        <div className="dubbing-option" data-lang="pt">portuguese</div>
                        <div className="dubbing-option" data-lang="zh">chinese</div>
                        <div className="dubbing-option" data-lang="es">spanish</div>
                        <div className="dubbing-option" data-lang="fr">french</div>
                        <div className="dubbing-option" data-lang="de">german</div>
                        <div className="dubbing-option" data-lang="ja">japanese</div>
                        <div className="dubbing-option" data-lang="ar">arabic</div>
                        <div className="dubbing-option" data-lang="ru">russian</div>
                        <div className="dubbing-option" data-lang="ko">korean</div>
                        <div className="dubbing-option" data-lang="id">indonesian</div>
                        <div className="dubbing-option" data-lang="it">italian</div>
                        <div className="dubbing-option" data-lang="nl">dutch</div>
                        <div className="dubbing-option" data-lang="tr">turkish</div>
                        <div className="dubbing-option" data-lang="pl">polish</div>
                        <div className="dubbing-option" data-lang="sv">swedish</div>
                        <div className="dubbing-option" data-lang="fil">filipino</div>
                        <div className="dubbing-option" data-lang="ms">malay</div>
                        <div className="dubbing-option" data-lang="ro">romanian</div>
                        <div className="dubbing-option" data-lang="uk">ukrainian</div>
                        <div className="dubbing-option" data-lang="el">greek</div>
                        <div className="dubbing-option" data-lang="cs">czech</div>
                        <div className="dubbing-option" data-lang="da">danish</div>
                        <div className="dubbing-option" data-lang="fi">finnish</div>
                        <div className="dubbing-option" data-lang="bg">bulgarian</div>
                        <div className="dubbing-option" data-lang="hr">croatian</div>
                        <div className="dubbing-option" data-lang="sk">slovak</div>
                        <div className="dubbing-option" data-lang="ta">tamil</div>
                      </div>
                      <div className="dubbing-dropdown-scrollbar"></div>
                    </div>
                  </div>
                  <button className="audio-delete-btn" onClick={clearAudio}>
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Hidden inputs for compatibility */}
          <p id="statusMessage"></p>
          <input type="hidden" id="renderVideo" value="h264" />
          <input type="hidden" id="renderAudio" value="wav" />
          <input type="hidden" id="temperature" value="0.5" />
          <input type="hidden" id="activeSpeakerOnly" />
          <input type="hidden" id="detectObstructions" />
        </div>
        )}
      </div>
      <TTSVoiceSelector
        isOpen={ttsVoiceSelectorOpen}
        onClose={() => setTtsVoiceSelectorOpen(false)}
        onCloneClick={() => {
          setTtsVoiceSelectorOpen(false);
          setTtsVoiceCloneModalOpen(true);
        }}
      />
      <TTSVoiceCloneModal
        isOpen={ttsVoiceCloneModalOpen}
        onClose={() => setTtsVoiceCloneModalOpen(false)}
        onVoiceCreated={(voiceId, voiceName) => {
          // Voice is already selected in the modal
        }}
      />
    </>
  );
};

export default SourcesTab;
