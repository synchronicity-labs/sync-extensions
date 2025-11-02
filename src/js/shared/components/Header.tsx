import React, { useState } from "react";
import { Film, History, Settings, CreditCard, Key, HelpCircle } from "lucide-react";
import { Tab } from "../hooks/useTabs";
import whiteIcon from "../../assets/icons/white_icon.png";
import avatarIcon from "../../assets/icons/avatar.png";

interface HeaderProps {
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
}

const Header: React.FC<HeaderProps> = ({ activeTab, setActiveTab }) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);

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
            onClick={() => setActiveTab("sources")}
          >
            <Film size={16} />
            <span>sources</span>
          </button>
          <button
            className={`tab-switch ${activeTab === "history" ? "active" : ""}`}
            onClick={() => setActiveTab("history")}
          >
            <History size={16} />
            <span>history</span>
          </button>
        </div>
      </div>

      <div className="header-section header-right">
        <div className="profile-menu">
          <button className="profile-btn" onClick={() => setDropdownOpen(!dropdownOpen)}>
            <img src={avatarIcon} alt="Profile" className="avatar" width="32" height="32" />
          </button>
          {dropdownOpen && (
            <div className="profile-dropdown show">
              <div className="dropdown-content">
                <div className="dropdown-item-wrapper">
                  <div className="dropdown-item" onClick={() => { setActiveTab("settings"); setDropdownOpen(false); }}>
                    <Settings size={16} style={{ color: "#ff7700" }} />
                    <span>extension settings</span>
                  </div>
                </div>
                <a href="https://sync.so/billing/subscription" className="dropdown-item" target="_blank" rel="noopener noreferrer">
                  <CreditCard size={16} style={{ color: "#ff7700" }} />
                  <span>billing</span>
                </a>
                <a href="https://sync.so/settings/api-keys" className="dropdown-item" target="_blank" rel="noopener noreferrer">
                  <Key size={16} style={{ color: "#ff7700" }} />
                  <span>api keys</span>
                </a>
                <a href="https://docs.sync.so/" className="dropdown-item" target="_blank" rel="noopener noreferrer">
                  <HelpCircle size={16} style={{ color: "#ff7700" }} />
                  <span>docs and support</span>
                </a>
                <div className="dropdown-version">
                  <p>
                    v.0.4.0 ·
                    <span className="update-link">check for updates</span>
                  </p>
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

