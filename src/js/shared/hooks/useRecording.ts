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
        video: type === "video",
        audio: true,
      });

      mediaStreamRef.current = stream;
      const mimeType = type === "video" ? "video/webm" : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType });

      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = async () => {
        const blob = new Blob(chunks, { type: mimeType });
        const url = URL.createObjectURL(blob);
        
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
            } else {
              (window as any).selectedAudio = data.path;
            }
          }
        } catch (_) {
          // Upload failed
        }

        URL.revokeObjectURL(url);
        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach((track) => track.stop());
          mediaStreamRef.current = null;
        }
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
