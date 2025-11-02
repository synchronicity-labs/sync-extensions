import React, { useState, useEffect } from "react";
import { Upload, MousePointerSquareDashed, Webcam, Link, Mic, MousePointerClick, TextSelect, FileVideo2, FileVideo, Clapperboard, FileAudio, AudioLines } from "lucide-react";
import { useMedia } from "../hooks/useMedia";
import { useRecording } from "../hooks/useRecording";
import { useNLE } from "../hooks/useNLE";
import { useTabs } from "../hooks/useTabs";
import URLInputModal from "./URLInputModal";
import TTSVoiceSelector from "./TTSVoiceSelector";

const SourcesTab: React.FC = () => {
  const { selection, selectVideo, selectAudio, clearVideo, clearAudio } = useMedia();
  const { isRecording, recordingType, startRecording, stopRecording } = useRecording();
  const { nle } = useNLE();
  const { activeTab } = useTabs();
  const [urlModalOpen, setUrlModalOpen] = useState(false);
  const [urlModalType, setUrlModalType] = useState<"video" | "audio">("video");
  const [ttsModalOpen, setTtsModalOpen] = useState(false);

  // Expose functions on window for backward compatibility with original code
  useEffect(() => {
    // Video functions
    (window as any).selectVideo = selectVideo;
    (window as any).selectVideoInOut = async () => {
      if (nle?.exportInOutVideo) {
        const result = await nle.exportInOutVideo({ codec: "h264" });
        if (result?.ok && result?.path) {
          await selectVideo();
        }
      }
    };
    (window as any).selectVideoUrl = () => {
      setUrlModalType("video");
      setUrlModalOpen(true);
    };
    (window as any).startVideoRecording = async () => {
      if (isRecording && recordingType === "video") {
        stopRecording();
      } else {
        await startRecording("video");
      }
    };

    // Audio functions
    (window as any).selectAudio = selectAudio;
    (window as any).selectAudioInOut = async () => {
      if (nle?.exportInOutAudio) {
        const result = await nle.exportInOutAudio({ format: "wav" });
        if (result?.ok && result?.path) {
          await selectAudio();
        }
      }
    };
    (window as any).selectAudioUrl = () => {
      setUrlModalType("audio");
      setUrlModalOpen(true);
    };
    (window as any).startAudioRecording = async () => {
      if (isRecording && recordingType === "audio") {
        stopRecording();
      } else {
        await startRecording("audio");
      }
    };
    (window as any).selectAudioFromVideo = async () => {
      if (!selection.video && !selection.videoUrl) return;
      
      try {
        const videoPath = selection.video || selection.videoUrl;
        if (!videoPath) return;

        const response = await fetch("http://127.0.0.1:3000/audio/extract", {
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
        setTtsModalOpen(true);
      },
    };

    // Wire up buttons using the original pattern
    const wireButtons = () => {
      if ((window as any).__sourcesButtonsWired) return;
      (window as any).__sourcesButtonsWired = true;

      function on(selector: string, handler: (e?: Event) => void) {
        try {
          const el = document.querySelector(selector);
          if (el) {
            const existingHandler = (el as any).__clickHandler;
            if (existingHandler) {
              el.removeEventListener("click", existingHandler);
            }
            (el as any).__clickHandler = handler;
            el.addEventListener("click", handler);
          }
        } catch (e) {
          // Error attaching handler - silently fail
        }
      }

      // Video buttons
      on('.video-upload .action-btn[data-action="video-upload"]', function() { try { (window as any).selectVideo(); } catch(_) {} });
      on('.video-upload .action-btn[data-action="video-inout"]', function() { try { (window as any).selectVideoInOut(); } catch(_) {} });
      on('.video-upload .action-btn[data-action="video-record"]', function() { try { (window as any).startVideoRecording(); } catch(_) {} });
      on('.video-upload .action-btn[data-action="video-link"]', function() { try { (window as any).selectVideoUrl(); } catch(_) {} });

      // Audio buttons
      on('.audio-upload .action-btn[data-action="audio-upload"]', function() { try { (window as any).selectAudio(); } catch(_) {} });
      on('.audio-upload .action-btn[data-action="audio-inout"]', function() { try { (window as any).selectAudioInOut(); } catch(_) {} });
      on('.audio-upload .action-btn[data-action="audio-record"]', function() { try { (window as any).startAudioRecording(); } catch(_) {} });
      on('.audio-upload .action-btn[data-action="audio-link"]', function() { try { (window as any).selectAudioUrl(); } catch(_) {} });
      on('.audio-upload .action-btn[data-action="audio-from-video"]', async function() { try { await (window as any).selectAudioFromVideo(); } catch(_) {} });
      on('.audio-upload .action-btn[data-action="audio-tts"]', function() { try { if ((window as any).TTSInterface && (window as any).TTSInterface.show) { (window as any).TTSInterface.show(); } } catch(_) {} });
    };

    // Wire buttons after a short delay to ensure DOM is ready
    const timer = setTimeout(() => {
      wireButtons();
    }, 100);

    return () => {
      clearTimeout(timer);
      (window as any).__sourcesButtonsWired = false;
    };
  }, [selectVideo, selectAudio, nle, isRecording, recordingType, startRecording, stopRecording, selection]);

  return (
    <>
      <div id="sources" className={`tab-pane ${activeTab === "sources" ? "active" : ""}`}>
        <div className="sources-container">
          {/* Video Upload Section */}
          <div className={`upload-box video-upload ${selection.video ? "has-media" : ""}`} id="videoSection">
            <div id="videoDropzone" className="upload-content" style={{ display: selection.video ? "none" : "flex" }}>
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
                  <button className="action-btn" data-action="video-upload">
                    <Upload size={16} />
                    <span>upload</span>
                  </button>
                  <button className="action-btn" data-action="video-inout">
                    <MousePointerSquareDashed size={16} />
                    <span>use in/out</span>
                  </button>
                </div>
                <div className="action-row">
                  <button className={`action-btn ${isRecording && recordingType === "video" ? "recording" : ""}`} data-action="video-record">
                    <Webcam size={16} />
                    <span>{isRecording && recordingType === "video" ? "stop" : "record"}</span>
                  </button>
                  <button className="action-btn" data-action="video-link">
                    <Link size={16} />
                    <span>link url</span>
                  </button>
                </div>
              </div>
            </div>
            {selection.video && (
              <div id="videoPreview" style={{ display: "flex" }}>
                <div className="custom-video-player">
                  <video className="video-element" src={`file://${selection.video}`} preload="metadata" />
                  <button className="video-delete-btn" onClick={clearVideo}>
                    <span>Remove</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Audio Upload Section */}
          <div className={`upload-box audio-upload ${selection.audio ? "has-media" : ""}`} id="audioSection">
            <div id="audioDropzone" className="upload-content" style={{ display: selection.audio ? "none" : "flex" }}>
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
                  <button className="action-btn" data-action="audio-upload">
                    <Upload size={16} />
                    <span>upload</span>
                  </button>
                  <button className="action-btn" data-action="audio-inout">
                    <MousePointerSquareDashed size={16} />
                    <span>use in/out</span>
                  </button>
                </div>
                <div className="action-row">
                  <button className={`action-btn ${isRecording && recordingType === "audio" ? "recording" : ""}`} data-action="audio-record">
                    <Mic size={16} />
                    <span>{isRecording && recordingType === "audio" ? "stop" : "record"}</span>
                  </button>
                  <button className="action-btn" data-action="audio-link">
                    <Link size={16} />
                    <span>link url</span>
                  </button>
                </div>
                <div className="action-row">
                  <button className="action-btn" data-action="audio-from-video">
                    <MousePointerClick size={16} />
                    <span>from video</span>
                  </button>
                  <button className="action-btn" data-action="audio-tts">
                    <TextSelect size={16} />
                    <span>generate</span>
                  </button>
                </div>
              </div>
            </div>
            {selection.audio && (
              <div id="audioPreview" style={{ display: "flex" }}>
                <div className="custom-audio-player">
                  <audio src={`file://${selection.audio}`} preload="auto" />
                  <button className="audio-delete-btn" onClick={clearAudio}>
                    <span>Remove</span>
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
      </div>
      <URLInputModal isOpen={urlModalOpen} onClose={() => setUrlModalOpen(false)} type={urlModalType} />
      <TTSVoiceSelector isOpen={ttsModalOpen} onClose={() => setTtsModalOpen(false)} />
    </>
  );
};

export default SourcesTab;
