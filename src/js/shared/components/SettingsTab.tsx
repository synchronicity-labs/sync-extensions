import React, { useState, useEffect } from "react";
import { Info } from "lucide-react";
import { useSettings } from "../hooks/useSettings";
import { useTabs } from "../hooks/useTabs";
import { getApiUrl } from "../utils/serverConfig";

const SettingsTab: React.FC = () => {
  const { settings, setApiKey, setModel, setTemperature, setSyncMode, setRenderVideo, setRenderAudio, setSaveLocation } = useSettings();
  const [activeSettingsTab, setActiveSettingsTab] = useState<"global" | "render">("global");
  const { activeTab } = useTabs();
  const [debugEnabled, setDebugEnabled] = useState(false);
  const [debugLoading, setDebugLoading] = useState(false);

  // Check debug status on mount and when settings tab becomes active
  useEffect(() => {
    const checkDebugStatus = async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout
        try {
          const response = await fetch(getApiUrl("/debug/status"), {
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
          if (response.ok) {
            const data = await response.json();
            setDebugEnabled(data.enabled || false);
          }
        } catch (error: any) {
          clearTimeout(timeoutId);
          // Server might not be running - that's okay, just leave debugEnabled as false
          // Don't set an error state, just silently fail
        }
      } catch (error) {
        // Silently fail
      }
    };
    
    // Check immediately
    checkDebugStatus();
    
    // Also check when settings tab becomes active (in case server started after mount)
    if (activeTab === "settings") {
      const interval = setInterval(() => {
        checkDebugStatus();
      }, 5000); // Check every 5 seconds when settings tab is active
      
      return () => clearInterval(interval);
    }
  }, [activeTab]);

  // Re-initialize Lucide icons when component mounts or tab changes
  useEffect(() => {
    const timer = setTimeout(() => {
      if ((window as any).lucide && (window as any).lucide.createIcons) {
        (window as any).lucide.createIcons();
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [activeSettingsTab]);

  const handleDebugToggle = async () => {
    if (debugLoading) return;
    setDebugLoading(true);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
      
      try {
        const response = await fetch(getApiUrl("/debug/toggle"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled: !debugEnabled }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        
        if (response.ok) {
          const data = await response.json();
          setDebugEnabled(data.enabled || false);
        } else {
            // Server responded but with error - try to check status
          try {
            const statusController = new AbortController();
            const statusTimeoutId = setTimeout(() => statusController.abort(), 2000);
            try {
              const statusResponse = await fetch(getApiUrl("/debug/status"), {
                signal: statusController.signal,
              });
              clearTimeout(statusTimeoutId);
              if (statusResponse.ok) {
                const statusData = await statusResponse.json();
                setDebugEnabled(statusData.enabled || false);
              }
            } catch (_) {
              clearTimeout(statusTimeoutId);
              // Status check failed too
            }
          } catch (_) {
            // Status check failed
          }
        }
      } catch (error: any) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
          // Request timed out - server might not be running
          // Don't show error, just leave state as is
        } else {
          // Other error - server might not be running
          // Try to check if server is available
          try {
            const healthController = new AbortController();
            const healthTimeoutId = setTimeout(() => healthController.abort(), 2000);
            try {
              const healthCheck = await fetch(getApiUrl("/health"), {
                signal: healthController.signal,
              });
              clearTimeout(healthTimeoutId);
              if (!healthCheck.ok) {
                // Server not running - that's okay, user will see it when server starts
              }
            } catch (_) {
              clearTimeout(healthTimeoutId);
              // Health check failed - server not running
            }
          } catch (_) {
            // Health check failed
          }
        }
      }
    } catch (error) {
      // Silently fail - server might not be running yet
    } finally {
      setDebugLoading(false);
    }
  };

  const handleInfoClick = (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
  };

  // Ensure renderVideo defaults to mp4 if not set, and default to 422hq when mov is selected
  useEffect(() => {
    if (!settings.renderVideo || (settings.renderVideo !== "mp4" && settings.renderVideo !== "prores_422" && settings.renderVideo !== "prores_422hq" && settings.renderVideo !== "h264")) {
      setRenderVideo("mp4");
    } else if (settings.renderVideo === "h264") {
      // Migrate h264 to mp4
      setRenderVideo("mp4");
    }
  }, [settings.renderVideo, setRenderVideo]);

  // Helper to check if mov/prores is selected
  const isMovSelected = settings.renderVideo === "prores_422" || settings.renderVideo === "prores_422hq";
  
  // When switching to mov, default to 422hq
  const handleMovClick = () => {
    if (!isMovSelected) {
      setRenderVideo("prores_422hq");
    }
  };

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

            <div className="settings-section debug-section">
              <h3 className="settings-section-title">debug</h3>
              <div className="debug-setting-row">
                <div className="debug-setting-label">
                  <span>enable debug logging</span>
                </div>
                <button
                  type="button"
                  className={`model-pill-toggle ${debugEnabled ? "active" : ""}`}
                  onClick={handleDebugToggle}
                  disabled={debugLoading}
                >
                  <span className="model-pill-toggle-slider"></span>
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
                <div className={`render-option video-option prores-container ${isMovSelected ? "active" : ""}`} onClick={handleMovClick}>
                  <div className="prores-header">
                    <span className="render-format-name">mov</span>
                  </div>
                  <div className="prores-options">
                    <button 
                      className={`prores-option ${settings.renderVideo === "prores_422" ? "active" : ""}`} 
                      onClick={(e) => { e.stopPropagation(); setRenderVideo("prores_422"); }}
                    >
                      422
                    </button>
                    <button 
                      className={`prores-option ${settings.renderVideo === "prores_422hq" ? "active" : ""}`} 
                      onClick={(e) => { e.stopPropagation(); setRenderVideo("prores_422hq"); }}
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
