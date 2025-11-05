import React, { useState, useEffect, useRef } from "react";
import { Film, History, Settings, CreditCard, Key, HelpCircle } from "lucide-react";
import { Tab } from "../hooks/useTabs";
import { useHostDetection } from "../hooks/useHostDetection";
import { getExtensionVersion } from "../utils/version";
import { getApiUrl } from "../utils/serverConfig";
import whiteIcon from "../../assets/icons/white_icon.png";
import avatarIcon from "../../assets/icons/avatar.png";

interface HeaderProps {
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
}

const Header: React.FC<HeaderProps> = ({ activeTab, setActiveTab }) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [extensionVersion, setExtensionVersion] = useState<string>("0.4.0");
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { hostConfig } = useHostDetection();

  // Load extension version from manifest on mount
  useEffect(() => {
    const loadVersion = async () => {
      try {
        const version = await getExtensionVersion();
        if (version) {
          setExtensionVersion(version);
        }
      } catch (_) {
        // Keep default version if loading fails
      }
    };
    loadVersion();
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };

    if (dropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [dropdownOpen]);

  // Close dropdown when tab changes
  useEffect(() => {
    setDropdownOpen(false);
  }, [activeTab]);

  const handleTabClick = (tab: Tab) => {
    setActiveTab(tab);
    setDropdownOpen(false);
  };

  const showToast = (message: string, type: "info" | "success" | "error" = "info", duration: number = 3000, action?: { text: string; onClick: () => void }) => {
    const toast = document.createElement("div");
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 24px;
      background: ${type === "error" ? "#dc2626" : type === "success" ? "#22c55e" : "#222225"};
      color: white;
      border-radius: 6px;
      z-index: 10000;
      font-family: var(--font-family);
      font-size: 14px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
      max-width: 400px;
    `;
    
    if (action) {
      const messageDiv = document.createElement("div");
      messageDiv.style.marginBottom = "8px";
      messageDiv.textContent = message;
      toast.appendChild(messageDiv);
      
      const button = document.createElement("button");
      button.textContent = action.text;
      button.style.cssText = `
        background: rgba(255,255,255,0.2);
        border: none;
        color: white;
        padding: 6px 12px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
        margin-top: 8px;
      `;
      button.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        action.onClick();
        // Remove toast immediately when button is clicked
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      });
      toast.appendChild(button);
    } else {
      toast.textContent = message;
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
    }, duration);
  };

  const reloadPanel = () => {
    try {
      // Clear browser cache before reload to ensure new files are loaded
      // Add cache-busting query parameter to force fresh load
      const url = new URL(window.location.href);
      url.searchParams.set('_update', Date.now().toString());
      
      // Try to clear cache (may not work in all CEP contexts)
      if ('caches' in window && window.caches) {
        window.caches.keys().then(names => {
          names.forEach(name => window.caches.delete(name));
        }).catch(() => {});
      }
      
      // Reload with cache-busting parameter
      window.location.href = url.toString();
    } catch (_) {
      // Fallback to simple reload
      window.location.reload();
    }
  };

  const handleCheckForUpdates = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (checkingUpdate) return;
    
    setCheckingUpdate(true);
    try {
      // Step 1: Check for updates
      const checkResponse = await fetch(getApiUrl("/update/check"));
      const checkData = await checkResponse.json().catch(() => null);
      
      if (!checkResponse.ok || !checkData?.ok) {
        showToast("Failed to check for updates. Please try again later.", "error");
        return;
      }

      if (!checkData.canUpdate || !checkData.latest) {
        // Already up to date
        showToast(`You're up to date! (v.${checkData.current || extensionVersion})`, "success");
        return;
      }

      // Step 2: Update available - show downloading message
      showToast(`Downloading update v.${checkData.latest}...`, "info", 5000);

      // Step 3: Apply the update automatically
      try {
        const applyResponse = await fetch(getApiUrl("/update/apply"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        });

        const applyData = await applyResponse.json().catch(() => null);

        if (!applyResponse.ok || !applyData?.ok) {
          const errorMsg = applyData?.error || applyData?.message || "Failed to install update";
          showToast(`Update failed: ${errorMsg}`, "error", 5000);
          return;
        }

        if (applyData.updated === false) {
          // Already up to date (edge case)
          showToast(`You're up to date! (v.${applyData.current || extensionVersion})`, "success");
          return;
        }

        // Step 4: Update successful - prompt to reload
        showToast(
          `Update installed successfully!`,
          "success",
          10000,
          {
            text: "Reload Panel",
            onClick: () => {
              reloadPanel();
            }
          }
        );
      } catch (applyError) {
        showToast(`Update installation failed: ${applyError instanceof Error ? applyError.message : 'Unknown error'}`, "error", 5000);
      }
    } catch (error) {
      // Network error
      showToast("Unable to check for updates. Please check your connection.", "error");
    } finally {
      setCheckingUpdate(false);
    }
  };

  return (
    <div className="app-header">
      <div className="header-section header-left">
        <a href="https://sync.so" className="logo">
          <img src={whiteIcon} alt="sync." width="32" height="32" />
        </a>
      </div>

      <div className="header-section header-center">
        <div className="tab-switcher">
          <button
            className={`tab-switch ${activeTab === "sources" ? "active" : ""}`}
            onClick={() => handleTabClick("sources")}
          >
            <Film size={16} />
            <span>sources</span>
          </button>
          <button
            className={`tab-switch ${activeTab === "history" ? "active" : ""}`}
            onClick={() => handleTabClick("history")}
          >
            <History size={16} />
            <span>history</span>
          </button>
        </div>
      </div>

      <div className="header-section header-right">
        <div className="profile-menu" ref={dropdownRef}>
          <button className="profile-btn" onClick={() => setDropdownOpen(!dropdownOpen)}>
            <img src={avatarIcon} alt="Profile" className="avatar" width="32" height="32" />
          </button>
          {dropdownOpen && (
            <div className="profile-dropdown show">
              <div className="dropdown-content">
                <div className="dropdown-item-wrapper">
                  <div className="dropdown-item" onClick={() => handleTabClick("settings")}>
                    <Settings size={16} style={{ color: "#ff7700" }} />
                    <span>extension settings</span>
                  </div>
                </div>
                <a href="https://sync.so/billing/subscription" className="dropdown-item" target="_blank" rel="noopener noreferrer" onClick={() => setDropdownOpen(false)}>
                  <CreditCard size={16} style={{ color: "#ff7700" }} />
                  <span>billing</span>
                </a>
                <a href="https://sync.so/settings/api-keys" className="dropdown-item" target="_blank" rel="noopener noreferrer" onClick={() => setDropdownOpen(false)}>
                  <Key size={16} style={{ color: "#ff7700" }} />
                  <span>api keys</span>
                </a>
                <a href="https://docs.sync.so/" className="dropdown-item" target="_blank" rel="noopener noreferrer" onClick={() => setDropdownOpen(false)}>
                  <HelpCircle size={16} style={{ color: "#ff7700" }} />
                  <span>docs and support</span>
                </a>
                <div className="dropdown-version">
                  <p>
                    v.{extensionVersion} ·
                    <span 
                      className="update-link" 
                      onClick={handleCheckForUpdates}
                      style={{ cursor: checkingUpdate ? 'wait' : 'pointer', opacity: checkingUpdate ? 0.6 : 1 }}
                    >
                      {checkingUpdate ? 'checking...' : 'check for updates'}
                    </span>
                  </p>
                  {hostConfig && (
                    <p style={{ fontSize: "11px", color: "#999", marginTop: "4px" }}>
                      {hostConfig.hostName} ({hostConfig.hostId})
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Header;

