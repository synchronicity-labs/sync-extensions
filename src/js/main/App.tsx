import React, { useEffect } from "react";
import { useCore } from "../shared/hooks/useCore";
import { useTabs } from "../shared/hooks/useTabs";
import { useServerAutoStart } from "../shared/hooks/useServerAutoStart";
import { useNLE } from "../shared/hooks/useNLE";
import { useMedia } from "../shared/hooks/useMedia";
import { useJobs } from "../shared/hooks/useJobs";
import { useHistory } from "../shared/hooks/useHistory";
import { setupWindowGlobals } from "../shared/utils/windowGlobals";
import Header from "../shared/components/Header";
import SourcesTab from "../shared/components/SourcesTab";
import HistoryTab from "../shared/components/HistoryTab";
import SettingsTab from "../shared/components/SettingsTab";
import BottomBar from "../shared/components/BottomBar";
import "../shared/styles/main.scss";

const App: React.FC = () => {
  const { activeTab, setActiveTab } = useTabs();
  const { startOfflineChecking, nle } = useCore();
  const core = useCore();
  const media = useMedia();
  const jobs = useJobs();
  const tabs = useTabs();
  const history = useHistory();
  useServerAutoStart();

  // Setup window globals for backward compatibility
  useEffect(() => {
    setupWindowGlobals(media, jobs, tabs, core, history);
  }, [media, jobs, tabs, core, history]);

  useEffect(() => {
    // Initialize app
    if (typeof window !== "undefined" && window.CSInterface) {
      // Initialize PostHog interceptors before PostHog loads
      const initPostHogInterceptors = () => {
        try {
          // Intercept fetch requests for PostHog uploads
          const originalFetch = window.fetch;
          window.fetch = function (url: RequestInfo | URL, options?: RequestInit) {
            if (typeof url === "string" && url.includes("posthog.com") && 
                options?.method === "POST" &&
                (url.includes("/e/") || url.includes("/s/"))) {
              const proxyUrl = "http://127.0.0.1:3000/telemetry/session-replay";
              const proxyOptions = {
                ...options,
                headers: {
                  ...options.headers,
                  "X-Posthog-Original-Url": url,
                },
              };
              return originalFetch(proxyUrl, proxyOptions);
            }
            return originalFetch.apply(this, arguments as any);
          };
        } catch (e) {
          // Silently fail
        }
      };

      initPostHogInterceptors();
      
      // Start offline checking
      startOfflineChecking();
      
      // Load host script
      if (nle) {
        nle.loadHostScript();
      }
    }
  }, [startOfflineChecking, nle]);

  // Load PostHog scripts
  useEffect(() => {
    const loadPostHog = () => {
      const scripts = [
        "../../lib/posthog.js",
        "../../lib/posthog-recorder.js",
      ];
      
      scripts.forEach((src) => {
        const script = document.createElement("script");
        script.src = src;
        script.async = true;
        document.head.appendChild(script);
      });
    };

    loadPostHog();
  }, []);

  // Initialize Lucide icons for data-lucide attributes
  useEffect(() => {
    const initLucideIcons = () => {
      // Check if lucide is already loaded
      if ((window as any).lucide && (window as any).lucide.createIcons) {
        (window as any).lucide.createIcons();
        return;
      }

      // Load lucide.js library
      const script = document.createElement("script");
      script.src = "../../lib/lucide.js";
      script.onload = () => {
        if ((window as any).lucide && (window as any).lucide.createIcons) {
          (window as any).lucide.createIcons();
        }
      };
      document.head.appendChild(script);
    };

    initLucideIcons();

    // Re-initialize icons when tab changes (for dynamically rendered content)
    const timer = setTimeout(() => {
      if ((window as any).lucide && (window as any).lucide.createIcons) {
        (window as any).lucide.createIcons();
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [activeTab]);

  return (
    <div className="app-container">
      <Header activeTab={activeTab} setActiveTab={setActiveTab} />
      <div className="content">
        {activeTab === "sources" && <SourcesTab />}
        {activeTab === "history" && <HistoryTab />}
        {activeTab === "settings" && <SettingsTab />}
      </div>
      <BottomBar />
    </div>
  );
};

export default App;

