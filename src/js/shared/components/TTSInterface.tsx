import React, { useState, useEffect, useRef } from "react";
import { X, AudioLines, Speech, SlidersHorizontal, Upload, ChevronUp, HelpCircle } from "lucide-react";
import { useTTS } from "../hooks/useTTS";
import { useSettings } from "../hooks/useSettings";
import { useMedia } from "../hooks/useMedia";
import { getApiUrl } from "../utils/serverConfig";
import "../styles/components/tts.scss";

interface TTSInterfaceProps {
  isOpen: boolean;
  onClose: () => void;
  onVoiceSelectClick: () => void;
}

const TTSInterface: React.FC<TTSInterfaceProps> = ({ isOpen, onClose, onVoiceSelectClick }) => {
  const { 
    selectedVoice, 
    voices, 
    generateTTS, 
    isGenerating, 
    loadVoices,
    selectedModel,
    setSelectedModel,
    voiceSettings,
    setVoiceSettings,
  } = useTTS();
  const { settings } = useSettings();
  const { setAudioPath } = useMedia();
  const [text, setText] = useState("");
  const [settingsPopupOpen, setSettingsPopupOpen] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const settingsPopupRef = useRef<HTMLDivElement>(null);

  // Load voices when interface opens
  useEffect(() => {
    if (isOpen && voices.length === 0) {
      loadVoices();
    }
  }, [isOpen, voices.length, loadVoices]);

  // Find the selected voice name
  const selectedVoiceName = voices.find((v) => v.id === selectedVoice)?.name || selectedVoice;

  // Model display names
  const modelDisplayNames: Record<string, string> = {
    'eleven_v3': 'eleven v3',
    'eleven_turbo_v2_5': 'eleven turbo 2.5',
    'eleven_flash_v2_5': 'eleven flash 2.5',
    'eleven_multilingual_v2': 'eleven multilingual v2'
  };

  // Update preview button visibility based on text
  const hasText = text.trim().length > 0;

  // Close settings popup when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        settingsPopupOpen &&
        settingsButtonRef.current &&
        settingsPopupRef.current &&
        !settingsButtonRef.current.contains(e.target as Node) &&
        !settingsPopupRef.current.contains(e.target as Node)
      ) {
        setSettingsPopupOpen(false);
      }
    };

    if (settingsPopupOpen) {
      setTimeout(() => {
        document.addEventListener('click', handleClickOutside);
      }, 50);
    }

    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [settingsPopupOpen]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [text]);

  // Focus textarea when opened
  useEffect(() => {
    if (isOpen && textareaRef.current) {
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  // Clear text when closed
  useEffect(() => {
    if (!isOpen) {
      setText("");
    }
  }, [isOpen]);

  const handleGenerate = async () => {
    if (!text.trim()) {
      if ((window as any).showToast) {
        (window as any).showToast("please enter some text first", "error");
      }
      return;
    }

    if (!settings.elevenlabsApiKey?.trim()) {
      if ((window as any).showToast) {
        (window as any).showToast("elevenlabs api key not configured", "error");
      }
      return;
    }

    try {
      const audioPath = await generateTTS(text.trim(), undefined, selectedModel, voiceSettings);
      if (audioPath) {
        // Close the TTS interface
        onClose();
        
        // Set the generated audio path directly
        await setAudioPath(audioPath);
        
        if ((window as any).showToast) {
          (window as any).showToast("tts audio generated successfully!", "success");
        }
      } else {
        if ((window as any).showToast) {
          (window as any).showToast("failed to generate speech", "error");
        }
      }
    } catch (error) {
      if ((window as any).showToast) {
        (window as any).showToast("failed to generate speech", "error");
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="tts-textarea">
      <button className="tts-close-x" onClick={onClose} type="button">
        <X size={14} />
      </button>
      
      <div className="tts-text-area">
        <textarea
          ref={textareaRef}
          className="tts-text-input"
          placeholder="add your text to speech here, choose voice below"
          maxLength={5000}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={1}
        />
      </div>

      <div className="tts-controls">
        <div className="tts-controls-left">
          <button
            className="tts-btn"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClose();
            }}
            type="button"
          >
            <Upload size={16} />
          </button>
        </div>
        
        <div className="tts-controls-right">
          <button
            className="tts-voice-btn"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              e.stopImmediatePropagation();
              onVoiceSelectClick();
            }}
            type="button"
          >
            <Speech size={16} />
            <span>{selectedVoiceName.toLowerCase()}</span>
          </button>
          <button
            ref={settingsButtonRef}
            className="tts-btn"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              e.stopImmediatePropagation();
              setSettingsPopupOpen(!settingsPopupOpen);
              setModelMenuOpen(false);
            }}
            type="button"
          >
            <SlidersHorizontal size={16} />
          </button>
          <button
            className="tts-preview-btn"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!isGenerating) {
                handleGenerate();
              }
            }}
            disabled={isGenerating}
            type="button"
            style={{
              minWidth: hasText ? "auto" : "32px",
              padding: hasText ? "8px 12px" : "8px",
              width: hasText ? "auto" : "32px",
            }}
          >
            {isGenerating ? (
              <div className="tts-progress-spinner" />
            ) : (
              <>
                <AudioLines size={16} />
                <span 
                  className="tts-preview-text" 
                  style={{ display: hasText ? "block" : "none" }}
                >
                  generate
                </span>
              </>
            )}
          </button>
          
          {/* TTS Voice Settings Popup */}
          {settingsPopupOpen && (
        <div
          ref={settingsPopupRef}
          className="tts-settings-popup show"
          style={{
            position: 'fixed',
            top: settingsButtonRef.current
              ? `${settingsButtonRef.current.getBoundingClientRect().top - 200}px`
              : 'auto',
            right: settingsButtonRef.current
              ? `${window.innerWidth - settingsButtonRef.current.getBoundingClientRect().right}px`
              : '16px',
          }}
        >
          <div className="tts-settings-content">
            <h3 className="tts-settings-title">voice settings</h3>
            
            {/* Model Dropdown */}
            <div className="tts-setting-item">
              <div className="tts-setting-header">
                <span className="tts-setting-label">model</span>
              </div>
              <div className="tts-model-dropdown-wrapper">
                <button
                  className="tts-model-dropdown-trigger"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setModelMenuOpen(!modelMenuOpen);
                  }}
                  type="button"
                >
                  <span>{modelDisplayNames[selectedModel] || selectedModel}</span>
                  <ChevronUp size={16} style={{ transform: modelMenuOpen ? 'rotate(180deg)' : 'none' }} />
                </button>
                {modelMenuOpen && (
                  <div className="tts-model-dropdown-menu show">
                    {Object.entries(modelDisplayNames).map(([id, name]) => (
                      <div
                        key={id}
                        className={`tts-model-dropdown-option ${selectedModel === id ? 'active' : ''}`}
                        onClick={() => {
                          setSelectedModel(id);
                          setModelMenuOpen(false);
                        }}
                      >
                        <span>{name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Stability Slider */}
            <div className="tts-setting-item">
              <div className="tts-setting-header">
                <span className="tts-setting-label">stability: <span>{voiceSettings.stability.toFixed(2)}</span></span>
                <button className="tts-setting-help" type="button">
                  <HelpCircle size={16} />
                </button>
              </div>
              <div className="tts-slider-container">
                <span className="tts-slider-min">0</span>
                <input
                  type="range"
                  className="tts-slider"
                  min="0"
                  max="1"
                  step="0.01"
                  value={voiceSettings.stability}
                  onChange={(e) => {
                    setVoiceSettings((prev) => ({
                      ...prev,
                      stability: parseFloat(e.target.value),
                    }));
                  }}
                />
                <span className="tts-slider-max">1</span>
              </div>
            </div>

            {/* Similarity Boost Slider */}
            <div className="tts-setting-item">
              <div className="tts-setting-header">
                <span className="tts-setting-label">similarity boost: <span>{voiceSettings.similarityBoost.toFixed(2)}</span></span>
                <button className="tts-setting-help" type="button">
                  <HelpCircle size={16} />
                </button>
              </div>
              <div className="tts-slider-container">
                <span className="tts-slider-min">0</span>
                <input
                  type="range"
                  className="tts-slider"
                  min="0"
                  max="1"
                  step="0.01"
                  value={voiceSettings.similarityBoost}
                  onChange={(e) => {
                    setVoiceSettings((prev) => ({
                      ...prev,
                      similarityBoost: parseFloat(e.target.value),
                    }));
                  }}
                />
                <span className="tts-slider-max">1</span>
              </div>
            </div>
          </div>
        </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TTSInterface;

