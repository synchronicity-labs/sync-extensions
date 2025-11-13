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
import { useVideoPlayer } from "../hooks/useVideoPlayer";
import { useAudioPlayer } from "../hooks/useAudioPlayer";

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
    // Update lipsync button function
    (window as any).updateLipsyncButton = () => {
      const btn = document.getElementById("lipsyncBtn");
      if (!btn) return;
      const hasVideo = !!(selection.video || selection.videoUrl);
      const hasAudio = !!(selection.audio || selection.audioUrl);
      (btn as HTMLButtonElement).disabled = !(hasVideo && hasAudio);
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
        const result = await nle.exportInOutVideo({ codec: "h264" });
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
          
          // Start recording
          await startRecording("video");
          
          // Create recording UI - this will be handled by useRecording hook
          // But we need to set up the UI here to match main branch
          setTimeout(() => {
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
              
              // Attach stream to video element
              const video = document.getElementById('videoRecordPreview') as HTMLVideoElement;
              if (video && (window as any).__recordingStream) {
                video.srcObject = (window as any).__recordingStream;
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
                  if (video) video.srcObject = null;
                });
              }
            }
          }, 100);
        } catch (error) {
          console.error('Video recording error:', error);
          if ((window as any).showToast) {
            (window as any).showToast('Camera access denied or unavailable', 'error');
          }
        }
    };

    // Audio functions
    (window as any).selectAudio = selectAudio;
    (window as any).selectAudioInOut = async () => {
      if (nle?.exportInOutAudio) {
        const result = await nle.exportInOutAudio({ format: "wav" });
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
          
          // Start recording
          await startRecording("audio");
          
          // Create recording UI - this will be handled by useRecording hook
          // But we need to set up the UI here to match main branch
          setTimeout(() => {
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
          }, 100);
        } catch (error) {
          console.error('Audio recording error:', error);
          if ((window as any).showToast) {
            (window as any).showToast('Microphone access denied or unavailable', 'error');
          }
        }
    };
    (window as any).selectAudioFromVideo = async () => {
      if (!selection.video && !selection.videoUrl) return;
      
      try {
        const videoPath = selection.video || selection.videoUrl;
        if (!videoPath) return;

        const response = await fetch(getApiUrl("/audio/extract"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ videoPath, format: "wav" }),
        });

        const data = await response.json().catch(() => null);
        if (response.ok && data?.ok && data?.path) {
          await selectAudio();
        }
      } catch (error) {
        console.error("Error extracting audio from video:", error);
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
    (window as any).renderOutputVideo = (job: any) => {
      if (!job || (!job.outputPath && !job.outputUrl)) return;
      
      const videoSection = document.getElementById('videoSection');
      const videoDropzone = document.getElementById('videoDropzone');
      const videoPreview = document.getElementById('videoPreview');
      const sourcesContainer = document.querySelector('.sources-container');
      
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
        
        if (!videoSrc) return;
        
        // Ensure video preview is visible for output display
        if (videoDropzone) videoDropzone.style.display = 'none';
        videoPreview.style.display = 'block';
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
        
        // Initialize output video player
        if ((window as any).initOutputVideoPlayer) {
          (window as any).initOutputVideoPlayer();
        }
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


  // Set up button event listeners - matching main branch behavior
  useEffect(() => {
    if (activeTab !== "sources") return;
    
    const setupButtonListeners = () => {
      // Video upload button
      const videoUploadBtn = document.querySelector('button[data-action="video-upload"]') as HTMLButtonElement;
      if (videoUploadBtn) {
        videoUploadBtn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          if ((window as any).selectVideo) {
            (window as any).selectVideo();
          }
        };
      }
      
      // Audio upload button
      const audioUploadBtn = document.querySelector('button[data-action="audio-upload"]') as HTMLButtonElement;
      if (audioUploadBtn) {
        audioUploadBtn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          if ((window as any).selectAudio) {
            (window as any).selectAudio();
          }
        };
      }
      
      // Video use in/out button
      const videoInOutBtn = document.querySelector('button[data-action="video-inout"]') as HTMLButtonElement;
      if (videoInOutBtn) {
        videoInOutBtn.onclick = async (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (nle?.exportInOutVideo) {
            const result = await nle.exportInOutVideo({ codec: "h264" });
            if (result?.ok && result?.path) {
              if ((window as any).selectVideo) {
                await (window as any).selectVideo();
              }
            } else if (result?.error && (window as any).showToast) {
              (window as any).showToast(result.error, "error");
            }
          }
        };
      }
      
      // Audio use in/out button
      const audioInOutBtn = document.querySelector('button[data-action="audio-inout"]') as HTMLButtonElement;
      if (audioInOutBtn) {
        audioInOutBtn.onclick = async (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (nle?.exportInOutAudio) {
            const result = await nle.exportInOutAudio({ format: "wav" });
            if (result?.ok && result?.path) {
              if ((window as any).selectAudio) {
                await (window as any).selectAudio();
              }
            } else if (result?.error && (window as any).showToast) {
              (window as any).showToast(result.error, "error");
            }
          }
        };
      }
      
      // Video record button
      const videoRecordBtn = document.querySelector('button[data-action="video-record"]') as HTMLButtonElement;
      if (videoRecordBtn) {
        videoRecordBtn.onclick = async (e) => {
          e.preventDefault();
          e.stopPropagation();
          if ((window as any).startVideoRecording) {
            await (window as any).startVideoRecording();
          }
        };
      }
      
      // Audio record button
      const audioRecordBtn = document.querySelector('button[data-action="audio-record"]') as HTMLButtonElement;
      if (audioRecordBtn) {
        audioRecordBtn.onclick = async (e) => {
          e.preventDefault();
          e.stopPropagation();
          if ((window as any).startAudioRecording) {
            await (window as any).startAudioRecording();
          }
        };
      }
      
      // Video link button
      const videoLinkBtn = document.querySelector('button[data-action="video-link"]') as HTMLButtonElement;
      if (videoLinkBtn) {
        videoLinkBtn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          if ((window as any).selectVideoUrl) {
            (window as any).selectVideoUrl();
          }
        };
      }
      
      // Audio link button
      const audioLinkBtn = document.querySelector('button[data-action="audio-link"]') as HTMLButtonElement;
      if (audioLinkBtn) {
        audioLinkBtn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          if ((window as any).selectAudioUrl) {
            (window as any).selectAudioUrl();
          }
        };
      }
    };
    
    // Set up listeners after a short delay to ensure DOM is ready
    const timer = setTimeout(() => {
      setupButtonListeners();
      if ((window as any).lucide && (window as any).lucide.createIcons) {
        (window as any).lucide.createIcons();
      }
    }, 100);
    
    return () => clearTimeout(timer);
  }, [activeTab, nle, selection]);
  
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
                  <button type="button" draggable="false" className="action-btn" data-action="video-upload">
                    <Upload size={16} />
                    <span>upload</span>
                  </button>
                  <button type="button" draggable="false" className="action-btn" data-action="video-inout">
                    <MousePointerSquareDashed size={16} />
                    <span>use in/out</span>
                  </button>
                </div>
                <div className="action-row">
                  <button type="button" draggable="false" className={`action-btn ${isRecording && recordingType === "video" ? "recording" : ""}`} data-action="video-record">
                    <Webcam size={16} />
                    <span>{isRecording && recordingType === "video" ? "stop" : "record"}</span>
                  </button>
                  <button type="button" draggable="false" className="action-btn" data-action="video-link">
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
                        (window as any).selectedVideoUrl = videoUrlValue.trim();
                        (window as any).selectedVideoIsUrl = true;
                        setVideoPath(data.path);
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
                      }
                    } catch (_) {}
                  }}>
                    <DownloadCloud size={20} />
                  </button>
                </div>
              </div>
            </div>
            {(selection.video || selection.videoUrl) && (
              <div id="videoPreview" style={{ display: "flex" }}>
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
            )}
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
                onVoiceSelectClick={() => setTtsVoiceSelectorOpen(true)}
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
                  <button type="button" draggable="false" className="action-btn" data-action="audio-upload">
                    <Upload size={16} />
                    <span>upload</span>
                  </button>
                  <button type="button" draggable="false" className="action-btn" data-action="audio-inout">
                    <MousePointerSquareDashed size={16} />
                    <span>use in/out</span>
                  </button>
                </div>
                <div className="action-row">
                  <button type="button" draggable="false" className={`action-btn ${isRecording && recordingType === "audio" ? "recording" : ""}`} data-action="audio-record">
                    <Mic size={16} />
                    <span>{isRecording && recordingType === "audio" ? "stop" : "record"}</span>
                  </button>
                  <button type="button" draggable="false" className="action-btn" data-action="audio-link">
                    <Link size={16} />
                    <span>link url</span>
                  </button>
                </div>
                <div className="action-row">
                  <button type="button" draggable="false" className="action-btn" data-action="audio-from-video" onClick={async (e) => { e.preventDefault(); e.stopPropagation(); if (!selection.video && !selection.videoUrl) return; try { const videoPath = selection.video || selection.videoUrl; if (!videoPath) return; const response = await fetch(getApiUrl("/audio/extract"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ videoPath, format: "wav" }), }); const data = await response.json().catch(() => null); if (response.ok && data?.ok && data?.path) { await selectAudio(); } } catch (error) { console.error("Error extracting audio from video:", error); } }}>
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
                        (window as any).selectedAudioUrl = audioUrlValue.trim();
                        (window as any).selectedAudioIsUrl = true;
                        setAudioPath(data.path);
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
      <TTSVoiceSelector isOpen={ttsVoiceSelectorOpen} onClose={() => setTtsVoiceSelectorOpen(false)} />
    </>
  );
};

export default SourcesTab;
