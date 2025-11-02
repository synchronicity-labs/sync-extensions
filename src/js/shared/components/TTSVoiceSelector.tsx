import React, { useState, useEffect } from "react";
import { X, Search } from "lucide-react";
import { useTTS } from "../hooks/useTTS";

interface TTSVoiceSelectorProps {
  isOpen: boolean;
  onClose: () => void;
}

const TTSVoiceSelector: React.FC<TTSVoiceSelectorProps> = ({ isOpen, onClose }) => {
  const { voices, selectedVoice, setSelectedVoice, loadVoices } = useTTS();
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (isOpen) {
      loadVoices();
    }
  }, [isOpen, loadVoices]);

  const filteredVoices = voices.filter((voice) =>
    voice.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSelectVoice = (voiceId: string) => {
    setSelectedVoice(voiceId);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className={`model-selector-overlay ${isOpen ? "show" : ""}`} onClick={onClose}>
      <div className="model-selector-panel" onClick={(e) => e.stopPropagation()}>
        <div className="model-panel-handle"></div>
        <div className="model-selector-header">
          <h3>choose voice</h3>
          <button className="model-selector-close" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="tts-voice-search">
          <Search size={16} className="tts-voice-search-icon" />
          <input
            type="text"
            className="tts-voice-search-input"
            placeholder="find voice"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="tts-voice-list-wrapper">
          <div className="tts-voice-list">
            {voices.length === 0 ? (
              <div className="tts-voice-loading">
                <div className="tts-progress-spinner"></div>
                <span>loading voices...</span>
              </div>
            ) : (
              filteredVoices.map((voice) => (
                <div
                  key={voice.id}
                  className={`tts-voice-item ${selectedVoice === voice.id ? "active" : ""}`}
                  onClick={() => handleSelectVoice(voice.id)}
                >
                  <span className="tts-voice-name">{voice.name}</span>
                  {selectedVoice === voice.id && (
                    <div className="tts-voice-check">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                      </svg>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TTSVoiceSelector;

