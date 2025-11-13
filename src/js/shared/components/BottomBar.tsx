import React, { useState, useEffect, useMemo } from "react";
import { ChevronDown } from "lucide-react";
import whiteIcon from "../../assets/icons/white_icon.png";
import { useJobs } from "../hooks/useJobs";
import { useMedia } from "../hooks/useMedia";
import { useCost } from "../hooks/useCost";
import { useSettings } from "../hooks/useSettings";
import { useCore } from "../hooks/useCore";
import ModelSelector from "./ModelSelector";

const BottomBar: React.FC = () => {
  const { selection } = useMedia();
  const { settings } = useSettings();
  const { estimatedCost, estimateCost } = useCost();
  const { startLipsync } = useJobs();
  const { updateModelDisplay } = useCore();
  const [modelSelectorOpen, setModelSelectorOpen] = useState(false);

  // Expose startLipsync on window for backward compatibility
  useEffect(() => {
    (window as any).startLipsync = startLipsync;
  }, [startLipsync]);

  useEffect(() => {
    updateModelDisplay();
  }, [settings.model, updateModelDisplay]);

  // Estimate cost when media changes
  useEffect(() => {
    const videoUrl = selection.videoUrl || selection.video;
    const audioUrl = selection.audioUrl || selection.audio;
    if (videoUrl && audioUrl) {
      estimateCost(videoUrl, audioUrl);
    } else {
      estimateCost("", "");
    }
  }, [selection.video, selection.videoUrl, selection.audio, selection.audioUrl, estimateCost]);

  // Update button when R2 URLs change (for local file uploads)
  useEffect(() => {
    if (typeof (window as any).updateLipsyncButton === "function") {
      (window as any).updateLipsyncButton();
    }
  }, [
    selection.video,
    selection.videoUrl,
    selection.videoIsUrl,
    selection.audio,
    selection.audioUrl,
    selection.audioIsUrl,
  ]);

  // Check if R2 URLs are ready for local files
  const hasVideoReady = useMemo(() => {
    if (selection.videoIsUrl && selection.videoUrl) {
      // Already a URL, ready to go
      return true;
    }
    if (selection.video && !selection.videoIsUrl) {
      // Local file - check if R2 URL is ready
      const uploadedUrl = (window as any).uploadedVideoUrl || localStorage.getItem("uploadedVideoUrl");
      return !!uploadedUrl;
    }
    return false;
  }, [selection.video, selection.videoUrl, selection.videoIsUrl]);

  const hasAudioReady = useMemo(() => {
    if (selection.audioIsUrl && selection.audioUrl) {
      // Already a URL, ready to go
      return true;
    }
    if (selection.audio && !selection.audioIsUrl) {
      // Local file - check if R2 URL is ready
      const uploadedUrl = (window as any).uploadedAudioUrl || localStorage.getItem("uploadedAudioUrl");
      return !!uploadedUrl;
    }
    return false;
  }, [selection.audio, selection.audioUrl, selection.audioIsUrl]);

  const canLipsync = hasVideoReady && hasAudioReady;

  const handleLipsync = async () => {
    if (!canLipsync) return;
    await startLipsync();
  };

  const modelDisplayMap: Record<string, string> = {
    "lipsync-1.9.0-beta": "lipsync 1.9",
    "lipsync-2": "lipsync 2",
    "lipsync-2-pro": "lipsync 2 pro",
  };

  const displayName = modelDisplayMap[settings.model] || settings.model.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());

  return (
    <>
      <div className="bottom-bar">
        <div className="bottom-content">
          <button className="model-btn" id="modelSelectorBtn" onClick={() => setModelSelectorOpen(true)}>
            <span id="currentModel">{displayName}</span>
            <ChevronDown size={16} />
            <div className="update-dot"></div>
          </button>
          <button className="lipsync-btn" id="lipsyncBtn" disabled={!canLipsync} onClick={handleLipsync}>
            <img src={whiteIcon} alt="sync." width="16" height="16" />
            <span>lipsync</span>
          </button>
        </div>
        <p className="cost-display" id="costDisplay">
          <span className="cost-label">est. cost:</span> ${estimatedCost.toFixed(2)}
        </p>
      </div>
      <ModelSelector isOpen={modelSelectorOpen} onClose={() => setModelSelectorOpen(false)} />
    </>
  );
};

export default BottomBar;
