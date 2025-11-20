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
import { GlobalErrorBoundary } from "../shared/components/GlobalErrorBoundary";
import "../shared/styles/main.scss";

const AppContent: React.FC = () => {
  console.log("[App] AppContent rendering...");
  let activeTab, setActiveTab, core, media, jobs, history;
  
  try {
    const tabs = useTabs();
    activeTab = tabs.activeTab;
    setActiveTab = tabs.setActiveTab;
    console.log("[App] Tabs initialized, activeTab:", activeTab);
  } catch (e) {
    console.error("[App] Error initializing tabs:", e);
    throw e;
  }
  
  try {
    core = useCore();
    console.log("[App] Core initialized");
  } catch (e) {
    console.error("[App] Error initializing core:", e);
    throw e;
  }
  
  const { startOfflineChecking, nle } = core;
  
  try {
    media = useMedia();
    console.log("[App] Media initialized");
  } catch (e) {
    console.error("[App] Error initializing media:", e);
    throw e;
  }
  
  try {
    jobs = useJobs();
    console.log("[App] Jobs initialized");
  } catch (e) {
    console.error("[App] Error initializing jobs:", e);
    throw e;
  }
  
  try {
    history = useHistory();
    console.log("[App] History initialized");
  } catch (e) {
    console.error("[App] Error initializing history:", e);
    throw e;
  }
  
  try {
    useServerAutoStart();
    console.log("[App] Server auto-start initialized");
  } catch (e) {
    console.error("[App] Error initializing server auto-start:", e);
    // Don't throw - server auto-start is not critical for UI
  }

  // Setup window globals for backward compatibility
  useEffect(() => {
    setupWindowGlobals(media, jobs, { setActiveTab, activeTab }, core, history);
  }, [media, jobs, setActiveTab, activeTab, core, history]);

  useEffect(() => {
    const init = async () => {
      try {
        if (typeof (window as any).loadSettings === "function") {
          (window as any).loadSettings();
        }
      } catch (_) {}

      try {
        if (typeof (window as any).loadJobsLocal === "function") {
          (window as any).loadJobsLocal();
        }
      } catch (_) {}

      try {
        if (typeof (window as any).updateModelDisplay === "function") {
          (window as any).updateModelDisplay();
        }
      } catch (_) {}

      try {
        if (typeof (window as any).updateFromVideoButton === "function") {
          (window as any).updateFromVideoButton();
        }
      } catch (_) {}

      try {
        if (typeof (window as any).ensureAuthToken === "function") {
          await (window as any).ensureAuthToken();
        }
      } catch (_) {}
    };

    const handleBackendReady = async (e: CustomEvent) => {
      try {
        if (e.detail && e.detail.port) {
          (window as any).__syncServerPort = e.detail.port;
        }
        if (typeof (window as any).loadJobsFromServer === "function") {
          await (window as any).loadJobsFromServer();
        }
      } catch (_) {}
    };

    window.addEventListener("sync-backend-ready", handleBackendReady as EventListener);

    const timer = setTimeout(() => {
      init();
    }, 100);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("sync-backend-ready", handleBackendReady as EventListener);
    };
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined" && window.CSInterface) {
      const initPostHogInterceptors = () => {
        try {
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
        } catch (e) {}
      };

      initPostHogInterceptors();
      startOfflineChecking();
      
      if (nle) {
        nle.loadHostScript();
      }
    }
  }, [startOfflineChecking, nle]);

  useEffect(() => {
    console.log("[App] Loading PostHog scripts...");
    const loadPostHog = () => {
      const scripts = [
        "../../lib/posthog.js",
        "../../lib/posthog-recorder.js",
      ];
      
      scripts.forEach((src, index) => {
        console.log(`[App] Loading PostHog script ${index + 1}/${scripts.length}: ${src}`);
        const script = document.createElement("script");
        script.src = src;
        script.async = true;
        script.onload = () => {
          console.log(`[App] PostHog script loaded: ${src}`);
        };
        script.onerror = (error) => {
          console.error(`[App] Failed to load PostHog script: ${src}`, error);
        };
        document.head.appendChild(script);
      });
    };

    loadPostHog();
  }, []);

  useEffect(() => {
    const normalizeButtonIcons = () => {
      document.querySelectorAll('button i').forEach((icon: any) => {
        const svg = icon.querySelector('svg');
        if (svg) {
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
      if (window.lucide && window.lucide.createIcons) {
        window.lucide.createIcons();
        normalizeButtonIcons();
        replaceGlobeWithLanguages();
        return;
      }

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

    const replaceGlobeWithLanguages = () => {
      try {
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
        
        if (window.lucide && window.lucide.createIcons) {
          window.lucide.createIcons();
        }
      } catch (e) {}
    };

    initLucideIcons();

    let rafId1: number;
    let rafId2: number;
    const timer = setTimeout(() => {
      rafId1 = requestAnimationFrame(() => {
        rafId2 = requestAnimationFrame(() => {
          try {
            const activePane = document.querySelector('.tab-pane.active');
            if (activePane && window.lucide && window.lucide.createIcons) {
              window.lucide.createIcons({ root: activePane });
              activePane.querySelectorAll('button i').forEach((icon: any) => {
                const svg = icon.querySelector('svg');
                if (svg) {
                  const button = icon.closest('button');
                  if (button && (button.classList.contains('history-btn') || 
                                 button.classList.contains('post-action-btn') ||
                                 button.classList.contains('action-btn'))) {
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
          } catch (e) {}
        });
      });
    }, 100);

    return () => {
      clearTimeout(timer);
      if (rafId1) cancelAnimationFrame(rafId1);
      if (rafId2) cancelAnimationFrame(rafId2);
    };
  }, [activeTab]);

  console.log("[App] Rendering JSX...");
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
  console.log("[App] App component rendering");
  try {
    return (
      <GlobalErrorBoundary>
        <TabsProvider>
          <AppContent />
        </TabsProvider>
      </GlobalErrorBoundary>
    );
  } catch (error) {
    console.error("[App] Error in App component render:", error);
    return (
      <div style={{ padding: "20px", color: "#ff6b6b" }}>
        <h2>App Render Error</h2>
        <p>{error instanceof Error ? error.message : String(error)}</p>
      </div>
    );
  }
};

export default App;

