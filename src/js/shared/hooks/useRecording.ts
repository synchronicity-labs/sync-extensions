import { useState, useCallback, useRef, useEffect } from "react";
import { getApiUrl } from "../utils/serverConfig";
import { debugLog, debugError } from "../utils/debugLog";

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
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = async () => {
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
        
        const blob = new Blob(chunks, { type: mimeType });
        const url = URL.createObjectURL(blob);
        
        // Show loading toast
        if ((window as any).showToast) {
          (window as any).showToast('loading...', 'info');
        }
        
        // Determine file extension based on MIME type
        const extension = mimeType.includes('mp4') ? 'mp4' : 'webm';
        const fileName = `recording_${Date.now()}.${extension}`;
        
        // Save to server (will convert to mp4/mp3)
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
            if (type === "video") {
              (window as any).selectedVideo = data.path;
              (window as any).selectedVideoIsTemp = false;
              (window as any).selectedVideoIsUrl = false;
              (window as any).selectedVideoUrl = '';
              
              // Update React state via setVideoPath
              if ((window as any).setVideoPath) {
                await (window as any).setVideoPath(data.path);
              }
            } else {
              (window as any).selectedAudio = data.path;
              (window as any).selectedAudioIsTemp = false;
              (window as any).selectedAudioIsUrl = false;
              (window as any).selectedAudioUrl = '';
              
              // Update React state via setAudioPath
              if ((window as any).setAudioPath) {
                await (window as any).setAudioPath(data.path);
              }
            }
            
            // Trigger update
            if ((window as any).updateLipsyncButton) (window as any).updateLipsyncButton();
            if ((window as any).renderInputPreview) {
              (window as any).renderInputPreview(type === 'video' ? 'videoRecording' : 'audioRecording');
            }
            
            // Show success toast
            if ((window as any).showToast) {
              (window as any).showToast(`${type} recorded successfully`, 'success');
            }
          } else {
            throw new Error(data?.error || 'Failed to save recording');
          }
        } catch (error) {
          debugError('Recording save error', error);
          if ((window as any).showToast) {
            (window as any).showToast('Failed to save recording', 'error');
          }
        }

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
      
      recorder.start();
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
      
      if ((window as any).showToast) {
        (window as any).showToast(errorMessage, 'error');
      }
      
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
    if (mediaRecorderRef.current && isRecording && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.requestData();
      } catch (e) {
        debugError('requestData failed', e);
      }
      
      setTimeout(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
        }
      }, 100);
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
