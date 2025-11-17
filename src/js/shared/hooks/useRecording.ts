import { useState, useCallback, useRef, useEffect } from "react";
import { getApiUrl } from "../utils/serverConfig";
import { debugLog, debugError } from "../utils/debugLog";
import { showToast, ToastMessages } from "../utils/toast";
import { getSettings } from "../utils/storage";

export const useRecording = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingType, setRecordingType] = useState<"video" | "audio" | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioAnalyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const startRecording = useCallback(async (type: "video" | "audio") => {
    debugLog('[useRecording] startRecording called', { type, isRecording });
    try {
      debugLog('[useRecording] Requesting media access');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: type === "video" ? {
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
          frameRate: { ideal: 30, max: 60 }
        } : false,
        audio: type === "audio" ? {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: { ideal: 44100 },
          channelCount: { ideal: 1 }
        } : true,
      });

      mediaStreamRef.current = stream;
      // Expose stream globally for UI attachment
      (window as any).__recordingStream = stream;
      
      // Get CEP-compatible MediaRecorder options
      const getMediaRecorderOptions = (t: string) => {
        const options: any = {};
        if (t === 'video') {
          if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')) {
            options.mimeType = 'video/webm;codecs=vp8,opus';
          } else if (MediaRecorder.isTypeSupported('video/webm')) {
            options.mimeType = 'video/webm';
          } else if (MediaRecorder.isTypeSupported('video/mp4')) {
            options.mimeType = 'video/mp4';
          }
        } else if (t === 'audio') {
          if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
            options.mimeType = 'audio/webm;codecs=opus';
          } else if (MediaRecorder.isTypeSupported('audio/webm')) {
            options.mimeType = 'audio/webm';
          } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
            options.mimeType = 'audio/mp4';
          }
        }
        return options;
      };
      
      const mimeType = type === "video" ? "video/webm" : "audio/webm";
      const options = getMediaRecorderOptions(type);
      const recorder = new MediaRecorder(stream, options);

      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunks.push(e.data);
          debugLog('[useRecording] Data chunk received', { size: e.data.size, totalChunks: chunks.length });
        }
      };
      
      // Ensure we capture data even if stop is called quickly
      recorder.onerror = (e) => {
        debugError('[useRecording] MediaRecorder error', e);
      };

      recorder.onstop = async () => {
        // Request final data chunk before processing
        if (recorder.state !== 'inactive') {
          recorder.requestData();
        }
        setIsRecording(false);
        setRecordingType(null);
        
        // Clear timer
        if (timerIntervalRef.current) {
          clearInterval(timerIntervalRef.current);
          timerIntervalRef.current = null;
        }
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
        }
        if ((window as any).__stopAudioWaveform) {
          (window as any).__stopAudioWaveform();
          (window as any).__stopAudioWaveform = null;
        }
        if (audioContextRef.current) {
          audioContextRef.current.close();
          audioContextRef.current = null;
        }
        
        // Wait a bit for any remaining data to be captured (matches main branch)
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Check if we have any data
        if (chunks.length === 0) {
          debugError('[useRecording] No data chunks captured', { type, recorderState: recorder.state });
          showToast('Recording failed - no data captured. Please try again.', "error");
          return;
        }
        
        const blob = new Blob(chunks, { type: mimeType });
        
        // Check blob size
        if (blob.size === 0) {
          debugError('[useRecording] Empty blob created', { type, chunksLength: chunks.length });
          showToast('Recording failed - empty file. Please try again.', "error");
          return;
        }
        
        debugLog('[useRecording] Blob created', { size: blob.size, type, chunksLength: chunks.length });
        const url = URL.createObjectURL(blob);
        
        // Show loading toast immediately
        showToast(ToastMessages.LOADING, "info");
        
        // Determine file extension based on MIME type
        const extension = mimeType.includes('mp4') ? 'mp4' : 'webm';
        const fileName = `recording_${Date.now()}.${extension}`;
        
        // Save to server (will convert to mp4/wav)
        try {
          const formData = new FormData();
          formData.append("file", blob, fileName);
          formData.append("targetDir", "uploads");
          formData.append("type", type);
          
          const response = await fetch(getApiUrl("/recording/save"), {
            method: "POST",
            body: formData,
          });

          const data = await response.json().catch(() => null);
          if (response.ok && data?.ok && data?.path) {
            debugLog('[useRecording] Recording saved successfully', { path: data.path, type });
            
            // Set as selected media (matches main branch)
            if (type === "video") {
              (window as any).selectedVideo = data.path;
              (window as any).selectedVideoIsTemp = false;
              (window as any).selectedVideoIsUrl = false;
              (window as any).selectedVideoUrl = '';
            } else {
              (window as any).selectedAudio = data.path;
              (window as any).selectedAudioIsTemp = false;
              (window as any).selectedAudioIsUrl = false;
              (window as any).selectedAudioUrl = '';
            }
            
            // Upload to R2 separately (matches main branch)
            let r2Url: string | null = null;
            try {
              const settings = getSettings();
              if ((window as any).ensureAuthToken) {
                await (window as any).ensureAuthToken();
              }
              
              // Cancel any existing upload for this type
              const controllerKey = type === "video" ? "videoUploadController" : "audioUploadController";
              if ((window as any)[controllerKey]) {
                (window as any)[controllerKey].abort();
              }
              
              // Create new AbortController for this upload
              const controller = new AbortController();
              (window as any)[controllerKey] = controller;
              
              const uploadResponse = await fetch(getApiUrl("/upload"), {
                method: "POST",
                headers: (window as any).authHeaders ? (window as any).authHeaders({ "Content-Type": "application/json" }) : { "Content-Type": "application/json" },
                body: JSON.stringify({ path: data.path, syncApiKey: settings.syncApiKey || "" }),
                signal: controller.signal,
              });
              
              // Check if upload was aborted
              if (controller.signal.aborted) {
                return;
              }
              
              const uploadData = await uploadResponse.json().catch(() => null);
              if (uploadResponse.ok && uploadData?.ok && uploadData?.url) {
                // Check again if upload was aborted before updating state
                if (controller.signal.aborted) {
                  return;
                }
                r2Url = uploadData.url;
                if (type === "video") {
                  (window as any).selectedVideoUrl = uploadData.url;
                  (window as any).uploadedVideoUrl = uploadData.url;
                  localStorage.setItem('selectedVideoUrl', uploadData.url);
                  localStorage.setItem('uploadedVideoUrl', uploadData.url);
                } else {
                  (window as any).selectedAudioUrl = uploadData.url;
                  (window as any).uploadedAudioUrl = uploadData.url;
                  localStorage.setItem('selectedAudioUrl', uploadData.url);
                  localStorage.setItem('uploadedAudioUrl', uploadData.url);
                }
                debugLog('[useRecording] Uploaded to R2', { url: uploadData.url, type });
              }
              
              // Clear controller reference if this was the current upload
              if ((window as any)[controllerKey] === controller) {
                (window as any)[controllerKey] = null;
              }
            } catch (uploadError: any) {
              // Ignore abort errors
              if (uploadError?.name === 'AbortError') {
                return;
              }
              debugError('R2 upload error', uploadError);
              // Continue anyway - local file is still available
            }
            
            // Clean up recording UI FIRST - remove only recording container, preserve React's video element
            if (type === "video") {
              const videoPreview = document.getElementById('videoPreview');
              const videoSection = document.getElementById('videoSection');
              const videoDropzone = document.getElementById('videoDropzone');
              const sourcesContainer = document.querySelector('.sources-container');
              const video = document.getElementById('videoRecordPreview') as HTMLVideoElement;
              
              // Stop recording preview stream
              if (video) {
                video.srcObject = null;
              }
              
              // Remove recording container and restore React's video player container visibility
              if (videoPreview) {
                const recordingContainer = videoPreview.querySelector('.recording-container');
                if (recordingContainer) {
                  recordingContainer.remove();
                }
                // Restore React's video player container visibility
                const customVideoPlayer = videoPreview.querySelector('.custom-video-player');
                if (customVideoPlayer) {
                  (customVideoPlayer as HTMLElement).style.display = '';
                }
                videoPreview.style.display = 'flex';
                videoPreview.style.minHeight = '400px';
              }
              
              // Update classes immediately to maintain layout
              if (videoSection) {
                videoSection.classList.remove('recording');
                videoSection.classList.add('has-media');
              }
              
              if (videoDropzone) {
                videoDropzone.style.display = 'none';
              }
              
              if (sourcesContainer) {
                sourcesContainer.classList.add('has-video');
                const audioSection = document.getElementById('audioSection');
                const hasAudio = audioSection && audioSection.classList.contains('has-media');
                if (hasAudio) {
                  sourcesContainer.classList.add('has-both');
                } else {
                  sourcesContainer.classList.remove('has-both');
                }
              }
            } else {
              const audioPreview = document.getElementById('audioPreview');
              const audioSection = document.getElementById('audioSection');
              const audioDropzone = document.getElementById('audioDropzone');
              const sourcesContainer = document.querySelector('.sources-container');
              
              // Clear innerHTML to remove recording container
              if (audioPreview) {
                const recordingContainer = audioPreview.querySelector('.audio-recording-container');
                if (recordingContainer) {
                  recordingContainer.remove();
                }
              }
              
              if (audioSection) {
                audioSection.classList.remove('recording');
                audioSection.classList.add('has-media');
              }
              
              if (audioDropzone) {
                audioDropzone.style.display = 'none';
              }
              
              if (sourcesContainer) {
                const videoSection = document.getElementById('videoSection');
                const hasVideo = videoSection && videoSection.classList.contains('has-media');
                if (hasVideo) {
                  sourcesContainer.classList.add('has-both');
                }
              }
            }
            
            // Update React state via setVideoPath/setAudioPath (pass URL to prevent double upload)
            // React's video element is preserved (just hidden during recording), so it will show automatically
            if (type === "video") {
              if ((window as any).setVideoPath) {
                await (window as any).setVideoPath(data.path, r2Url);
              }
            } else {
              if ((window as any).setAudioPath) {
                await (window as any).setAudioPath(data.path, r2Url);
              }
            }
            
            // Trigger update functions (matches main branch)
            if ((window as any).updateLipsyncButton) {
              (window as any).updateLipsyncButton();
            }
            if ((window as any).renderInputPreview) {
              (window as any).renderInputPreview(type === 'video' ? 'videoRecording' : 'audioRecording');
            }
            // Don't call updateInputStatus here - it will be called by useEffect when both are ready
            
            // Show success toast (matches main branch)
            const successMsg = type === "video" 
              ? ToastMessages.VIDEO_RECORDED_SUCCESSFULLY 
              : ToastMessages.AUDIO_RECORDED_SUCCESSFULLY;
            showToast(successMsg, "success");
          } else {
            throw new Error(data?.error || 'Failed to save recording');
          }
        } catch (error) {
          debugError('Recording save error', error);
          showToast(ToastMessages.RECORDING_FAILED, "error");
          
          // Reset UI on error - show dropzone again
          if (type === "video") {
            const videoSection = document.getElementById('videoSection');
            const videoDropzone = document.getElementById('videoDropzone');
            const videoPreview = document.getElementById('videoPreview');
            if (videoSection) videoSection.classList.remove('recording');
            if (videoDropzone) videoDropzone.style.display = 'flex';
            if (videoPreview) {
              const recordingContainer = videoPreview.querySelector('.recording-container');
              if (recordingContainer) recordingContainer.remove();
              videoPreview.style.display = 'none';
            }
          } else {
            const audioSection = document.getElementById('audioSection');
            const audioDropzone = document.getElementById('audioDropzone');
            const audioPreview = document.getElementById('audioPreview');
            if (audioSection) audioSection.classList.remove('recording');
            if (audioDropzone) audioDropzone.style.display = 'flex';
            if (audioPreview) {
              const recordingContainer = audioPreview.querySelector('.audio-recording-container');
              if (recordingContainer) recordingContainer.remove();
              audioPreview.style.display = 'none';
            }
          }
        }

        URL.revokeObjectURL(url);
        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach((track) => track.stop());
          mediaStreamRef.current = null;
        }
        (window as any).__recordingStream = null;
        setRecordingTime(0);
        startTimeRef.current = null;
      };

      mediaRecorderRef.current = recorder;
      
      // Start timer
      startTimeRef.current = Date.now();
      setRecordingTime(0);
      timerIntervalRef.current = setInterval(() => {
        if (startTimeRef.current) {
          const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
          setRecordingTime(elapsed);
          // Update timer in UI
          const timerId = type === 'video' ? 'videoTimer' : 'audioTimer';
          const timer = document.getElementById(timerId);
          if (timer) {
            const mins = Math.floor(elapsed / 60);
            const secs = elapsed % 60;
            timer.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
          }
        }
      }, 1000);
      
      // Setup audio waveform visualization for audio recording
      if (type === 'audio') {
        try {
          audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
          const source = audioContextRef.current.createMediaStreamSource(stream);
          audioAnalyserRef.current = audioContextRef.current.createAnalyser();
          audioAnalyserRef.current.fftSize = 2048;
          source.connect(audioAnalyserRef.current);
          
          // Draw waveform
          const canvas = document.getElementById('audioRecordWaveform') as HTMLCanvasElement;
          if (canvas) {
            canvas.width = canvas.offsetWidth * 2;
            canvas.height = canvas.offsetHeight * 2;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.scale(2, 2);
              
              let isDrawing = true;
              const drawWaveform = () => {
                if (!audioAnalyserRef.current || !isDrawing) {
                  return;
                }
                animationFrameRef.current = requestAnimationFrame(drawWaveform);
                
                const bufferLength = audioAnalyserRef.current.frequencyBinCount;
                const dataArray = new Uint8Array(bufferLength);
                audioAnalyserRef.current.getByteTimeDomainData(dataArray);
                
                const width = canvas.width / 2;
                const height = canvas.height / 2;
                
                ctx.clearRect(0, 0, width, height);
                
                // Check if there's audio data
                let hasAudioData = false;
                for (let i = 0; i < dataArray.length; i++) {
                  if (Math.abs(dataArray[i] - 128) > 5) {
                    hasAudioData = true;
                    break;
                  }
                }
                if (!hasAudioData) return;
                
                const barSpacing = 2;
                const barCount = Math.max(1, Math.floor(width / barSpacing));
                const centerY = height / 2;
                
                for (let i = 0; i < barCount; i++) {
                  const dataIndex = Math.floor((i / barCount) * bufferLength);
                  const normalized = Math.abs((dataArray[dataIndex] - 128) / 128.0);
                  const barHeight = Math.max(2, normalized * (height * 0.8));
                  
                  if (barHeight < 3 || i < 2) continue;
                  
                  ctx.fillStyle = '#ffffff';
                  const barWidth = 1;
                  const x = i * barSpacing;
                  const y = centerY - barHeight / 2;
                  const radius = 2;
                  
                  ctx.beginPath();
                  if ((ctx as any).roundRect) {
                    (ctx as any).roundRect(x, y, barWidth, barHeight, radius);
                  } else {
                    ctx.rect(x, y, barWidth, barHeight);
                  }
                  ctx.fill();
                }
              };
              
              // Start drawing after a short delay to ensure stream is ready
              setTimeout(() => {
                drawWaveform();
              }, 100);
              
              // Store cleanup function
              (window as any).__stopAudioWaveform = () => {
                isDrawing = false;
                if (animationFrameRef.current) {
                  cancelAnimationFrame(animationFrameRef.current);
                  animationFrameRef.current = null;
                }
              };
            }
          }
        } catch (e) {
          debugError('Failed to setup audio visualization', e);
        }
      }
      
      // Wait a bit for camera/mic to warm up
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Start with timeslice to ensure data is captured continuously
      // Timeslice of 1000ms ensures we get data chunks every second
      recorder.start(1000);
      setIsRecording(true);
      setRecordingType(type);
    } catch (error: any) {
      debugError("Recording failed", error);
      
      // Reset state
      setIsRecording(false);
      setRecordingType(null);
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      
      // Clean up stream if it was created
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
      }
      (window as any).__recordingStream = null;
      
      // Provide specific error messages
      let errorMessage = type === 'video' 
        ? 'Camera access denied or unavailable'
        : 'Microphone access denied or unavailable';
      
      if (error?.name === 'NotAllowedError') {
        errorMessage = type === 'video'
          ? 'Camera access denied. Please allow camera access in your browser/system preferences and try again.'
          : 'Microphone access denied. Please allow microphone access in your browser/system preferences and try again.';
      } else if (error?.name === 'NotFoundError') {
        errorMessage = type === 'video'
          ? 'No camera found. Please connect a camera and try again.'
          : 'No microphone found. Please connect a microphone and try again.';
      } else if (error?.name === 'NotReadableError') {
        errorMessage = type === 'video'
          ? 'Camera is already in use by another application.'
          : 'Microphone is already in use by another application.';
      } else if (error?.name === 'OverconstrainedError') {
        errorMessage = type === 'video'
          ? 'Camera constraints cannot be satisfied. Try with different video settings.'
          : 'Microphone constraints cannot be satisfied. Try with different audio settings.';
      } else if (error?.name === 'SecurityError') {
        errorMessage = type === 'video'
          ? 'Camera access blocked due to security restrictions. Check system permissions.'
          : 'Microphone access blocked due to security restrictions. Check system permissions.';
      } else if (error?.name === 'AbortError') {
        errorMessage = type === 'video'
          ? 'Camera access was interrupted. Please try again.'
          : 'Microphone access was interrupted. Please try again.';
      }
      
      showToast(errorMessage, "error");
      
      // Reset UI
      if (type === "video") {
        const videoSection = document.getElementById('videoSection');
        const videoDropzone = document.getElementById('videoDropzone');
        const videoPreview = document.getElementById('videoPreview');
        if (videoDropzone) videoDropzone.style.display = 'flex';
        if (videoPreview) videoPreview.style.display = 'none';
        if (videoSection) videoSection.classList.remove('recording');
      } else {
        const audioSection = document.getElementById('audioSection');
        const audioDropzone = document.getElementById('audioDropzone');
        const audioPreview = document.getElementById('audioPreview');
        if (audioDropzone) audioDropzone.style.display = 'flex';
        if (audioPreview) audioPreview.style.display = 'none';
        if (audioSection) audioSection.classList.remove('recording');
      }
      
      // Re-throw to allow SourcesTab to handle it
      throw error;
    }
  }, [isRecording]);

  const stopRecording = useCallback(() => {
    debugLog('[useRecording] stopRecording called', { 
      hasRecorder: !!mediaRecorderRef.current, 
      isRecording, 
      state: mediaRecorderRef.current?.state 
    });
    
    // Clear timer
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    
    if ((window as any).__stopAudioWaveform) {
      (window as any).__stopAudioWaveform();
      (window as any).__stopAudioWaveform = null;
    }
    
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch (e) {
        debugError('audioContext.close() failed', e);
      }
      audioContextRef.current = null;
    }
    
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      const recorder = mediaRecorderRef.current;
      
      // Request data before stopping to ensure we get any pending chunks (matches main branch)
      try {
        recorder.requestData();
      } catch (e) {
        debugError('requestData failed', e);
      }
      
      // Small delay to ensure data is captured (matches main branch)
      setTimeout(() => {
        if (recorder && recorder.state !== 'inactive') {
          try {
            recorder.stop();
            debugLog('[useRecording] MediaRecorder.stop() called');
          } catch (e) {
            debugError('stop() failed', e);
          }
        }
      }, 100);
    }
    
    // Also stop all tracks immediately (matches main branch)
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => {
        track.stop();
        debugLog('[useRecording] Stopped track', { kind: track.kind, label: track.label });
      });
      mediaStreamRef.current = null;
    }
    
    // Also clean up global stream reference
    if ((window as any).__recordingStream) {
      (window as any).__recordingStream.getTracks().forEach((track: MediaStreamTrack) => {
        track.stop();
      });
      (window as any).__recordingStream = null;
    }
    
    // Reset state immediately
    setIsRecording(false);
    setRecordingType(null);
    setRecordingTime(0);
    if (startTimeRef.current) {
      startTimeRef.current = null;
    }
  }, [isRecording]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  return {
    isRecording,
    recordingType,
    recordingTime,
    startRecording,
    stopRecording,
  };
};

