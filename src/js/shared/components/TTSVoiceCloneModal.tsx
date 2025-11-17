import React, { useState, useEffect, useRef } from "react";
import { X, Upload, Mic, Square, Video, Play, Pause, Trash2 } from "lucide-react";
import { useTTS } from "../hooks/useTTS";
import { useSettings } from "../hooks/useSettings";
import { useMedia } from "../hooks/useMedia";
import { getApiUrl } from "../utils/serverConfig";
import { showToast } from "../utils/toast";

interface TTSVoiceCloneModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVoiceCreated?: (voiceId: string, voiceName: string) => void;
}

interface CloneSample {
  fileName: string;
  filePath: string;
  fileSize: number;
}

const TTSVoiceCloneModal: React.FC<TTSVoiceCloneModalProps> = ({
  isOpen,
  onClose,
  onVoiceCreated,
}) => {
  const { createVoiceClone, setSelectedVoice, loadVoices } = useTTS();
  const { settings } = useSettings();
  const { selectVideo } = useMedia();
  const [voiceName, setVoiceName] = useState("");
  const [samples, setSamples] = useState<CloneSample[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [playingSample, setPlayingSample] = useState<number | null>(null);
  const [previewAudio, setPreviewAudio] = useState<HTMLAudioElement | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (previewAudio) {
        previewAudio.pause();
        previewAudio.src = "";
      }
      stopRecording();
    };
  }, [previewAudio]);

  // Reset form when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setVoiceName("");
      setSamples([]);
      setIsRecording(false);
      setPlayingSample(null);
      stopRecording();
    }
  }, [isOpen]);

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((track) => track.stop());
      audioStreamRef.current = null;
    }
    mediaRecorderRef.current = null;
    audioChunksRef.current = [];
    setIsRecording(false);
  };

  const handleBrowseClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      await handleFileUpload(file);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleFileUpload = async (file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      if ((window as any).showToast) {
        (window as any).showToast("file size must be less than 10MB", "error");
      }
      return;
    }

    if (!file.type.startsWith("audio/")) {
      if ((window as any).showToast) {
        (window as any).showToast("please select an audio file", "error");
      }
      return;
    }

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("targetDir", "uploads");

      const response = await fetch(getApiUrl("/recording/save"), {
        method: "POST",
        body: formData,
      });

      const data = await response.json().catch(() => null);
      if (response.ok && data?.ok && data?.path) {
        setSamples((prev) => [
          ...prev,
          {
            fileName: file.name,
            filePath: data.path,
            fileSize: file.size,
          },
        ]);
      } else {
        throw new Error(data?.error || "Failed to upload file");
      }
    } catch (error: any) {
      if ((window as any).showToast) {
        (window as any).showToast(`failed to upload file: ${error.message}`, "error");
      }
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const files = Array.from(e.dataTransfer.files).filter((file) =>
      file.type.startsWith("audio/")
    );

    if (files.length === 0) {
      if ((window as any).showToast) {
        (window as any).showToast("please drop audio files only", "error");
      }
      return;
    }

    for (const file of files) {
      await handleFileUpload(file);
    }
  };

  const handleRecord = async () => {
    if (isRecording) {
      stopRecording();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: { ideal: 44100 },
          channelCount: { ideal: 1 },
        },
      });

      audioStreamRef.current = stream;
      audioChunksRef.current = [];

      const options: MediaRecorderOptions = {};
      if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
        options.mimeType = "audio/webm;codecs=opus";
      } else if (MediaRecorder.isTypeSupported("audio/webm")) {
        options.mimeType = "audio/webm";
      } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
        options.mimeType = "audio/mp4";
      }

      const recorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        try {
          if (audioChunksRef.current.length === 0) {
            throw new Error("No audio data captured");
          }

          const mimeType = recorder.mimeType || "audio/webm";
          const extension = mimeType.includes("mp4") ? "mp4" : "webm";
          const blob = new Blob(audioChunksRef.current, { type: mimeType });

          if (blob.size === 0) {
            throw new Error("Audio blob is empty");
          }

          const fileName = `tts_clone_recording_${Date.now()}.${extension}`;
          const formData = new FormData();
          formData.append("file", blob, fileName);
          formData.append("targetDir", "uploads");
          formData.append("type", "audio");

          const response = await fetch(getApiUrl("/recording/save"), {
            method: "POST",
            body: formData,
          });

          const data = await response.json().catch(() => null);
          if (response.ok && data?.ok && data?.path) {
            let finalPath = data.path;

            // Convert webm to mp3 if needed
            if (extension === "webm") {
              try {
                const convertResponse = await fetch(getApiUrl("/extract-audio"), {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    videoPath: data.path,
                    format: "mp3",
                  }),
                });

                if (convertResponse.ok) {
                  const convertData = await convertResponse.json().catch(() => null);
                  if (convertData?.ok && convertData?.audioPath) {
                    finalPath = convertData.audioPath;
                  }
                }
              } catch (_) {
                // Continue with webm if conversion fails
              }
            }

            setSamples((prev) => [
              ...prev,
              {
                fileName: finalPath.split("/").pop() || fileName.replace(/\.webm$/, ".mp3"),
                filePath: finalPath,
                fileSize: blob.size,
              },
            ]);

            if ((window as any).showToast) {
              (window as any).showToast("recording saved", "success");
            }
          } else {
            throw new Error(data?.error || "Failed to save recording");
          }
        } catch (error: any) {
          if ((window as any).showToast) {
            (window as any).showToast(`failed to save recording: ${error.message}`, "error");
          }
        } finally {
          audioChunksRef.current = [];
        }
      };

      recorder.start();
      setIsRecording(true);

      if ((window as any).showToast) {
        (window as any).showToast("recording started", "info");
      }
    } catch (error: any) {
      if ((window as any).showToast) {
        (window as any).showToast(`failed to start recording: ${error.message}`, "error");
      }
    }
  };

  const handleFromVideo = async () => {
    try {
      showToast("extracting audio from video...", "info");

      // Get selected video
      const selectedVideo = (window as any).selectedVideo;
      const selectedVideoUrl = (window as any).selectedVideoUrl;

      if (!selectedVideo && !selectedVideoUrl) {
        // Try to select video first
        await selectVideo();
        const newVideo = (window as any).selectedVideo;
        const newVideoUrl = (window as any).selectedVideoUrl;
        if (!newVideo && !newVideoUrl) {
          showToast("no video selected", "info");
          return;
        }
      }

      const videoPath = (window as any).selectedVideo;
      const videoUrl = (window as any).selectedVideoUrl;

      const response = await fetch(getApiUrl("/extract-audio"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          videoPath: videoPath,
          videoUrl: videoUrl,
          format: "mp3",
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "Failed to extract audio" }));
        throw new Error(error.error || "Failed to extract audio");
      }

      const data = await response.json().catch(() => null);
      if (!data?.ok || !data?.audioPath) {
        throw new Error("No audio path returned");
      }

      const fileName = data.audioPath.split(/[/\\]/).pop() || "extracted-audio.mp3";

      setSamples((prev) => [
        ...prev,
        {
          fileName: fileName,
          filePath: data.audioPath,
          fileSize: 0,
        },
      ]);

      showToast("audio extracted successfully", "success");
    } catch (error: any) {
      showToast(`failed to extract audio: ${error.message}`, "error");
    }
  };

  const handleRemoveSample = (index: number) => {
    setSamples((prev) => prev.filter((_, i) => i !== index));
    if (playingSample === index) {
      if (previewAudio) {
        previewAudio.pause();
        previewAudio.src = "";
      }
      setPlayingSample(null);
      setPreviewAudio(null);
    }
  };

  const handlePlaySample = async (index: number) => {
    const sample = samples[index];
    if (!sample) return;

    // If same sample is playing, pause it
    if (playingSample === index && previewAudio && !previewAudio.paused) {
      previewAudio.pause();
      setPlayingSample(null);
      return;
    }

    // Stop current playback
    if (previewAudio) {
      previewAudio.pause();
      previewAudio.src = "";
    }

    try {
      const audio = new Audio(getApiUrl(`/recording/file?path=${encodeURIComponent(sample.filePath)}`));
      audio.addEventListener("ended", () => {
        setPlayingSample(null);
        setPreviewAudio(null);
      });
      audio.addEventListener("pause", () => {
        setPlayingSample(null);
      });

      await audio.play();
      setPreviewAudio(audio);
      setPlayingSample(index);
    } catch (error) {
      if ((window as any).showToast) {
        (window as any).showToast("failed to play sample", "error");
      }
    }
  };

  const handleSave = async () => {
    if (!voiceName.trim()) {
      if ((window as any).showToast) {
        (window as any).showToast("please enter a voice name", "error");
      }
      return;
    }

    if (samples.length === 0) {
      if ((window as any).showToast) {
        (window as any).showToast("please add at least one audio sample", "error");
      }
      return;
    }

    if (!settings.elevenlabsApiKey?.trim()) {
      if ((window as any).showToast) {
        (window as any).showToast("elevenlabs api key not configured", "error");
      }
      return;
    }

    setIsSaving(true);
    try {
      const filePaths = samples.map((s) => s.filePath);
      const voiceId = await createVoiceClone(voiceName.trim(), filePaths);

      if (voiceId) {
        // Select the newly created voice
        setSelectedVoice(voiceId);
        if (onVoiceCreated) {
          onVoiceCreated(voiceId, voiceName.trim());
        }
        onClose();

        if ((window as any).showToast) {
          (window as any).showToast("voice clone created successfully!", "success");
        }
      }
    } catch (error: any) {
      if ((window as any).showToast) {
        (window as any).showToast(`failed to create voice clone: ${error.message}`, "error");
      }
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className={`model-selector-overlay ${isOpen ? "show" : ""}`} onClick={onClose}>
      <div className="model-selector-panel" onClick={(e) => e.stopPropagation()}>
        <div className="model-panel-handle"></div>
        <div className="model-selector-header">
          <h3>clone voice</h3>
          <button className="model-selector-close" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="tts-clone-content">
          {/* Voice Name Input */}
          <div className="tts-clone-field">
            <label className="tts-clone-label">voice name</label>
            <input
              type="text"
              className="tts-clone-input"
              placeholder="enter voice name"
              value={voiceName}
              onChange={(e) => setVoiceName(e.target.value)}
            />
          </div>

          {/* Upload Area */}
          <div className="tts-clone-field">
            <label className="tts-clone-label">add audio samples</label>
            <div
              className={`tts-clone-upload-area ${isDragOver ? "drag-over" : ""}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <Upload size={20} />
              <div className="tts-clone-upload-text">drag and drop audio files here</div>
              <div className="tts-clone-upload-hint">or use the buttons below</div>
              <div className="tts-clone-upload-buttons">
                <button
                  type="button"
                  className="tts-clone-upload-btn"
                  onClick={handleBrowseClick}
                >
                  <Upload size={16} />
                  <span>browse</span>
                </button>
                <button
                  type="button"
                  className="tts-clone-upload-btn"
                  onClick={handleRecord}
                >
                  {isRecording ? <Square size={16} /> : <Mic size={16} />}
                  <span>{isRecording ? "stop" : "record"}</span>
                </button>
              </div>
            </div>
            <button
              type="button"
              className="tts-clone-video-btn"
              onClick={handleFromVideo}
            >
              <Video size={16} />
              <span>from video</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              multiple
              style={{ display: "none" }}
              onChange={handleFileSelect}
            />
          </div>

          {/* Samples List */}
          {samples.length > 0 && (
            <div className="tts-clone-samples-section">
              <label className="tts-clone-label">samples ({samples.length})</label>
              <div className="tts-clone-samples">
                {samples.map((sample, index) => (
                  <div key={index} className="tts-clone-sample-item">
                    <button
                      type="button"
                      className="tts-clone-sample-btn"
                      onClick={() => handlePlaySample(index)}
                    >
                      {playingSample === index ? (
                        <Pause size={16} />
                      ) : (
                        <Play size={16} />
                      )}
                      <span>{sample.fileName}</span>
                    </button>
                    <button
                      type="button"
                      className="tts-clone-sample-delete"
                      onClick={() => handleRemoveSample(index)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="tts-clone-actions">
          <button
            type="button"
            className="tts-clone-cancel-btn"
            onClick={onClose}
            disabled={isSaving}
          >
            cancel
          </button>
          <button
            type="button"
            className="tts-clone-save-btn"
            onClick={handleSave}
            disabled={isSaving || !voiceName.trim() || samples.length === 0}
          >
            {isSaving ? "saving..." : "save"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TTSVoiceCloneModal;

