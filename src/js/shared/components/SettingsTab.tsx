import React, { useState, useEffect } from "react";
import { Copy, Info } from "lucide-react";
import { useSettings } from "../hooks/useSettings";
import { useTabs } from "../hooks/useTabs";

const SettingsTab: React.FC = () => {
  const { settings, setApiKey, setModel, setTemperature, setSyncMode, setRenderVideo, setRenderAudio, setSaveLocation } = useSettings();
  const [activeSettingsTab, setActiveSettingsTab] = useState<"global" | "render">("global");
  const { activeTab } = useTabs();

  // Re-initialize Lucide icons when component mounts or tab changes
  useEffect(() => {
    const timer = setTimeout(() => {
      if ((window as any).lucide && (window as any).lucide.createIcons) {
        (window as any).lucide.createIcons();
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [activeSettingsTab]);

  const handleCopyApiKey = (keyType: "sync" | "elevenlabs") => {
    const key = keyType === "sync" ? settings.syncApiKey : settings.elevenlabsApiKey;
    if (key) {
      navigator.clipboard.writeText(key).catch(() => {
        // Fallback for older browsers
        const textarea = document.createElement("textarea");
        textarea.value = key;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      });
    }
  };

  const handleInfoClick = (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
  };

  // Ensure renderVideo defaults to mp4 if not set
  useEffect(() => {
    if (!settings.renderVideo || (settings.renderVideo !== "mp4" && settings.renderVideo !== "prores_422" && settings.renderVideo !== "prores_422hq" && settings.renderVideo !== "h264")) {
      setRenderVideo("mp4");
    } else if (settings.renderVideo === "h264") {
      // Migrate h264 to mp4
      setRenderVideo("mp4");
    }
  }, [settings.renderVideo, setRenderVideo]);

  return (
    <div id="settings" className={`tab-pane ${activeTab === "settings" ? "active" : ""}`}>
      <div className="settings-container">
        <div className="settings-header">
          <div className="settings-tabs-nav">
            <button
              className={`settings-tab-btn ${activeSettingsTab === "global" ? "active" : ""}`}
              onClick={() => setActiveSettingsTab("global")}
            >
              <span>global settings</span>
              <div className="tab-underline"></div>
            </button>
            <button
              className={`settings-tab-btn ${activeSettingsTab === "render" ? "active" : ""}`}
              onClick={() => setActiveSettingsTab("render")}
            >
              <span>render settings</span>
              <div className="tab-underline"></div>
            </button>
          </div>
        </div>

        {activeSettingsTab === "global" && (
          <div id="global" className="settings-tab-pane active">
            <div className="settings-section api-keys-section">
              <h3 className="settings-section-title">api keys</h3>
              <div className="api-keys-wrapper">
                <div className="api-key-row">
                  <input
                    type="password"
                    id="syncApiKey"
                    className="api-key-input"
                    placeholder="sync. api key"
                    value={settings.syncApiKey}
                    onChange={(e) => setApiKey(e.target.value, "sync")}
                  />
                  <div className="api-key-buttons">
                    <i data-lucide="check" className="api-key-checkmark" style={{ display: settings.syncApiKey ? "block" : "none" }}></i>
                    <button className="api-key-btn copy-btn" title="Copy" onClick={() => handleCopyApiKey("sync")}>
                      <Copy size={14} />
                    </button>
                    <button className="api-key-btn info-btn" title="Info" onClick={() => handleInfoClick("https://docs.sync.so/quickstart#create-your-api-key")}>
                      <Info size={14} />
                    </button>
                  </div>
                </div>
                <div className="api-key-row">
                  <input
                    type="password"
                    id="elevenlabsApiKey"
                    className="api-key-input"
                    placeholder="elevenlabs api key"
                    value={settings.elevenlabsApiKey}
                    onChange={(e) => setApiKey(e.target.value, "elevenlabs")}
                  />
                  <div className="api-key-buttons">
                    <i data-lucide="check" className="api-key-checkmark" style={{ display: settings.elevenlabsApiKey ? "block" : "none" }}></i>
                    <button className="api-key-btn copy-btn" title="Copy" onClick={() => handleCopyApiKey("elevenlabs")}>
                      <Copy size={14} />
                    </button>
                    <button className="api-key-btn info-btn" title="Info" onClick={() => handleInfoClick("https://elevenlabs.io/app/settings/api-keys")}>
                      <Info size={14} />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="settings-section save-files-section">
              <h3 className="settings-section-title">save files</h3>
              <div className="save-files-grid">
                <button
                  className={`save-option ${settings.saveLocation === "project" ? "active" : ""}`}
                  onClick={() => setSaveLocation("project")}
                >
                  <i data-lucide="list-video" style={{ width: "45px", height: "45px" }}></i>
                  <span>per project folder (sync. outputs)</span>
                </button>
                <button
                  className={`save-option ${settings.saveLocation === "universal" ? "active" : ""}`}
                  onClick={() => setSaveLocation("universal")}
                >
                  <i data-lucide="folder-open-dot" style={{ width: "45px", height: "45px" }}></i>
                  <span>universal folder in ~/documents</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {activeSettingsTab === "render" && (
          <div id="render" className="settings-tab-pane active">
            <div className="settings-section render-video-section">
              <h3 className="settings-section-title">video settings</h3>
              <div className="render-grid">
                <button
                  className={`render-option video-option ${settings.renderVideo === "mp4" || settings.renderVideo === "h264" ? "active" : ""}`}
                  onClick={() => setRenderVideo("mp4")}
                >
                  <span className="render-format-name">mp4</span>
                  <span className="render-format-desc">h.264</span>
                </button>
                <div className="render-option video-option prores-container">
                  <div className="prores-header">
                    <span className="render-format-name">prores</span>
                  </div>
                  <div className="prores-options">
                    <button 
                      className={`prores-option ${settings.renderVideo === "prores_422" ? "active" : ""}`} 
                      onClick={() => setRenderVideo("prores_422")}
                    >
                      422
                    </button>
                    <button 
                      className={`prores-option ${settings.renderVideo === "prores_422hq" ? "active" : ""}`} 
                      onClick={() => setRenderVideo("prores_422hq")}
                    >
                      422 hq
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="settings-section render-audio-section">
              <h3 className="settings-section-title">audio settings</h3>
              <div className="render-grid">
                <button
                  className={`render-option audio-option ${settings.renderAudio === "mp3" ? "active" : ""}`}
                  onClick={() => setRenderAudio("mp3")}
                >
                  <span className="render-format-name">mp3</span>
                  <span className="render-format-desc">320kbps</span>
                </button>
                <button
                  className={`render-option audio-option ${settings.renderAudio === "wav" ? "active" : ""}`}
                  onClick={() => setRenderAudio("wav")}
                >
                  <span className="render-format-name">wav</span>
                  <span className="render-format-desc">32bit</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SettingsTab;
