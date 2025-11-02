import React, { useEffect } from "react";
import { useHostDetection } from "../../shared/hooks/useHostDetection";
import Header from "../../shared/components/Header";
import SourcesTab from "../../shared/components/SourcesTab";
import HistoryTab from "../../shared/components/HistoryTab";
import SettingsTab from "../../shared/components/SettingsTab";
import BottomBar from "../../shared/components/BottomBar";
import { useTabs } from "../../shared/hooks/useTabs";
import { useCore } from "../../shared/hooks/useCore";
import { useNLE } from "../../shared/hooks/useNLE";
import { useServerAutoStart } from "../../shared/hooks/useServerAutoStart";
import "../../shared/styles/main.scss";

const App: React.FC = () => {
  const { activeTab, setActiveTab } = useTabs();
  const { hostConfig } = useHostDetection();
  const { startOfflineChecking } = useCore();
  const { nle } = useNLE();
  useServerAutoStart();

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

  return (
    <div className="app-container">
      <Header activeTab={activeTab} setActiveTab={setActiveTab} />
      
      <div className="content-wrapper">
        {activeTab === "sources" && <SourcesTab />}
        {activeTab === "history" && <HistoryTab />}
        {activeTab === "settings" && <SettingsTab />}
      </div>

      <BottomBar />
    </div>
  );
};

export default App;

