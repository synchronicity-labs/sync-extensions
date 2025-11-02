import React, { useState, useEffect } from "react";
import { X } from "lucide-react";
import { useSettings } from "../hooks/useSettings";

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

  useEffect(() => {
    setTempValue(settings.temperature);
    setSyncModeValue(settings.syncMode);
    setActiveSpeakerOnly(settings.activeSpeakerOnly);
    setDetectObstructions(settings.detectObstructions);
  }, [settings]);

  const models = [
    { id: "lipsync-1.9.0-beta", name: "lipsync 1.9", description: "our fastest lipsync model yet" },
    { id: "lipsync-2", name: "lipsync 2", description: "our best model yet: high-res + matches speaker style" },
    { id: "lipsync-2-pro", name: "lipsync 2 pro", description: "lipsync 2, optimized for the highest resolution" },
  ];

  const syncModes = [
    { id: "bounce", name: "bounce" },
    { id: "loop", name: "loop" },
    { id: "cutoff", name: "cut off" },
    { id: "silence", name: "silence" },
    { id: "remap", name: "remap" },
  ];

  const handleSelectModel = (modelId: string) => {
    setModel(modelId);
  };

  const handleTemperatureChange = (value: number) => {
    setTempValue(value);
    setTemperature(value);
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
      if (syncModeMenuOpen && !(e.target as Element).closest(".custom-dropdown-wrapper")) {
        setSyncModeMenuOpen(false);
      }
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [syncModeMenuOpen]);

  if (!isOpen) return null;

  return (
    <div className={`model-selector-overlay ${isOpen ? "show" : ""}`} onClick={onClose}>
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
            <label className="model-setting-label">
              <span>temperature: <span id="modelTempValue">{tempValue.toFixed(1)}</span></span>
            </label>
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
          </div>

          <div className="model-setting-row model-setting-switch model-setting-dropdown">
            <label className="model-setting-label">
              <span>sync mode</span>
            </label>
            <div className="custom-dropdown-wrapper">
              <button
                type="button"
                className="custom-dropdown-trigger"
                id="syncModeBtn"
                onClick={() => setSyncModeMenuOpen(!syncModeMenuOpen)}
              >
                <span id="syncModeValue">{syncModeValue}</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M7 10l5 5 5-5z" />
                </svg>
              </button>
              {syncModeMenuOpen && (
                <div className="custom-dropdown-menu show" id="syncModeMenu">
                  {syncModes.map((mode) => (
                    <div
                      key={mode.id}
                      className={`custom-dropdown-option ${syncModeValue === mode.id ? "active" : ""}`}
                      onClick={() => handleSyncModeChange(mode.id)}
                    >
                      <span>{mode.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="model-setting-row model-setting-switch">
            <label className="model-setting-label">
              <span>lipsync only active speaker</span>
            </label>
            <label className="model-toggle">
              <input
                type="checkbox"
                id="modelActiveSpeaker"
                checked={activeSpeakerOnly}
                onChange={(e) => handleActiveSpeakerToggle(e.target.checked)}
              />
              <span className="model-toggle-slider"></span>
            </label>
          </div>

          <div className="model-setting-row model-setting-switch">
            <label className="model-setting-label">
              <span>detect obstructions</span>
            </label>
            <label className="model-toggle">
              <input
                type="checkbox"
                id="modelDetectObstructions"
                checked={detectObstructions}
                onChange={(e) => handleDetectObstructionsToggle(e.target.checked)}
              />
              <span className="model-toggle-slider"></span>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ModelSelector;
