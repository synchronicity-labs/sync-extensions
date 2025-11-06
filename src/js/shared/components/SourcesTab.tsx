import React, { useState, useEffect } from "react";
import { Upload, MousePointerSquareDashed, Webcam, Link, Mic, MousePointerClick, TextSelect, FileVideo2, FileVideo, Clapperboard, FileAudio, AudioLines } from "lucide-react";
import { useMedia } from "../hooks/useMedia";
import { useRecording } from "../hooks/useRecording";
import { useNLE } from "../hooks/useNLE";
import { useTabs } from "../hooks/useTabs";
import { useSettings } from "../hooks/useSettings";
import { useCore } from "../hooks/useCore";
import { getApiUrl } from "../utils/serverConfig";
import URLInputModal from "./URLInputModal";
import TTSVoiceSelector from "./TTSVoiceSelector";

const SourcesTab: React.FC = () => {
  const { selection, selectVideo, selectAudio, clearVideo, clearAudio } = useMedia();
  const { isRecording, recordingType, startRecording, stopRecording } = useRecording();
  const { nle } = useNLE();
  const { activeTab, setActiveTab } = useTabs();
  const { settings } = useSettings();
  const { serverState } = useCore();
  const [urlModalOpen, setUrlModalOpen] = useState(false);
  const [urlModalType, setUrlModalType] = useState<"video" | "audio">("video");
  const [ttsModalOpen, setTtsModalOpen] = useState(false);
  const isOffline = serverState?.isOffline || false;

  // Expose functions on window for backward compatibility with original code
  useEffect(() => {
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
        } else if (result?.error) {
          // Show error toast
          if ((window as any).showToast) {
            (window as any).showToast(result.error, "error");
          }
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
        setTtsModalOpen(true);
      },
    };
  }, [selectVideo, selectAudio, nle, isRecording, recordingType, startRecording, stopRecording, selection, setUrlModalOpen, setUrlModalType, setTtsModalOpen]);

  // Re-initialize Lucide icons when tab becomes active or offline state changes
  useEffect(() => {
    if (activeTab === "sources") {
      const timer = setTimeout(() => {
        if ((window as any).lucide && (window as any).lucide.createIcons) {
          (window as any).lucide.createIcons();
        }
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [activeTab, isOffline]);

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
                  <button className="action-btn" data-action="video-upload" onClick={(e) => { e.preventDefault(); e.stopPropagation(); selectVideo(); }}>
                    <Upload size={16} />
                    <span>upload</span>
                  </button>
                  <button className="action-btn" data-action="video-inout" onClick={async (e) => { e.preventDefault(); e.stopPropagation(); if (nle?.exportInOutVideo) { const result = await nle.exportInOutVideo({ codec: "h264" }); if (result?.ok && result?.path) { await selectVideo(); } else if (result?.error && (window as any).showToast) { (window as any).showToast(result.error, "error"); } } }}>
                    <MousePointerSquareDashed size={16} />
                    <span>use in/out</span>
                  </button>
                </div>
                <div className="action-row">
                  <button className={`action-btn ${isRecording && recordingType === "video" ? "recording" : ""}`} data-action="video-record" onClick={async (e) => { e.preventDefault(); e.stopPropagation(); if (isRecording && recordingType === "video") { stopRecording(); } else { await startRecording("video"); } }}>
                    <Webcam size={16} />
                    <span>{isRecording && recordingType === "video" ? "stop" : "record"}</span>
                  </button>
                  <button className="action-btn" data-action="video-link" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setUrlModalType("video"); setUrlModalOpen(true); }}>
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
                  <button className="action-btn" data-action="audio-upload" onClick={(e) => { e.preventDefault(); e.stopPropagation(); selectAudio(); }}>
                    <Upload size={16} />
                    <span>upload</span>
                  </button>
                  <button className="action-btn" data-action="audio-inout" onClick={async (e) => { e.preventDefault(); e.stopPropagation(); if (nle?.exportInOutAudio) { const result = await nle.exportInOutAudio({ format: "wav" }); if (result?.ok && result?.path) { await selectAudio(); } else if (result?.error && (window as any).showToast) { (window as any).showToast(result.error, "error"); } } }}>
                    <MousePointerSquareDashed size={16} />
                    <span>use in/out</span>
                  </button>
                </div>
                <div className="action-row">
                  <button className={`action-btn ${isRecording && recordingType === "audio" ? "recording" : ""}`} data-action="audio-record" onClick={async (e) => { e.preventDefault(); e.stopPropagation(); if (isRecording && recordingType === "audio") { stopRecording(); } else { await startRecording("audio"); } }}>
                    <Mic size={16} />
                    <span>{isRecording && recordingType === "audio" ? "stop" : "record"}</span>
                  </button>
                  <button className="action-btn" data-action="audio-link" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setUrlModalType("audio"); setUrlModalOpen(true); }}>
                    <Link size={16} />
                    <span>link url</span>
                  </button>
                </div>
                <div className="action-row">
                  <button className="action-btn" data-action="audio-from-video" onClick={async (e) => { e.preventDefault(); e.stopPropagation(); if (!selection.video && !selection.videoUrl) return; try { const videoPath = selection.video || selection.videoUrl; if (!videoPath) return; const response = await fetch("http://127.0.0.1:3000/audio/extract", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ videoPath, format: "wav" }), }); const data = await response.json().catch(() => null); if (response.ok && data?.ok && data?.path) { await selectAudio(); } } catch (error) { console.error("Error extracting audio from video:", error); } }}>
                    <MousePointerClick size={16} />
                    <span>from video</span>
                  </button>
                  <button className="action-btn" data-action="audio-tts" onClick={(e) => { 
                    e.preventDefault(); 
                    e.stopPropagation(); 
                    if (!settings.elevenlabsApiKey || !settings.elevenlabsApiKey.trim()) {
                      // Show toast with link to settings
                      if ((window as any).showToast) {
                        const toast = document.createElement("div");
                        toast.style.cssText = `
                          position: fixed;
                          top: 20px;
                          right: 20px;
                          padding: 12px 24px;
                          background: #222225;
                          color: white;
                          border-radius: 6px;
                          z-index: 10000;
                          font-family: var(--font-family);
                          font-size: 14px;
                          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
                        `;
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
                        setTimeout(() => {
                          toast.style.opacity = "0";
                          toast.style.transition = "opacity 0.3s";
                          setTimeout(() => {
                            if (toast.parentNode) {
                              toast.parentNode.removeChild(toast);
                            }
                          }, 300);
                        }, 5000);
                      }
                      return;
                    }
                    setTtsModalOpen(true); 
                  }}>
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
        )}
      </div>
      <URLInputModal isOpen={urlModalOpen} onClose={() => setUrlModalOpen(false)} type={urlModalType} />
      <TTSVoiceSelector isOpen={ttsModalOpen} onClose={() => setTtsModalOpen(false)} />
    </>
  );
};

export default SourcesTab;
