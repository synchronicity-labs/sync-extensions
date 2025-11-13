import { useState, useCallback, useRef } from "react";
import { getApiUrl } from "../utils/serverConfig";

export const useRecording = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingType, setRecordingType] = useState<"video" | "audio" | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  const startRecording = useCallback(async (type: "video" | "audio") => {
    try {
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
        const blob = new Blob(chunks, { type: mimeType });
        const url = URL.createObjectURL(blob);
        
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
        
        // Upload to server
        try {
          const formData = new FormData();
          formData.append("file", blob, `recording.${type === "video" ? "webm" : "webm"}`);
          
          const response = await fetch(getApiUrl("/upload"), {
            method: "POST",
            body: formData,
          });

          const data = await response.json().catch(() => null);
          if (response.ok && data?.ok && data?.path) {
            if (type === "video") {
              (window as any).selectedVideo = data.path;
              (window as any).selectedVideoIsTemp = false;
            } else {
              (window as any).selectedAudio = data.path;
              (window as any).selectedAudioIsTemp = false;
            }
            // Trigger update
            if ((window as any).updateLipsyncButton) (window as any).updateLipsyncButton();
            if ((window as any).renderInputPreview) (window as any).renderInputPreview('recording');
          }
        } catch (_) {
          // Upload failed
        }

        URL.revokeObjectURL(url);
        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach((track) => track.stop());
          mediaStreamRef.current = null;
        }
        (window as any).__recordingStream = null;
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
      setRecordingType(type);
    } catch (error) {
      console.error("Recording failed:", error);
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setRecordingType(null);
    }
  }, [isRecording]);

  return {
    isRecording,
    recordingType,
    startRecording,
    stopRecording,
  };
};
