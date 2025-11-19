import React, { useState, useEffect } from "react";
import { X, HelpCircle, ChevronUp } from "lucide-react";
import { useSettings } from "../hooks/useSettings";
import "../styles/components/model-selector.scss";

interface ModelSelectorProps {
  isOpen: boolean;
  onClose: () => void;
}

const ModelSelector: React.FC<ModelSelectorProps> = ({ isOpen, onClose }) => {
  const { settings, setModel, setTemperature, setSyncMode, updateSettings } = useSettings();
  const [tempValue, setTempValue] = useState(settings.temperature);
  const [syncModeValue, setSyncModeValue] = useState(settings.syncMode);
  const [activeSpeakerOnly, setActiveSpeakerOnly] = useState(settings.activeSpeakerOnly);
  const [detectObstructions, setDetectObstructions] = useState(settings.detectObstructions);
  const [syncModeMenuOpen, setSyncModeMenuOpen] = useState(false);
  const [shouldShow, setShouldShow] = useState(false);

  useEffect(() => {
    setTempValue(settings.temperature);
    setSyncModeValue(settings.syncMode);
    setActiveSpeakerOnly(settings.activeSpeakerOnly);
    setDetectObstructions(settings.detectObstructions);
    // Initialize slider fill percentage
    const percent = (settings.temperature / 1) * 100;
    document.documentElement.style.setProperty('--slider-percent', `${percent}%`);
  }, [settings]);

  const models = [
    { id: "lipsync-2-pro", name: "lipsync 2 pro", description: "our best model: optimized for highest resolution" },
    { id: "lipsync-2", name: "lipsync 2", description: "high-res lipsync that matches speaker style" },
    { id: "lipsync-1.9.0-beta", name: "lipsync 1.9", description: "fastest lipsync model" },
  ];

  const syncModes = [
    { id: "loop", name: "loop", tooltip: "repeats video segment to match audio length" },
    { id: "bounce", name: "bounce", tooltip: "plays video forward then backward" },
    { id: "cutoff", name: "cut off", tooltip: "ends video when audio ends" },
    { id: "silence", name: "silence", tooltip: "adds silent padding to match audio" },
    { id: "remap", name: "remap", tooltip: "dynamically adjusts video timing" },
  ];

  const handleSelectModel = (modelId: string) => {
    setModel(modelId);
  };

  const handleTemperatureChange = (value: number) => {
    setTempValue(value);
    setTemperature(value);
    // Update CSS variable for slider fill
    const percent = (value / 1) * 100;
    document.documentElement.style.setProperty('--slider-percent', `${percent}%`);
  };

  const handleSyncModeChange = (mode: string) => {
    setSyncModeValue(mode);
    setSyncMode(mode);
    setSyncModeMenuOpen(false);
  };

  const handleActiveSpeakerToggle = (checked: boolean) => {
    setActiveSpeakerOnly(checked);
    updateSettings({ activeSpeakerOnly: checked });
  };

  const handleDetectObstructionsToggle = (checked: boolean) => {
    setDetectObstructions(checked);
    updateSettings({ detectObstructions: checked });
  };

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Element;
      if (syncModeMenuOpen && !target.closest(".custom-dropdown-wrapper")) {
        setSyncModeMenuOpen(false);
      }
    };
    if (syncModeMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [syncModeMenuOpen]);

  // Use state to delay adding 'show' class to ensure initial styles render first
  useEffect(() => {
    if (isOpen) {
      // Small delay to ensure initial state is rendered before animation
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setShouldShow(true);
        });
      });
    } else {
      setShouldShow(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className={`model-selector-overlay ${shouldShow ? "show" : ""}`} onClick={onClose}>
      <div className="model-selector-panel" onClick={(e) => e.stopPropagation()}>
        <div className="model-panel-handle"></div>
        <div className="model-selector-header">
          <h3>choose model</h3>
          <button className="model-selector-close" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="model-options">
          {models.map((model) => (
            <label
              key={model.id}
              className={`model-option ${settings.model === model.id ? "active" : ""}`}
              onClick={() => handleSelectModel(model.id)}
            >
              <input type="radio" name="model" value={model.id} checked={settings.model === model.id} readOnly />
              <div className="model-option-icon">
                {settings.model === model.id && (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                  </svg>
                )}
              </div>
              <div className="model-option-content">
                <div className="model-option-title">
                  <span className="model-name">{model.name}</span>
                  {model.id === "lipsync-2-pro" && <span className="model-badge">new</span>}
                </div>
                <span className="model-desc">{model.description}</span>
              </div>
            </label>
          ))}
        </div>

        <div className="model-divider"></div>

        <div className="model-section-title">preferences</div>

        <div className="model-settings">
          <div className="model-setting-row">
            <div className="model-setting-label">
              <div className="tooltip-wrapper">
              <span>temperature: <span id="modelTempValue">{tempValue.toFixed(1)}</span></span>
                <button className="model-setting-help" type="button">
                  <HelpCircle size={16} />
                </button>
                <div className="tooltip">
                  <strong>temperature</strong>
                  controls the randomness and creativity of the lipsync output. lower values produce more consistent results, while higher values add more variation.
                </div>
              </div>
            </div>
            <div className="model-slider-container">
              <span className="model-slider-min">0</span>
            <div className="model-slider-wrapper">
              <input
                type="range"
                id="modelTemperature"
                className="model-slider"
                min="0"
                max="1"
                step="0.1"
                value={tempValue}
                onChange={(e) => handleTemperatureChange(parseFloat(e.target.value))}
              />
              </div>
              <span className="model-slider-max">1</span>
            </div>
          </div>

          <div className="model-setting-row model-setting-switch model-setting-dropdown">
            <div className="model-setting-label">
              <div className="tooltip-wrapper">
              <span>sync mode</span>
                <button 
                  className="model-setting-help" 
                  type="button"
                  onClick={(e) => e.stopPropagation()}
                >
                  <HelpCircle size={16} />
                </button>
                <div className="tooltip">
                  <strong>sync mode</strong>
                  determines how the video is synchronized with the audio when lengths don't match. choose the mode that best fits your editing workflow.
                </div>
              </div>
            </div>
            <div className="custom-dropdown-wrapper custom-dropdown-up">
              <button
                type="button"
                className="custom-dropdown-trigger"
                id="syncModeBtn"
                onClick={(e) => {
                  e.stopPropagation();
                  setSyncModeMenuOpen(!syncModeMenuOpen);
                }}
              >
                <span id="syncModeValue">{syncModes.find(m => m.id === syncModeValue)?.name || syncModeValue}</span>
                <ChevronUp size={16} style={{ transform: syncModeMenuOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }} />
              </button>
              {syncModeMenuOpen && (
                <div className="custom-dropdown-menu custom-dropdown-menu-up show" id="syncModeMenu">
                  {syncModes.map((mode) => (
                    <div
                      key={mode.id}
                      className={`custom-dropdown-option ${syncModeValue === mode.id ? "active" : ""}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSyncModeChange(mode.id);
                      }}
                    >
                      <span>{mode.name}</span>
                      {mode.tooltip && (
                        <div className="custom-dropdown-tooltip">{mode.tooltip}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="model-setting-row model-setting-switch">
            <div className="model-setting-label">
              <div className="tooltip-wrapper">
              <span>lipsync only active speaker</span>
                <button className="model-setting-help" type="button">
                  <HelpCircle size={16} />
                </button>
                <div className="tooltip">
                  <strong>lipsync only active speaker</strong>
                  when enabled, only the person currently speaking will be lipsynced. useful for multi-person videos where you want to focus on the active speaker.
                </div>
              </div>
            </div>
            <button
              type="button"
              className={`model-pill-toggle ${activeSpeakerOnly ? "active" : ""}`}
              onClick={() => handleActiveSpeakerToggle(!activeSpeakerOnly)}
            >
              <span className="model-pill-toggle-slider"></span>
            </button>
          </div>

          <div className="model-setting-row model-setting-switch">
            <div className="model-setting-label">
              <div className="tooltip-wrapper">
              <span>detect obstructions</span>
                <button className="model-setting-help" type="button">
                  <HelpCircle size={16} />
                </button>
                <div className="tooltip">
                  <strong>detect obstructions</strong>
                  when enabled, the model will detect and account for objects that may obstruct the mouth area (like hands, microphones, etc.) for more accurate lipsync results.
                </div>
              </div>
            </div>
            <button
              type="button"
              className={`model-pill-toggle ${detectObstructions ? "active" : ""}`}
              onClick={() => handleDetectObstructionsToggle(!detectObstructions)}
            >
              <span className="model-pill-toggle-slider"></span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ModelSelector;
