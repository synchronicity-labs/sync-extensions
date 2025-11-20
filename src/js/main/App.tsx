import React, { useEffect, useState } from "react";
import { useCore } from "../shared/hooks/useCore";
import { useTabs, TabsProvider } from "../shared/hooks/useTabs";
import { useServerAutoStart } from "../shared/hooks/useServerAutoStart";
import { useNLE } from "../shared/hooks/useNLE";
import { useMedia } from "../shared/hooks/useMedia";
import { useJobs } from "../shared/hooks/useJobs";
import { useHistory } from "../shared/hooks/useHistory";
import { useOnboarding } from "../shared/hooks/useOnboarding";
import { setupWindowGlobals } from "../shared/utils/windowGlobals";
import { getApiUrl } from "../shared/utils/serverConfig";
import { debugLog, debugError } from "../shared/utils/debugLog";
import { isDevMode } from "../shared/utils/env";
import Header from "../shared/components/Header";
import SourcesTab from "../shared/components/SourcesTab";
import HistoryTab from "../shared/components/HistoryTab";
import SettingsTab from "../shared/components/SettingsTab";
import BottomBar from "../shared/components/BottomBar";
import OnboardingModal from "../shared/components/OnboardingModal";
import { GlobalErrorBoundary } from "../shared/components/GlobalErrorBoundary";
import "../shared/styles/main.scss";

const AppContent: React.FC = () => {
  debugLog('[App] AppContent rendering');
  
  const tabs = useTabs();
  const activeTab = tabs.activeTab;
  const setActiveTab = tabs.setActiveTab;
  
  const core = useCore();
  const { startOfflineChecking, nle } = core;
  
  const media = useMedia();
  const jobs = useJobs();
  const history = useHistory();
  const { showOnboarding, resetOnboarding, isLoading } = useOnboarding();
  
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  // Start hidden - will show main panel only after onboarding completes (or if onboarding not needed)
  const [shouldFadeIn, setShouldFadeIn] = useState(false);

  useServerAutoStart();

  // Handle onboarding display logic
  useEffect(() => {
    // Wait for onboarding hook to finish loading
    if (isLoading) {
      return;
    }

    // Check for URL parameter to show onboarding (dev mode only)
    if (isDevMode() && typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('showOnboarding') === 'true') {
        resetOnboarding();
        setShouldFadeIn(false); // Hide main panel
        setIsOnboardingOpen(true);
        debugLog('[App] Showing onboarding via URL parameter');
        return;
      }
    }
    
    // Normal flow: show onboarding if needed, otherwise show app
    if (showOnboarding) {
      setShouldFadeIn(false); // Hide main panel when onboarding shows
      setIsOnboardingOpen(true);
    } else {
      // Onboarding not needed - show main panel
      setIsOnboardingOpen(false);
      setShouldFadeIn(true);
    }
  }, [showOnboarding, resetOnboarding, isLoading]);

  // Handle onboarding close - trigger fade-in from black
  const handleOnboardingClose = () => {
    // Immediately start fading in main UI from black
    setShouldFadeIn(true);
    // Close overlay after fade completes (overlay will fade out)
    setTimeout(() => {
      setIsOnboardingOpen(false);
    }, 500); // Match fade duration
  };
  
  // Dev mode: Expose function to window for console access
  useEffect(() => {
    if (isDevMode() && typeof window !== 'undefined') {
      (window as any).showOnboarding = () => {
        resetOnboarding();
        setIsOnboardingOpen(true);
        debugLog('[App] Showing onboarding via window.showOnboarding()');
      };
      (window as any).hideOnboarding = () => {
        setIsOnboardingOpen(false);
        debugLog('[App] Hiding onboarding via window.hideOnboarding()');
      };
      
      return () => {
        delete (window as any).showOnboarding;
        delete (window as any).hideOnboarding;
      };
    }
  }, [resetOnboarding]);
  
  if (!tabs || !core || !media || !jobs || !history) {
    debugError('[App] Missing required hooks', { tabs: !!tabs, core: !!core, media: !!media, jobs: !!jobs, history: !!history });
    return <div style={{ padding: '20px', color: '#ff6b6b' }}>Error: Missing hooks</div>;
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
    debugLog('[App] Loading PostHog scripts');
    const loadPostHog = () => {
      const scripts = [
        "../../lib/posthog.js",
        "../../lib/posthog-recorder.js",
      ];
      
      scripts.forEach((src, index) => {
        debugLog(`[App] Loading PostHog script ${index + 1}/${scripts.length}`, { src });
        const script = document.createElement("script");
        script.src = src;
        script.async = true;
        script.onload = () => {
          debugLog(`[App] PostHog script loaded`, { src });
        };
        script.onerror = (error) => {
          debugError(`[App] Failed to load PostHog script`, { src, error });
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

  debugLog('[App] All hooks initialized, rendering JSX');
  
  try {
    return (
      <>
        <div className={`app-container ${shouldFadeIn ? "fade-in" : "hidden"}`} style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
          <Header activeTab={activeTab} setActiveTab={setActiveTab} />
          <div className="content" style={{ flex: 1 }}>
            <SourcesTab />
            <HistoryTab />
            <SettingsTab />
          </div>
          <BottomBar />
        </div>
        <OnboardingModal isOpen={isOnboardingOpen} onClose={handleOnboardingClose} />
      </>
    );
  } catch (renderError) {
    debugError('[App] Error rendering JSX', renderError);
    return (
      <div style={{ padding: '20px', color: '#ff6b6b' }}>
        <h2>Render Error</h2>
        <p>{renderError instanceof Error ? renderError.message : String(renderError)}</p>
      </div>
    );
  }
};

const App: React.FC = () => {
  debugLog('[App] App component rendering');
  
  try {
    return (
      <GlobalErrorBoundary fallback={
        <div style={{ padding: '20px', color: '#333', fontFamily: 'system-ui' }}>
          <h2>Error Loading Panel</h2>
          <p>Please check the console for details.</p>
        </div>
      }>
        <TabsProvider>
          <AppContent />
        </TabsProvider>
      </GlobalErrorBoundary>
    );
  } catch (error) {
    debugError('[App] Fatal error in App render', error);
    return (
      <div style={{ padding: '20px', color: '#ff6b6b', fontFamily: 'system-ui', minHeight: '100vh' }}>
        <h2>Fatal Error</h2>
        <p>{error instanceof Error ? error.message : String(error)}</p>
      </div>
    );
  }
};

export default App;

