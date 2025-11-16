import React, { useState, useEffect, useRef, memo } from "react";
import { Upload, MousePointerSquareDashed, Webcam, Link, Mic, TextSelect, FileVideo2, FileVideo, Clapperboard, FileAudio, AudioLines, Play, Trash2, Search, ArrowRight, Languages, X, DownloadCloud, CircleFadingPlus, WifiOff } from "lucide-react";
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
import { showToast, ToastMessages } from "../utils/toast";
import { renderIconAsHTML } from "../utils/iconUtils";
import { getStorageItem } from "../utils/storage";
import { STORAGE_KEYS, DELAYS } from "../utils/constants";
import { parseJsonResponse } from "../utils/fetchUtils";
import { debugLog, debugError } from "../utils/debugLog";
import { formatTime } from "../utils/stringUtils";

const SourcesTab: React.FC = () => {
  const { selection, selectVideo, selectAudio, clearVideo, clearAudio, setVideoPath, setAudioPath } = useMedia();
  const { isRecording, recordingType, startRecording, stopRecording } = useRecording();
  const { nle } = useNLE();
  const { activeTab, setActiveTab } = useTabs();
  const { settings } = useSettings();
  const { serverState } = useCore();
  const [, setUrlInputMode] = useState<"video" | "audio" | null>(null);
  const [videoUrlValue, setVideoUrlValue] = useState("");
  const [audioUrlValue, setAudioUrlValue] = useState("");
  const [ttsInterfaceOpen, setTtsInterfaceOpen] = useState(false);
  const [ttsVoiceSelectorOpen, setTtsVoiceSelectorOpen] = useState(false);
  const [ttsVoiceCloneModalOpen, setTtsVoiceCloneModalOpen] = useState(false);
  const isOffline = serverState?.isOffline || false;
  
  const readyForLipsyncShownRef = useRef<number>(0);

  useDragAndDrop({
    onVideoSelected: setVideoPath,
    onAudioSelected: setAudioPath,
  });
  const videoSrc = (selection.video || selection.videoUrl) 
    ? (selection.videoIsUrl && selection.videoUrl ? selection.videoUrl : (selection.video ? selection.video : null))
    : null;
  
  // Debug logging for video source
  useEffect(() => {
    debugLog('[SourcesTab] videoSrc changed', {
      videoSrc,
      hasVideo: !!selection.video,
      hasVideoUrl: !!selection.videoUrl,
      videoIsUrl: selection.videoIsUrl,
      video: selection.video,
      videoUrl: selection.videoUrl,
    });
  }, [videoSrc, selection.video, selection.videoUrl, selection.videoIsUrl]);
  
  useVideoPlayer(videoSrc);

  // Initialize audio player
  const audioSrc = (selection.audio || selection.audioUrl)
    ? (selection.audioIsUrl && selection.audioUrl ? selection.audioUrl : (selection.audio ? selection.audio : null))
    : null;
  useAudioPlayer(audioSrc);

  useEffect(() => {
    const hasVideoReady = (selection.videoIsUrl && selection.videoUrl) || 
      (selection.video && !selection.videoIsUrl && ((window as any).uploadedVideoUrl || getStorageItem<string>(STORAGE_KEYS.UPLOADED_VIDEO_URL)));
    
    const hasAudioReady = (selection.audioIsUrl && selection.audioUrl) || 
      (selection.audio && !selection.audioIsUrl && ((window as any).uploadedAudioUrl || getStorageItem<string>(STORAGE_KEYS.UPLOADED_AUDIO_URL)));
    
    if (hasVideoReady && hasAudioReady) {
      const now = Date.now();
      const timeSinceLastShown = now - readyForLipsyncShownRef.current;
      if (timeSinceLastShown > 3000) {
        if (typeof (window as any).updateInputStatus === "function") {
          (window as any).updateInputStatus();
        }
      }
    }
  }, [selection.video, selection.videoUrl, selection.videoIsUrl, selection.audio, selection.audioUrl, selection.audioIsUrl]);

  useEffect(() => {
    (window as any).setVideoPath = setVideoPath;
    (window as any).setAudioPath = setAudioPath;
    
    (window as any).updateLipsyncButton = () => {
      const btn = document.getElementById("lipsyncBtn");
      if (!btn) return;
      
      const hasVideoReady = (selection.videoIsUrl && selection.videoUrl) || 
        (selection.video && !selection.videoIsUrl && ((window as any).uploadedVideoUrl || getStorageItem<string>(STORAGE_KEYS.UPLOADED_VIDEO_URL)));
      
      const hasAudioReady = (selection.audioIsUrl && selection.audioUrl) || 
        (selection.audio && !selection.audioIsUrl && ((window as any).uploadedAudioUrl || getStorageItem<string>(STORAGE_KEYS.UPLOADED_AUDIO_URL)));
      
      (btn as HTMLButtonElement).disabled = !(hasVideoReady && hasAudioReady);
    };

    (window as any).renderInputPreview = (source?: string) => {
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

    (window as any).updateInputStatus = () => {
      const status = document.getElementById("statusMessage");
      if (status) {
        status.textContent = "";
      }
      const now = Date.now();
      const timeSinceLastShown = now - readyForLipsyncShownRef.current;
      if ((selection.video || selection.videoUrl) && (selection.audio || selection.audioUrl)) {
        if (timeSinceLastShown > 3000) {
          showToast(ToastMessages.READY_FOR_LIPSYNC, "success");
          readyForLipsyncShownRef.current = now;
        }
      }
    };

    (window as any).selectVideo = selectVideo;
    (window as any).selectVideoInOut = async () => {
      if (nle?.exportInOutVideo) {
        let codec = "h264";
        if (settings.renderVideo === "mp4" || settings.renderVideo === "h264") {
          codec = "h264";
        } else if (settings.renderVideo === "prores_422") {
          codec = "prores_422";
        } else if (settings.renderVideo === "prores_422hq") {
          codec = "prores_422hq";
        }
        
        // Show loading toast immediately - keep showing until URL is ready
        showToast(ToastMessages.LOADING, "info");
        
        const result = await nle.exportInOutVideo({ codec });
        if (result?.ok && result?.path) {
          // setVideoPath will show loading overlay and handle upload
          // Video preview stays visible with loading state
          await setVideoPath(result.path);
          
          // Update UI state after upload completes
          if (typeof (window as any).updateLipsyncButton === "function") {
            (window as any).updateLipsyncButton();
          }
          if (typeof (window as any).renderInputPreview === "function") {
            (window as any).renderInputPreview("inout");
          }
        } else if (result?.error) {
          // Show error toast
          showToast(result.error, "error");
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
          setTimeout(() => { videoUploadVisual.style.display = 'none'; }, DELAYS.UPLOAD_VISUAL_HIDE);
        }
        if (videoUploadActions) {
          videoUploadActions.style.transition = 'opacity 0.2s ease';
          videoUploadActions.style.opacity = '0';
          setTimeout(() => { videoUploadActions.style.display = 'none'; }, DELAYS.UPLOAD_VISUAL_HIDE);
        }
        if (videoDropzone) videoDropzone.classList.add('url-input-mode');
        if (videoUrlInput) {
          videoUrlInput.style.display = 'flex';
          setTimeout(() => {
            videoUrlInput.classList.add('show');
            const field = document.getElementById('videoUrlField') as HTMLInputElement;
            if (field) {
              setTimeout(() => field.focus(), DELAYS.FOCUS);
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
                  ${renderIconAsHTML("x", { size: 24 })}
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
                videoDropzone.style.display = 'flex';
                videoPreview.style.display = 'none';
                videoSection.classList.remove('recording');
                const video = document.getElementById('videoRecordPreview') as HTMLVideoElement;
                if (video) video.srcObject = null;
              });
            }
          }
          
          await startRecording("video");
          
          setTimeout(() => {
            const video = document.getElementById('videoRecordPreview') as HTMLVideoElement;
            if (video && (window as any).__recordingStream) {
              video.srcObject = (window as any).__recordingStream;
            }
          }, 300);
        } catch (error) {
          debugLog('Video recording error', error);
          const videoSection = document.getElementById('videoSection');
          const videoDropzone = document.getElementById('videoDropzone');
          const videoPreview = document.getElementById('videoPreview');
          if (videoDropzone) videoDropzone.style.display = 'flex';
          if (videoPreview) videoPreview.style.display = 'none';
          if (videoSection) videoSection.classList.remove('recording');
        }
    };

    (window as any).selectAudio = selectAudio;
    (window as any).selectAudioInOut = async () => {
      debugLog('[SourcesTab] selectAudioInOut called', { 
        hasNLE: !!nle, 
        hasExportInOutAudio: !!nle?.exportInOutAudio 
      });
      
      if (nle?.exportInOutAudio) {
        // Use settings.renderAudio directly (wav or mp3)
        const format = settings.renderAudio || "wav";
        
        try {
          // Show loading toast immediately (matches main branch)
          showToast(ToastMessages.LOADING, "info");
          debugLog('[SourcesTab] Calling exportInOutAudio', { format });
          const result = await nle.exportInOutAudio({ format });
          debugLog('[SourcesTab] exportInOutAudio returned', { 
            result, 
            hasOk: result?.ok, 
            hasPath: !!result?.path,
            hasError: !!result?.error,
            resultKeys: result ? Object.keys(result) : []
          });
          
          if (result?.ok && result?.path) {
            debugLog('[SourcesTab] Export successful, calling selectAudio', { path: result.path });
            // Set the path directly instead of opening file dialog
            await setAudioPath(result.path);
            
            // Update UI state
            if (typeof (window as any).updateLipsyncButton === "function") {
              (window as any).updateLipsyncButton();
            }
            if (typeof (window as any).renderInputPreview === "function") {
              (window as any).renderInputPreview("inout");
            }
            // Don't call updateInputStatus here - useEffect will handle it when state changes
          } else if (result?.error) {
            debugLog('[SourcesTab] Export error', { error: result.error });
            // Show error toast
            showToast(result.error, "error");
          } else {
            debugLog('[SourcesTab] Export completed but no path or error', { result });
          }
        } catch (error) {
          debugLog('[SourcesTab] exportInOutAudio exception', error);
          showToast(ToastMessages.EXPORT_FAILED((error as Error).message), "error");
        }
      } else {
        debugLog('[SourcesTab] exportInOutAudio not available', { hasNLE: !!nle });
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
          setTimeout(() => { audioUploadVisual.style.display = 'none'; }, DELAYS.UPLOAD_VISUAL_HIDE);
        }
        if (audioUploadActions) {
          audioUploadActions.style.transition = 'opacity 0.2s ease';
          audioUploadActions.style.opacity = '0';
          setTimeout(() => { audioUploadActions.style.display = 'none'; }, DELAYS.UPLOAD_VISUAL_HIDE);
        }
        if (audioDropzone) audioDropzone.classList.add('url-input-mode');
        if (audioUrlInput) {
          audioUrlInput.style.display = 'flex';
          setTimeout(() => {
            audioUrlInput.classList.add('show');
            const field = document.getElementById('audioUrlField') as HTMLInputElement;
            if (field) {
              setTimeout(() => field.focus(), DELAYS.FOCUS);
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
                  ${renderIconAsHTML("x", { size: 24 })}
                </button>
              </div>
            `;
            
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
          debugLog('Audio recording error', error);
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
        // Show extracting toast at the start
        showToast(ToastMessages.EXTRACTING_AUDIO, "info");
        
        const videoPath = selection.video;
        const videoUrl = selection.videoUrl;
        
        if (!videoPath && !videoUrl) return;

        const response = await fetch(getApiUrl("/extract-audio"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ videoPath, videoUrl, format: "wav" }),
        });

        const data = await parseJsonResponse<{ ok?: boolean; audioPath?: string; error?: string }>(response);
        if (response.ok && data?.ok && data?.audioPath) {
          await setAudioPath(data.audioPath);
          
          // Update UI state
          if (typeof (window as any).updateLipsyncButton === "function") {
            (window as any).updateLipsyncButton();
          }
          if (typeof (window as any).renderInputPreview === "function") {
            (window as any).renderInputPreview("extract-audio");
          }
          // Don't call updateInputStatus here - useEffect will handle it when state changes
          
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
        debugLog("Error extracting audio from video", error);
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
    (window as any).setTtsInterfaceOpen = setTtsInterfaceOpen;
    (window as any).setActiveTab = setActiveTab;
    (window as any).settings = settings;

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
            <button class="post-action-btn" id="save-${job.id}">
              ${renderIconAsHTML("cloud-download", { size: 16 })}
              <span>save</span>
            </button>
            <button class="post-action-btn" id="insert-${job.id}">
              ${renderIconAsHTML("arrow-right-to-line", { size: 16 })}
              <span>insert</span>
            </button>
          </div>
          <div class="post-lipsync-actions-right">
            <button class="post-action-btn-icon" id="copy-link-${job.id}" title="copy output link">
              ${renderIconAsHTML("link", { size: 16 })}
            </button>
            <button class="post-action-btn-icon" id="copy-id-${job.syncJobId || job.id}" title="copy job id">
              <span class="post-action-btn-id-text">id</span>
            </button>
            <button class="post-action-btn-icon" id="clear-completed" title="clear">
              ${renderIconAsHTML("eraser", { size: 16 })}
            </button>
          </div>
        </div>`;
      
      // Insert as sibling after videoSection
      videoSection.insertAdjacentHTML('afterend', actionsHtml);
      
      // Attach event listeners to buttons
      const saveBtn = document.getElementById(`save-${job.id}`);
      const insertBtn = document.getElementById(`insert-${job.id}`);
      const copyLinkBtn = document.getElementById(`copy-link-${job.id}`);
      const copyIdBtn = document.getElementById(`copy-id-${job.syncJobId || job.id}`);
      const clearBtn = document.getElementById('clear-completed');
      
      if (saveBtn) {
        saveBtn.addEventListener('click', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (typeof (window as any).saveCompletedJob === 'function') {
            await (window as any).saveCompletedJob(job.id);
          } else {
            showToast(ToastMessages.SAVE_FUNCTION_NOT_AVAILABLE, "error");
          }
        });
      }
      
      if (insertBtn) {
        insertBtn.addEventListener('click', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (typeof (window as any).insertCompletedJob === 'function') {
            await (window as any).insertCompletedJob(job.id);
          } else {
            showToast(ToastMessages.INSERT_FUNCTION_NOT_AVAILABLE, "error");
          }
        });
      }
      
      if (copyLinkBtn) {
        copyLinkBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (typeof (window as any).copyOutputLink === 'function') {
            (window as any).copyOutputLink(job.id);
          }
        });
      }
      
      if (copyIdBtn) {
        copyIdBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (typeof (window as any).copyJobId === 'function') {
            (window as any).copyJobId(job.syncJobId || job.id);
          }
        });
      }
      
      if (clearBtn) {
        clearBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (typeof (window as any).clearCompletedJob === 'function') {
            (window as any).clearCompletedJob();
          }
        });
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
  // Use refs to store handlers so they don't get recreated on every render
  const handleClickRef = useRef<((e: MouseEvent) => void) | null>(null);
  
  // Note: Video src is now managed entirely by React's src prop
  // The useVideoPlayer hook handles initialization and event listeners
  // No need for direct DOM manipulation here
  
  // Force metadata loading for URL-based videos (preload="auto" alone isn't always enough)
  useEffect(() => {
    if (!selection.videoIsUrl || !selection.videoUrl) return;
    
      const video = document.getElementById('mainVideo') as HTMLVideoElement;
    if (!video) return;
    
    // Check if src is already set and matches
    const expectedSrc = selection.videoUrl;
    if (video.src === expectedSrc && video.readyState >= 1) {
      // Already loaded metadata - ensure we're at the start
      if (video.currentTime > 0 && video.paused) {
        video.currentTime = 0;
      }
      // Ensure play overlay is visible
      const playOverlay = document.getElementById('videoPlayOverlay');
      if (playOverlay && video.paused) {
        playOverlay.classList.remove('hidden');
      }
        return;
      }
      
    // Ensure src is set - reset currentTime when src changes
    if (video.src !== expectedSrc) {
      video.pause();
      video.currentTime = 0;
      video.src = expectedSrc;
    }
    
    // Only force load if video has no data - don't reset if player is already initialized
    if (video.readyState === 0) {
      debugLog('[SourcesTab] Forcing metadata load for URL-based video', {
        src: video.src.substring(0, 100) + '...',
        readyState: video.readyState,
      });
      // Set preload before loading
      video.preload = 'auto';
      video.load();
        
      // Reset to start when metadata loads
      const onLoadedMetadata = () => {
        video.currentTime = 0;
        video.removeEventListener('loadedmetadata', onLoadedMetadata);
      };
      video.addEventListener('loadedmetadata', onLoadedMetadata, { once: true });
      
      // Ensure play overlay is visible after load
      const playOverlay = document.getElementById('videoPlayOverlay');
      if (playOverlay) {
        playOverlay.classList.remove('hidden');
      }
    }
  }, [selection.videoIsUrl, selection.videoUrl]);
  
  // Force metadata loading for audio (both local and URL-based)
  useEffect(() => {
    const audio = document.getElementById('audioPlayer') as HTMLAudioElement;
    if (!audio) return;
    
    let expectedSrc = '';
    if (selection.audioIsUrl && selection.audioUrl) {
      expectedSrc = selection.audioUrl;
    } else if (selection.audio) {
      const ext = selection.audio.toLowerCase().split('.').pop();
      const route = ext === 'mp3' ? '/mp3/file' : '/wav/file';
      const encodedPath = encodeURIComponent(selection.audio);
      expectedSrc = getApiUrl(`${route}?path=${encodedPath}`);
    }
    
    if (!expectedSrc) return;
        
    // Update duration display function
    const updateDurationDisplay = () => {
      const timeDisplay = document.getElementById('audioTime');
      if (!timeDisplay) return;
      
      const duration = audio.duration || 0;
      const currentTime = audio.currentTime || 0;
      const durationStr = (duration && isFinite(duration) && duration > 0) 
        ? formatTime(duration) 
        : '--';
      const currentStr = formatTime(currentTime);
      timeDisplay.innerHTML = `<span class="time-current">${currentStr}</span> <span class="time-total">/ ${durationStr}</span>`;
        
      debugLog('[SourcesTab] Audio duration display updated', {
        duration,
        currentTime,
        durationStr,
        readyState: audio.readyState,
        });
    };
    
    // Check if src is already set and matches
    if (audio.src === expectedSrc && audio.readyState >= 1) {
      // Already loaded metadata - ensure we're at the start
      if (audio.currentTime > 0 && audio.paused) {
        audio.currentTime = 0;
      }
      updateDurationDisplay();
      return;
    }
    
    // Ensure src is set - reset currentTime when src changes
    if (audio.src !== expectedSrc) {
      audio.pause();
      audio.currentTime = 0;
      audio.src = expectedSrc;
        }
        
    // Attach metadata listeners BEFORE calling load()
    const onLoadedMetadata = () => {
      // Reset to start when metadata loads
      audio.currentTime = 0;
      updateDurationDisplay();
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('durationchange', onDurationChange);
    };
    
    const onDurationChange = () => {
      updateDurationDisplay();
    };
    
    audio.addEventListener('loadedmetadata', onLoadedMetadata, { once: true });
    audio.addEventListener('durationchange', onDurationChange);
    
    // Force load to trigger metadata loading
    if (audio.readyState === 0) {
      debugLog('[SourcesTab] Forcing metadata load for audio', {
        src: audio.src.substring(0, 100) + '...',
        readyState: audio.readyState,
        audioIsUrl: selection.audioIsUrl,
        hasAudio: !!selection.audio,
        hasAudioUrl: !!selection.audioUrl,
      });
      audio.load();
    } else {
      // Metadata might already be loading, check again after a short delay
      setTimeout(() => {
        if (audio.readyState >= 1 && audio.duration > 0) {
          audio.currentTime = 0; // Ensure we're at start
          updateDurationDisplay();
        }
      }, 100);
    }
    
    // Cleanup
    return () => {
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('durationchange', onDurationChange);
    };
  }, [selection.audio, selection.audioIsUrl, selection.audioUrl]);
  
  useEffect(() => {
    if (activeTab !== "sources") {
      // Clean up handlers when tab is not active
      if (handleClickRef.current) {
        const sourcesContainer = document.getElementById('sources');
        if (sourcesContainer) {
          sourcesContainer.removeEventListener('click', handleClickRef.current, false);
        }
        handleClickRef.current = null;
      }
      return;
    }
    
    let cleanupHandlers: (() => void) | null = null;
    let sourcesContainer: HTMLElement | null = null;
    
    // Wait for tab to be visible and DOM to be ready
    const setupHandlers = () => {
      sourcesContainer = document.getElementById('sources');
      if (!sourcesContainer) {
        return false;
      }
      
      // Check if tab is actually visible
      const isVisible = sourcesContainer.classList.contains('active') && 
                        window.getComputedStyle(sourcesContainer).display !== 'none';
      if (!isVisible) {
        return false;
      }
      
      return true;
    };
    
    const attachHandlers = () => {
      sourcesContainer = document.getElementById('sources');
      if (!sourcesContainer) {
        return;
      }
      
      // Remove old handlers if they exist
      if (handleClickRef.current) {
        sourcesContainer.removeEventListener('click', handleClickRef.current, false);
      }
    
      const handleClick = async (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        
        // Skip clicks on video/audio player elements - let their own handlers work
        const videoPlayerSelectors = ['.custom-video-player', '#mainVideo', '#videoPlayOverlay', '.video-controls', '.video-progress-bar', '.video-progress-container', '#centerPlayBtn', '#volumeBtn', '#volumeSlider', '#videoTime', '#videoFrameInfo'];
        const audioPlayerSelectors = ['.custom-audio-player', '#audioPlayer', '#audioPlayBtn', '.audio-waveform-container', '#waveformCanvas', '#audioTime', '.dubbing-dropdown-wrapper', '#dubbingBtn', '#dubbingSubmitBtn', '#dubbingDropdown'];
        
        const isVideoPlayerElement = videoPlayerSelectors.some(selector => target.closest(selector));
        const isAudioPlayerElement = audioPlayerSelectors.some(selector => target.closest(selector));
        
        if (isVideoPlayerElement || isAudioPlayerElement) {
          // Let video/audio player handlers handle these clicks
          return;
        }
        
        // Check if click is on a button or inside a button
        let button = target.closest('button[data-action]') as HTMLButtonElement;
        if (!button) {
          const anyButton = target.closest('button') as HTMLButtonElement;
          if (anyButton && anyButton.hasAttribute('data-action')) {
            button = anyButton;
          }
        }
        if (!button && target.tagName === 'BUTTON' && target.hasAttribute('data-action')) {
          button = target as HTMLButtonElement;
        }
        
        if (!button || button.disabled) {
          return;
        }
        
        // Skip buttons that have React onClick handlers (they handle their own clicks)
        if ((button as any)._reactInternalFiber || (button as any).onclick || 
            (button as any).__reactInternalInstance || button.hasAttribute('onclick')) {
          return;
        }
        
        const action = button.getAttribute('data-action');
        if (!action) {
          return;
        }
        
        e.preventDefault();
        e.stopPropagation();
        
        try {
          switch (action) {
            case 'video-upload':
              if (typeof (window as any).selectVideo === 'function') {
                await (window as any).selectVideo();
              }
              break;
            case 'audio-upload':
              if (typeof (window as any).selectAudio === 'function') {
                await (window as any).selectAudio();
              }
              break;
            case 'video-record':
              if ((window as any).startVideoRecording) {
                await (window as any).startVideoRecording();
              }
              break;
            case 'audio-record':
              if ((window as any).startAudioRecording) {
                await (window as any).startAudioRecording();
              }
              break;
            case 'video-link':
              if ((window as any).selectVideoUrl) {
                (window as any).selectVideoUrl();
              }
              break;
            case 'audio-link':
              if ((window as any).selectAudioUrl) {
                (window as any).selectAudioUrl();
              }
              break;
            case 'audio-from-video':
              if ((window as any).selectAudioFromVideo) {
                await (window as any).selectAudioFromVideo();
              }
              break;
            case 'audio-tts':
              if ((window as any).TTSInterface && (window as any).TTSInterface.show) {
                (window as any).TTSInterface.show();
              } else if ((window as any).setTtsInterfaceOpen) {
                // Fallback: check if API key is set
                const settings = (window as any).settings || {};
                if (!settings.elevenlabsApiKey || !settings.elevenlabsApiKey.trim()) {
                  if ((window as any).showToast) {
                    const toast = document.createElement("div");
                    toast.className = "history-toast history-toast-info";
                    toast.innerHTML = 'please set your elevenlabs api key <a href="#" style="color: var(--color-primary); text-decoration: underline; cursor: pointer;">here</a>';
                    const link = toast.querySelector('a');
                    if (link) {
                      link.addEventListener('click', (ev) => {
                        ev.preventDefault();
                        if ((window as any).setActiveTab) {
                          (window as any).setActiveTab('settings');
                        }
                        setTimeout(() => {
                          if (toast.parentNode) {
                            toast.parentNode.removeChild(toast);
                          }
                        }, 100);
                      });
                    }
                    document.body.appendChild(toast);
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
                // Use React state setter via window
                (window as any).setTtsInterfaceOpen(true);
              }
              break;
            case 'video-inout':
              if ((window as any).selectVideoInOut) {
                await (window as any).selectVideoInOut();
              }
              break;
            case 'audio-inout':
              if ((window as any).selectAudioInOut) {
                await (window as any).selectAudioInOut();
              }
              break;
          }
        } catch (error) {
          debugLog('[SourcesTab] Error handling action', { action, error });
        }
      };
      
      // Store handler in ref so it persists
      handleClickRef.current = handleClick;
      
      // Use bubbling phase (not capture) to allow player handlers to run first
      sourcesContainer.addEventListener('click', handleClick, false);
      
      cleanupHandlers = () => {
        if (sourcesContainer && handleClickRef.current) {
          sourcesContainer.removeEventListener('click', handleClickRef.current, false);
        }
        handleClickRef.current = null;
      };
    };
    
    // Try immediately, then retry if needed
    let retries = 0;
    const maxRetries = 10;
    const trySetup = () => {
      if (setupHandlers()) {
        attachHandlers();
      } else if (retries < maxRetries) {
        retries++;
        setTimeout(trySetup, DELAYS.SETUP_RETRY);
      } else {
        debugLog('[SourcesTab] Failed to setup handlers after max retries');
      }
    };
    
    trySetup();
    
    // Set up a MutationObserver to watch for DOM changes
    const observer = new MutationObserver(() => {
      // Handlers work with event delegation, so no action needed
    });
    
    const sourcesContainerForObserver = document.getElementById('sources');
    if (sourcesContainerForObserver) {
      observer.observe(sourcesContainerForObserver, { childList: true, subtree: true });
    }
    
    return () => {
      observer.disconnect();
      if (cleanupHandlers) {
        cleanupHandlers();
      }
    };
  }, [activeTab]); // Only depend on activeTab - functions are accessed from window

  return (
    <>
      <div id="sources" className={`tab-pane ${activeTab === "sources" ? "active" : ""}`}>
        {isOffline ? (
          <div className="offline-state">
            <div className="offline-icon">
              <WifiOff />
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
                      e.stopPropagation();
                      e.preventDefault();
                      try {
                        if (selectVideo) {
                          await selectVideo();
                        } else if (typeof (window as any).selectVideo === 'function') {
                          await (window as any).selectVideo();
                        }
                      } catch (error) {
                        debugLog('[SourcesTab] Error in video upload', error);
                        showToast(`Error opening file picker: ${(error as Error).message}`, 'error');
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
                  >
                    <MousePointerSquareDashed size={16} />
                    <span>in/out</span>
                  </button>
                </div>
                <div className="action-row">
                  <button 
                    type="button" 
                    draggable="false" 
                    className={`action-btn ${isRecording && recordingType === "video" ? "recording" : ""}`} 
                    data-action="video-record"
                  >
                    <Webcam size={16} />
                    <span>{isRecording && recordingType === "video" ? "stop" : "record"}</span>
                  </button>
                  <button 
                    type="button" 
                    draggable="false" 
                    className="action-btn" 
                    data-action="video-link"
                  >
                    <Link size={16} />
                    <span>from url</span>
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
                    const url = videoUrlValue.trim();
                    if (!url) return;
                    
                    // Show loading toast
                    showToast(ToastMessages.LOADING, "info");
                    
                    // Set URL selection directly (matches main branch - no download)
                    (window as any).selectedVideoUrl = url;
                    (window as any).selectedVideoIsUrl = true;
                    (window as any).selectedVideo = null; // Clear file selection
                    (window as any).selectedVideoIsTemp = false;
                    
                    // Update React state - pass null for path since we're using URL only
                    await setVideoPath(null as any, url);
                    
                    // Update UI state
                    if (typeof (window as any).updateLipsyncButton === "function") {
                      (window as any).updateLipsyncButton();
                    }
                    if (typeof (window as any).renderInputPreview === "function") {
                      (window as any).renderInputPreview("url-load");
                    }
                    // Don't call updateInputStatus here - useEffect will handle it when state changes
                    if (typeof (window as any).updateFromVideoButton === "function") {
                      (window as any).updateFromVideoButton();
                    }
                    
                    showToast(ToastMessages.VIDEO_URL_LOADED_SUCCESSFULLY, "success");
                    
                    setUrlInputMode(null);
                    setVideoUrlValue("");
                    
                    // Ensure dropzone is hidden before closing URL input
                    const videoDropzone = document.getElementById('videoDropzone');
                    const videoUploadVisual = document.getElementById('videoUploadVisual');
                    const videoUploadActions = document.getElementById('videoUploadActions');
                    if (videoDropzone) {
                      videoDropzone.style.display = 'none';
                      videoDropzone.classList.remove('url-input-mode');
                    }
                    if (videoUploadVisual) {
                      videoUploadVisual.style.display = 'none';
                    }
                    if (videoUploadActions) {
                      videoUploadActions.style.display = 'none';
                    }
                    
                    // Close URL input
                    const videoUrlInput = document.getElementById('videoUrlInput');
                    const videoSection = document.getElementById('videoSection');
                    if (videoUrlInput) {
                      videoUrlInput.classList.remove('show');
                      setTimeout(() => {
                        if (videoUrlInput) videoUrlInput.style.display = 'none';
                        if (videoSection) videoSection.classList.remove('url-input-active');
                      }, 200);
                    }
                  }}>
                    <DownloadCloud size={16} />
                  </button>
                </div>
              </div>
            </div>
            {/* Always render videoPreview so it's available for output videos from history */}
            {/* Show video when we have a video path or URL */}
            <div id="videoPreview" style={{ display: (selection.video || selection.videoUrl) ? "flex" : "none" }}>
              <div className="custom-video-player">
                <video 
                  id="mainVideo" 
                  className="video-element" 
                  src={(() => {
                    // CEP blocks file:// URLs (error code 4: MEDIA_ERR_SRC_NOT_SUPPORTED)
                    // Use HTTP proxy route instead, similar to /wav/file and /mp3/file
                    let computedSrc = '';
                    if (selection.videoIsUrl && selection.videoUrl) {
                      // Already an HTTP URL
                      computedSrc = selection.videoUrl;
                    } else if (selection.video) {
                      // Use server proxy route for local files (works in CEP)
                      const encodedPath = encodeURIComponent(selection.video);
                      computedSrc = getApiUrl(`/video/file?path=${encodedPath}`);
                    }
                    debugLog('[SourcesTab] Video src computed', {
                      computedSrc: computedSrc.substring(0, 100) + '...',
                      videoIsUrl: selection.videoIsUrl,
                      hasVideoUrl: !!selection.videoUrl,
                      hasVideo: !!selection.video,
                      video: selection.video,
                      videoUrl: selection.videoUrl?.substring(0, 100) + '...',
                    });
                    return computedSrc;
                  })()}
                  preload="auto" 
                  playsInline
                  onLoadStart={(e) => {
                    const video = e.target as HTMLVideoElement;
                    debugLog('[SourcesTab] Video onLoadStart', {
                      src: video.src,
                      currentSrc: video.currentSrc,
                      networkState: video.networkState,
                      readyState: video.readyState,
                      hasVideo: !!selection.video,
                      hasVideoUrl: !!selection.videoUrl,
                      videoIsUrl: selection.videoIsUrl,
                    });
                  }}
                  onLoadedMetadata={(e) => {
                    const video = e.target as HTMLVideoElement;
                    debugLog('[SourcesTab] Video onLoadedMetadata', {
                      duration: video.duration,
                      videoWidth: video.videoWidth,
                      videoHeight: video.videoHeight,
                      readyState: video.readyState,
                      networkState: video.networkState,
                      src: video.src,
                      currentSrc: video.currentSrc,
                      hasVideo: !!selection.video,
                      hasVideoUrl: !!selection.videoUrl,
                      videoIsUrl: selection.videoIsUrl,
                    });
                    if (!video.duration || video.duration === 0 || !isFinite(video.duration)) {
                      debugError('[SourcesTab] Video has invalid duration', {
                        duration: video.duration,
                        readyState: video.readyState,
                        networkState: video.networkState,
                        src: video.src,
                        error: video.error,
                      });
                    }
                  }}
                  onLoadedData={(e) => {
                    const video = e.target as HTMLVideoElement;
                    debugLog('[SourcesTab] Video onLoadedData', {
                      duration: video.duration,
                      readyState: video.readyState,
                      networkState: video.networkState,
                      src: video.src,
                    });
                  }}
                  onCanPlay={(e) => {
                    const video = e.target as HTMLVideoElement;
                    debugLog('[SourcesTab] Video onCanPlay', {
                      duration: video.duration,
                      readyState: video.readyState,
                      src: video.src,
                    });
                  }}
                  onError={(e) => {
                    const video = e.target as HTMLVideoElement;
                    const error = video.error;
                    // Extract error details immediately before they might be lost
                    const errorCode = error?.code;
                    const errorMessage = error?.message;
                    const MEDIA_ERR_ABORTED = error?.MEDIA_ERR_ABORTED;
                    const MEDIA_ERR_NETWORK = error?.MEDIA_ERR_NETWORK;
                    const MEDIA_ERR_DECODE = error?.MEDIA_ERR_DECODE;
                    const MEDIA_ERR_SRC_NOT_SUPPORTED = error?.MEDIA_ERR_SRC_NOT_SUPPORTED;
                    
                    // Log to console FIRST with full details
                    console.error('[SourcesTab] Video onError - FULL DETAILS:', {
                      error,
                      errorCode,
                      errorMessage,
                      MEDIA_ERR_ABORTED,
                      MEDIA_ERR_NETWORK,
                      MEDIA_ERR_DECODE,
                      MEDIA_ERR_SRC_NOT_SUPPORTED,
                      src: video.src,
                      currentSrc: video.currentSrc,
                      networkState: video.networkState,
                      readyState: video.readyState,
                    });
                    
                    // Then log via debugLog (debugError doesn't serialize objects properly)
                    debugLog('[SourcesTab] Video onError - DETAILS', {
                      errorCode,
                      errorMessage,
                      MEDIA_ERR_ABORTED,
                      MEDIA_ERR_NETWORK,
                      MEDIA_ERR_DECODE,
                      MEDIA_ERR_SRC_NOT_SUPPORTED,
                      src: video.src,
                      currentSrc: video.currentSrc,
                      networkState: video.networkState,
                      readyState: video.readyState,
                      hasVideo: !!selection.video,
                      hasVideoUrl: !!selection.videoUrl,
                      videoIsUrl: selection.videoIsUrl,
                      videoPreviewDisplay: window.getComputedStyle(document.getElementById('videoPreview') || document.body).display,
                    });
                  }}
                >
                  {selection.video && !selection.videoIsUrl && (
                    <source src={getApiUrl(`/video/file?path=${encodeURIComponent(selection.video)}`)} type="video/mp4" />
                  )}
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
                      <button className="video-control-btn video-delete-btn" onClick={() => {
                        clearVideo();
                        const videoDropzone = document.getElementById('videoDropzone');
                        const videoUploadVisual = document.getElementById('videoUploadVisual');
                        const videoUploadActions = document.getElementById('videoUploadActions');
                        const videoSection = document.getElementById('videoSection');
                        const videoPreview = document.getElementById('videoPreview');
                        const videoUrlInput = document.getElementById('videoUrlInput');
                        const audioSection = document.getElementById('audioSection');
                        
                        if (videoDropzone) {
                          videoDropzone.style.display = 'flex';
                          videoDropzone.classList.remove('url-input-mode');
                        }
                        if (videoUploadVisual) {
                          videoUploadVisual.style.display = 'flex';
                          videoUploadVisual.style.opacity = '1';
                        }
                        if (videoUploadActions) {
                          videoUploadActions.style.display = 'flex';
                          videoUploadActions.style.opacity = '1';
                        }
                        if (videoSection) {
                          videoSection.classList.remove('url-input-active', 'has-media');
                        }
                        if (videoPreview) {
                          videoPreview.style.display = 'none';
                        }
                        if (videoUrlInput) {
                          videoUrlInput.style.display = 'none';
                          videoUrlInput.classList.remove('show');
                        }
                        
                        if (audioSection && (selection.audio || selection.audioUrl)) {
                          audioSection.style.marginTop = '';
                          audioSection.style.marginBottom = '';
                          audioSection.style.position = '';
                          audioSection.style.bottom = '';
                        }
                        
                        setUrlInputMode(null);
                        setVideoUrlValue("");
                      }}>
                        <Trash2 size={16} />
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
                      e.stopPropagation();
                      e.preventDefault();
                      try {
                        if (selectAudio) {
                          await selectAudio();
                        } else if (typeof (window as any).selectAudio === 'function') {
                          await (window as any).selectAudio();
                        }
                      } catch (error) {
                        debugLog('[SourcesTab] Error in audio upload', error);
                        showToast(`Error opening file picker: ${(error as Error).message}`, 'error');
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
                  >
                    <MousePointerSquareDashed size={16} />
                    <span>in/out</span>
                  </button>
                </div>
                <div className="action-row">
                  <button type="button" draggable="false" className="action-btn" data-action="audio-tts">
                    <TextSelect size={16} />
                    <span>from text</span>
                  </button>
                  <button 
                    type="button" 
                    draggable="false" 
                    className="action-btn" 
                    data-action="audio-link"
                  >
                    <Link size={16} />
                    <span>from url</span>
                  </button>
                </div>
                <div className="action-row">
                  <button 
                    type="button" 
                    draggable="false" 
                    className={`action-btn ${isRecording && recordingType === "audio" ? "recording" : ""}`} 
                    data-action="audio-record"
                  >
                    <Mic size={16} />
                    <span>{isRecording && recordingType === "audio" ? "stop" : "record"}</span>
                  </button>
                  <button type="button" draggable="false" className="action-btn" data-action="audio-from-video">
                    <CircleFadingPlus size={16} />
                    <span>extract</span>
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
                    const url = audioUrlValue.trim();
                    if (!url) return;
                    
                    // Show loading toast
                    showToast(ToastMessages.LOADING, "info");
                    
                    // Set URL selection directly (matches main branch - no download)
                    (window as any).selectedAudioUrl = url;
                    (window as any).selectedAudioIsUrl = true;
                    (window as any).selectedAudio = null; // Clear file selection
                    (window as any).selectedAudioIsTemp = false;
                    
                    // Update React state - pass null for path since we're using URL only
                    await setAudioPath(null as any, url);
                    
                    // Update UI state
                    if (typeof (window as any).updateLipsyncButton === "function") {
                      (window as any).updateLipsyncButton();
                    }
                    if (typeof (window as any).renderInputPreview === "function") {
                      (window as any).renderInputPreview("url-load");
                    }
                    // Don't call updateInputStatus here - useEffect will handle it when state changes
                    
                    showToast(ToastMessages.AUDIO_URL_LOADED_SUCCESSFULLY, "success");
                    
                    setUrlInputMode(null);
                    setAudioUrlValue("");
                    
                    // Ensure dropzone is hidden before closing URL input
                    const audioDropzone = document.getElementById('audioDropzone');
                    const audioUploadVisual = document.getElementById('audioUploadVisual');
                    const audioUploadActions = document.getElementById('audioUploadActions');
                    if (audioDropzone) {
                      audioDropzone.style.display = 'none';
                      audioDropzone.classList.remove('url-input-mode');
                    }
                    if (audioUploadVisual) {
                      audioUploadVisual.style.display = 'none';
                    }
                    if (audioUploadActions) {
                      audioUploadActions.style.display = 'none';
                    }
                    
                    // Close URL input
                    const audioUrlInput = document.getElementById('audioUrlInput');
                    const audioSection = document.getElementById('audioSection');
                    if (audioUrlInput) {
                      audioUrlInput.classList.remove('show');
                      setTimeout(() => {
                        if (audioUrlInput) audioUrlInput.style.display = 'none';
                        if (audioSection) audioSection.classList.remove('url-input-active');
                      }, 200);
                    }
                  }}>
                    <DownloadCloud size={16} />
                  </button>
                </div>
              </div>
            {(selection.audio || selection.audioUrl) && (
              <div id="audioPreview" style={{ display: "flex" }}>
                <div className="custom-audio-player">
                  <audio 
                    id="audioPlayer" 
                    src={(() => {
                      // CEP blocks file:// URLs - use HTTP proxy route instead
                      if (selection.audioIsUrl && selection.audioUrl) {
                        // Already an HTTP URL
                        return selection.audioUrl;
                      } else if (selection.audio) {
                        // Use server proxy route for local files (works in CEP)
                        const ext = selection.audio.toLowerCase().split('.').pop();
                        const route = ext === 'mp3' ? '/mp3/file' : '/wav/file';
                        const encodedPath = encodeURIComponent(selection.audio);
                        return getApiUrl(`${route}?path=${encodedPath}`);
                      }
                      return '';
                    })()}
                    preload="auto"
                    onLoadedMetadata={(e) => {
                      if ((window as any).debugLog) {
                        (window as any).debugLog('[SourcesTab] Audio onLoadedMetadata', {
                          duration: (e.target as HTMLAudioElement).duration,
                          readyState: (e.target as HTMLAudioElement).readyState,
                          src: (e.target as HTMLAudioElement).src,
                        });
                      }
                    }}
                    onError={(e) => {
                      if ((window as any).debugError) {
                        (window as any).debugError('[SourcesTab] Audio onError', {
                          error: e,
                          src: (e.target as HTMLAudioElement).src,
                          networkState: (e.target as HTMLAudioElement).networkState,
                          errorCode: (e.target as HTMLAudioElement).error?.code,
                        });
                      }
                    }}
                  />
                  <button className="audio-play-btn" id="audioPlayBtn">
                    <Play size={16} />
                  </button>
                  <div className="audio-waveform-container">
                    <canvas id="waveformCanvas" className="waveform-canvas"></canvas>
                    <div className="audio-time" id="audioTime">0:00 / 0:00</div>
                  </div>
                  <div className="dubbing-dropdown-wrapper">
                    <button className="audio-dubbing-btn" id="dubbingBtn">
                      <Languages size={16} />
                      <span id="dubbingBtnText">dubbing</span>
                    </button>
                    <button className="audio-dubbing-submit-btn" id="dubbingSubmitBtn" style={{ display: "none" }}>
                      <ArrowRight size={16} />
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
                  <button className="audio-delete-btn" onClick={() => {
                    clearAudio();
                    const audioDropzone = document.getElementById('audioDropzone');
                    const audioUploadVisual = document.getElementById('audioUploadVisual');
                    const audioUploadActions = document.getElementById('audioUploadActions');
                    const audioSection = document.getElementById('audioSection');
                    const audioPreview = document.getElementById('audioPreview');
                    const audioUrlInput = document.getElementById('audioUrlInput');
                    
                    if (audioDropzone) {
                      audioDropzone.style.display = 'flex';
                      audioDropzone.classList.remove('url-input-mode');
                    }
                    if (audioUploadVisual) {
                      audioUploadVisual.style.display = 'flex';
                      audioUploadVisual.style.opacity = '1';
                    }
                    if (audioUploadActions) {
                      audioUploadActions.style.display = 'flex';
                      audioUploadActions.style.opacity = '1';
                    }
                    if (audioSection) {
                      audioSection.classList.remove('url-input-active', 'has-media');
                    }
                    if (audioPreview) {
                      audioPreview.style.display = 'none';
                    }
                    if (audioUrlInput) {
                      audioUrlInput.style.display = 'none';
                      audioUrlInput.classList.remove('show');
                    }
                    setUrlInputMode(null);
                    setAudioUrlValue("");
                  }}>
                    <Trash2 size={16} />
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
        onVoiceCreated={() => {
          // Voice is already selected in the modal
        }}
      />
    </>
  );
};

// Memoize SourcesTab to prevent unnecessary re-renders
export default memo(SourcesTab);
