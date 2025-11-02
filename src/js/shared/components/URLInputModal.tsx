import React, { useState, useEffect } from "react";
import { X, DownloadCloud } from "lucide-react";
import { useMedia } from "../hooks/useMedia";

interface URLInputModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: "video" | "audio";
}

const URLInputModal: React.FC<URLInputModalProps> = ({ isOpen, onClose, type }) => {
  const { selectVideo, selectAudio } = useMedia();
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setUrl("");
    }
  }, [isOpen]);

  const handleSubmit = async () => {
    if (!url.trim()) return;

    setIsLoading(true);
    try {
      // Download and set URL
      const response = await fetch("http://127.0.0.1:3000/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, type }),
      });

      const data = await response.json().catch(() => null);
      if (response.ok && data?.ok && data?.path) {
        if (type === "video") {
          // Set video URL
          (window as any).selectedVideoUrl = url;
          (window as any).selectedVideoIsUrl = true;
        } else {
          // Set audio URL
          (window as any).selectedAudioUrl = url;
          (window as any).selectedAudioIsUrl = true;
        }
        onClose();
      }
    } catch (_) {
      // Handle error
    } finally {
      setIsLoading(false);
    }
  };

  const handleClear = () => {
    setUrl("");
  };

  if (!isOpen) return null;

  return (
    <div className="url-input-overlay" style={{ display: isOpen ? "flex" : "none" }} onClick={onClose}>
      <div className="url-input-modal" onClick={(e) => e.stopPropagation()}>
        <div className="url-input-content">
          <button className="url-input-close" onClick={onClose}>
            <X size={16} />
          </button>
          <div className="url-input-field-wrapper">
            <input
              type="text"
              className="url-input-field"
              placeholder="enter direct url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && handleSubmit()}
              autoComplete="off"
            />
            {url && (
              <button className="url-input-clear" onClick={handleClear}>
                <X size={16} />
              </button>
            )}
            <button
              className="url-input-submit"
              onClick={handleSubmit}
              disabled={!url.trim() || isLoading}
            >
              <DownloadCloud size={20} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default URLInputModal;

