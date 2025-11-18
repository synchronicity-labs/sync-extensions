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
    const init = async () => {
      try {
        // Load settings (for backward compatibility)
        if (typeof (window as any).loadSettings === "function") {
          (window as any).loadSettings();
        }
      } catch (_) {}

      try {
        // Load jobs from localStorage (for backward compatibility)
        if (typeof (window as any).loadJobsLocal === "function") {
          (window as any).loadJobsLocal();
        }
      } catch (_) {}

      try {
        // Update model display
        if (typeof (window as any).updateModelDisplay === "function") {
          (window as any).updateModelDisplay();
        }
      } catch (_) {}

      try {
        // Update from video button
        if (typeof (window as any).updateFromVideoButton === "function") {
          (window as any).updateFromVideoButton();
        }
      } catch (_) {}

      // Ensure auth token
      try {
        if (typeof (window as any).ensureAuthToken === "function") {
          await (window as any).ensureAuthToken();
        }
      } catch (_) {}
    };

    // Listen for backend ready event and load jobs from server
    const handleBackendReady = async (e: CustomEvent) => {
      try {
        if (e.detail && e.detail.port) {
          (window as any).__syncServerPort = e.detail.port;
        }
        // Load jobs from server once backend is ready
        if (typeof (window as any).loadJobsFromServer === "function") {
          await (window as any).loadJobsFromServer();
        }
      } catch (_) {}
    };

    window.addEventListener("sync-backend-ready", handleBackendReady as EventListener);

    // Run initialization after a short delay to ensure DOM is ready
    const timer = setTimeout(() => {
      init();
    }, 100);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("sync-backend-ready", handleBackendReady as EventListener);
    };
  }, []);

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
    const normalizeButtonIcons = () => {
      // Ensure all button icons have consistent sizing
      document.querySelectorAll('button i').forEach((icon: any) => {
        const svg = icon.querySelector('svg');
        if (svg) {
          // Only normalize 32px button icons (16px icons)
          const button = icon.closest('button');
          if (button && (button.classList.contains('history-btn') || 
                         button.classList.contains('post-action-btn') ||
                         button.classList.contains('action-btn'))) {
            svg.setAttribute('width', '16');
            svg.setAttribute('height', '16');
            svg.style.width = '16px';
            svg.style.height = '16px';
            svg.style.maxWidth = '16px';
            svg.style.maxHeight = '16px';
            svg.style.minWidth = '16px';
            svg.style.minHeight = '16px';
            svg.setAttribute('stroke-width', '2');
            svg.querySelectorAll('path, circle, rect, line, polyline, polygon').forEach((el: any) => {
              el.setAttribute('stroke-width', '2');
            });
          }
        }
      });
    };

    const initLucideIcons = () => {
      // Check if lucide is already loaded
      if (window.lucide && window.lucide.createIcons) {
        window.lucide.createIcons();
        normalizeButtonIcons();
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
          normalizeButtonIcons();
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
              // Normalize button icon sizes after creation
              activePane.querySelectorAll('button i').forEach((icon: any) => {
                const svg = icon.querySelector('svg');
                if (svg) {
                  const button = icon.closest('button');
                  if (button && (button.classList.contains('history-btn') || 
                                 button.classList.contains('post-action-btn') ||
                                 button.classList.contains('action-btn'))) {
                    // Constrain the <i> element itself for post-action-btn
                    if (button.classList.contains('post-action-btn')) {
                      icon.style.width = '16px';
                      icon.style.height = '16px';
                      icon.style.minWidth = '16px';
                      icon.style.minHeight = '16px';
                      icon.style.maxWidth = '16px';
                      icon.style.maxHeight = '16px';
                    }
                    svg.setAttribute('width', '16');
                    svg.setAttribute('height', '16');
                    svg.style.width = '16px';
                    svg.style.height = '16px';
                    svg.style.maxWidth = '16px';
                    svg.style.maxHeight = '16px';
                    svg.style.minWidth = '16px';
                    svg.style.minHeight = '16px';
                    svg.setAttribute('stroke-width', '2');
                    svg.querySelectorAll('path, circle, rect, line, polyline, polygon').forEach((el: any) => {
                      el.setAttribute('stroke-width', '2');
                    });
                  }
                }
              });
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

