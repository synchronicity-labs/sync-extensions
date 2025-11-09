import React, { useEffect } from "react";
import { useCore } from "../shared/hooks/useCore";
import { useTabs, TabsProvider } from "../shared/hooks/useTabs";
import { useServerAutoStart } from "../shared/hooks/useServerAutoStart";
import { useNLE } from "../shared/hooks/useNLE";
import { useMedia } from "../shared/hooks/useMedia";
import { useJobs } from "../shared/hooks/useJobs";
import { useHistory } from "../shared/hooks/useHistory";
import { setupWindowGlobals } from "../shared/utils/windowGlobals";
import { getApiUrl } from "../shared/utils/serverConfig";
import Header from "../shared/components/Header";
import SourcesTab from "../shared/components/SourcesTab";
import HistoryTab from "../shared/components/HistoryTab";
import SettingsTab from "../shared/components/SettingsTab";
import BottomBar from "../shared/components/BottomBar";
import "../shared/styles/main.scss";

const AppContent: React.FC = () => {
  const { activeTab, setActiveTab } = useTabs();
  const core = useCore();
  const { startOfflineChecking, nle } = core;
  const media = useMedia();
  const jobs = useJobs();
  const history = useHistory();
  useServerAutoStart();

  // Setup window globals for backward compatibility
  useEffect(() => {
    setupWindowGlobals(media, jobs, { setActiveTab, activeTab }, core, history);
  }, [media, jobs, setActiveTab, activeTab, core, history]);

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
              const proxyUrl = getApiUrl("/telemetry/session-replay");
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
      if (window.lucide && window.lucide.createIcons) {
        window.lucide.createIcons();
        // Replace globe icons with languages icons in dubbing contexts
        replaceGlobeWithLanguages();
        return;
      }

      // Load lucide.js library
      const script = document.createElement("script");
      script.src = "../../lib/lucide.js";
      script.onload = () => {
        if (window.lucide && window.lucide.createIcons) {
          window.lucide.createIcons();
          // Replace globe icons with languages icons in dubbing contexts
          replaceGlobeWithLanguages();
        }
      };
      document.head.appendChild(script);
    };

    // Helper function to replace globe icons with languages icons
    const replaceGlobeWithLanguages = () => {
      try {
        // Find all globe icons in dubbing contexts
        const selectors = [
          '.dubbing-dropdown-header i[data-lucide="globe"]',
          '.dubbing-dropdown-header i[data-lucide="Globe"]',
          '.audio-dubbing-btn i[data-lucide="globe"]',
          '.audio-dubbing-btn i[data-lucide="Globe"]',
          '.audio-dubbing-submit-btn i[data-lucide="globe"]',
          '.audio-dubbing-submit-btn i[data-lucide="Globe"]',
        ];
        
        selectors.forEach(selector => {
          const elements = document.querySelectorAll(selector);
          elements.forEach(el => {
            el.setAttribute('data-lucide', 'languages');
          });
        });
        
        // Re-initialize icons after replacement
        if (window.lucide && window.lucide.createIcons) {
          window.lucide.createIcons();
        }
      } catch (e) {
        // Silently fail
      }
    };

    initLucideIcons();

    // Re-initialize icons when tab changes (for dynamically rendered content)
    // Use double RAF to ensure React has finished all DOM operations
    let rafId1: number;
    let rafId2: number;
    const timer = setTimeout(() => {
      rafId1 = requestAnimationFrame(() => {
        rafId2 = requestAnimationFrame(() => {
          try {
            // Only initialize icons on currently visible tab content
            const activePane = document.querySelector('.tab-pane.active');
            if (activePane && window.lucide && window.lucide.createIcons) {
              // Scope to active pane only to avoid conflicts with unmounting components
              window.lucide.createIcons({ root: activePane });
        replaceGlobeWithLanguages();
      }
          } catch (e) {
            // Silently ignore DOM errors
          }
        });
      });
    }, 100);

    return () => {
      clearTimeout(timer);
      if (rafId1) cancelAnimationFrame(rafId1);
      if (rafId2) cancelAnimationFrame(rafId2);
    };
  }, [activeTab]);

  return (
    <div className="app-container">
      <Header activeTab={activeTab} setActiveTab={setActiveTab} />
      <div className="content">
        <SourcesTab />
        <HistoryTab />
        <SettingsTab />
      </div>
      <BottomBar />
    </div>
  );
};

const App: React.FC = () => {
  return (
    <TabsProvider>
      <AppContent />
    </TabsProvider>
  );
};

export default App;

