import React, { useState, useEffect } from "react";
import { X, Search, Plus, ArrowUpRight, Trash2, Play, Pause } from "lucide-react";
import { useTTS } from "../hooks/useTTS";
import { debugLog } from "../utils/debugLog";

interface TTSVoiceSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onCloneClick?: () => void;
}

const TTSVoiceSelector: React.FC<TTSVoiceSelectorProps> = ({ isOpen, onClose, onCloneClick }) => {
  const { voices, selectedVoice, setSelectedVoice, loadVoices, deleteVoice } = useTTS();
  const [searchQuery, setSearchQuery] = useState("");
  const [playingPreview, setPlayingPreview] = useState<string | null>(null);
  const [previewAudio, setPreviewAudio] = useState<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadVoices();
      setSearchQuery("");
    }
  }, [isOpen, loadVoices]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (previewAudio) {
        previewAudio.pause();
        previewAudio.src = "";
      }
    };
  }, [previewAudio]);

  // Group voices by category
  const builtInVoices = voices.filter((v) => v.category === "premade" || !v.category);
  const clonedVoices = voices.filter((v) => v.category === "cloned");

  // Filter voices by search query
  const filterVoices = (voiceList: typeof voices) => {
    if (!searchQuery.trim()) return voiceList;
    return voiceList.filter((voice) =>
      voice.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (voice.labels && Object.values(voice.labels).some((label) =>
        String(label).toLowerCase().includes(searchQuery.toLowerCase())
      ))
    );
  };

  const filteredBuiltIn = filterVoices(builtInVoices);
  const filteredCloned = filterVoices(clonedVoices);

  const handleSelectVoice = (voiceId: string) => {
    if (!voiceId) return;
    debugLog('[TTSVoiceSelector] Selecting voice', { voiceId });
    setSelectedVoice(voiceId);
    onClose();
  };

  const handleDeleteVoice = async (e: React.MouseEvent, voiceId: string) => {
    e.stopPropagation();
    const voice = voices.find((v) => (v.id || v.voice_id) === voiceId);
    const voiceName = voice?.name || "this voice";

    if (!confirm(`Are you sure you want to delete "${voiceName.toLowerCase()}"? This action cannot be undone.`)) {
      return;
    }

    try {
      await deleteVoice(voiceId);
      if ((window as any).showToast) {
        (window as any).showToast("voice deleted successfully", "success");
      }
    } catch (error: any) {
      if ((window as any).showToast) {
        (window as any).showToast(`failed to delete voice: ${error.message}`, "error");
      }
    }
  };

  const handlePlayPreview = async (e: React.MouseEvent, voiceId: string, previewUrl?: string) => {
    e.stopPropagation();
    
    if (!previewUrl) {
      if ((window as any).showToast) {
        (window as any).showToast("no preview available for this voice", "info");
      }
      return;
    }

    // If same voice is playing, pause it
    if (playingPreview === voiceId && previewAudio && !previewAudio.paused) {
      previewAudio.pause();
      setPlayingPreview(null);
      return;
    }

    // Stop current playback
    if (previewAudio) {
      previewAudio.pause();
      previewAudio.src = "";
    }

    // Create new audio element
    const audio = new Audio(previewUrl);
    audio.addEventListener("ended", () => {
      setPlayingPreview(null);
      setPreviewAudio(null);
    });
    audio.addEventListener("pause", () => {
      setPlayingPreview(null);
    });

    try {
      await audio.play();
      setPreviewAudio(audio);
      setPlayingPreview(voiceId);
    } catch (error) {
      if ((window as any).showToast) {
        (window as any).showToast("failed to play preview", "error");
      }
    }
  };

  const handleCloneClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onCloneClick) {
      onCloneClick();
    }
  };

  if (!isOpen) return null;

  const showCloneButton = !searchQuery || "clone voice".includes(searchQuery.toLowerCase());

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
              <>
                {/* Clone Voice Button */}
                {showCloneButton && (
                  <div
                    className="tts-voice-item clone-btn"
                    onClick={handleCloneClick}
                  >
                    <div className="tts-voice-play">
                      <Plus size={16} />
                    </div>
                    <div className="tts-voice-info">
                      <div className="tts-voice-item-name" style={{ color: "#ffffff" }}>
                        clone voice
                      </div>
                    </div>
                    <ArrowUpRight size={16} className="tts-voice-clone-icon" />
                  </div>
                )}

                {/* Cloned Voices Section */}
                {filteredCloned.length > 0 && (
                  <div className="tts-voice-category">
                    <div className="tts-voice-category-title">
                      cloned voices ({filteredCloned.length})
                    </div>
                    {filteredCloned.map((voice) => {
                      const voiceId = voice.id || voice.voice_id || "";
                      const isSelected = selectedVoice === voiceId;
                      return (
                        <div
                          key={voiceId}
                          className={`tts-voice-item ${isSelected ? "selected" : ""}`}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleSelectVoice(voiceId);
                          }}
                        >
                          <div
                            className="tts-voice-play"
                            onClick={(e) => handlePlayPreview(e, voiceId, voice.preview_url)}
                          >
                            {playingPreview === voiceId ? (
                              <Pause size={16} />
                            ) : (
                              <Play size={16} />
                            )}
                          </div>
                          <div className="tts-voice-info">
                            <div className="tts-voice-item-name">
                              {voice.name.toLowerCase()}
                              {isSelected && <span className="current-label"> (current)</span>}
                            </div>
                          </div>
                          <div
                            className="tts-voice-delete"
                            onClick={(e) => handleDeleteVoice(e, voiceId)}
                          >
                            <Trash2 size={16} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Built-in Voices Section */}
                {filteredBuiltIn.length > 0 && (
                  <div className="tts-voice-category">
                    <div className="tts-voice-category-title">
                      eleven labs ({filteredBuiltIn.length})
                    </div>
                    {filteredBuiltIn.map((voice) => {
                      const voiceId = voice.id || voice.voice_id || "";
                      const isSelected = selectedVoice === voiceId;
                      return (
                        <div
                          key={voiceId}
                          className={`tts-voice-item ${isSelected ? "selected" : ""}`}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleSelectVoice(voiceId);
                          }}
                        >
                          <div
                            className="tts-voice-play"
                            onClick={(e) => handlePlayPreview(e, voiceId, voice.preview_url)}
                          >
                            {playingPreview === voiceId ? (
                              <Pause size={16} />
                            ) : (
                              <Play size={16} />
                            )}
                          </div>
                          <div className="tts-voice-info">
                            <div className="tts-voice-item-name">
                              {voice.name.toLowerCase()}
                              {isSelected && <span className="current-label"> (current)</span>}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* No results message */}
                {searchQuery && filteredBuiltIn.length === 0 && filteredCloned.length === 0 && (
                  <div className="tts-voice-loading" style={{ color: "var(--text-muted)" }}>
                    no voices found matching "{searchQuery}"
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TTSVoiceSelector;

