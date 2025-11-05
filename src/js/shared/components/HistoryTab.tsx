import React, { useEffect, useRef, useState, Component, ErrorInfo, ReactNode } from "react";
import { useHistory } from "../hooks/useHistory";
import { useTabs } from "../hooks/useTabs";
import { useCore } from "../hooks/useCore";
import { getApiUrl } from "../utils/serverConfig";

const HistoryTabContent: React.FC = () => {
  const [hasError, setHasError] = useState(false);
  const { jobs, isLoading, hasMore, loadMore, loadJobsFromServer, displayedCount, serverError } = useHistory();
  const { serverState } = useCore();
  const { setActiveTab, activeTab } = useTabs();
  const hasLoadedRef = useRef(false);
  const loadJobsRef = useRef(loadJobsFromServer);

  // Keep ref updated
  useEffect(() => {
    loadJobsRef.current = loadJobsFromServer;
  }, [loadJobsFromServer]);

  // Load jobs when tab becomes active
  useEffect(() => {
    if (activeTab !== "history") {
      // Reset when tab changes away from history to allow reload on next visit
      hasLoadedRef.current = false;
      return;
    }

    // Only run if we're on history tab
    setHasError(false);
    try {
      // Always call loadJobsFromServer when tab becomes active
      // This will check for API key and load/clear jobs accordingly
      loadJobsRef.current().catch((error) => {
        console.error("[HistoryTab] Failed to load jobs:", error);
        setHasError(true);
      });
    } catch (error) {
      console.error("[HistoryTab] Error accessing settings:", error);
      setHasError(true);
    }
  }, [activeTab]);

  // Ensure jobs is always an array
  const safeJobs = Array.isArray(jobs) ? jobs : [];
  const safeDisplayedCount = typeof displayedCount === 'number' ? displayedCount : 0;
  const isOffline = serverState?.isOffline || false;

  // Re-initialize Lucide icons when offline state changes
  useEffect(() => {
    if (isOffline && activeTab === "history") {
      const timer = setTimeout(() => {
        if ((window as any).lucide && (window as any).lucide.createIcons) {
          // Re-initialize icons in the offline state
          const offlineIcon = document.querySelector('.offline-icon i[data-lucide="wifi-off"]');
          if (offlineIcon) {
            (window as any).lucide.createIcons({ root: offlineIcon.parentElement });
          }
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isOffline, activeTab]);

  return (
    <div id="history" className={`tab-pane ${activeTab === "history" ? "active" : ""}`}>
      <div className="history-wrapper">
        <div id="historyList" className="history-list-container">
          {isOffline ? (
            <div className="offline-state">
              <div className="offline-icon">
                <i data-lucide="wifi-off"></i>
              </div>
              <div className="offline-message">
                hmm... you might be offline.
              </div>
            </div>
          ) : hasError || serverError ? (
            <div className="history-empty-state">
              <div className="history-empty-icon">
                <i data-lucide="alert-circle"></i>
              </div>
              <div className="history-empty-message">
                {serverError || "failed to load history. please try again."}
                <br />
                <small style={{ marginTop: "8px", display: "block", opacity: 0.7 }}>
                  Check the browser console (F12) for more details. The server may not be running.
                </small>
              </div>
            </div>
          ) : isLoading && safeJobs.length === 0 ? (
            <div className="history-loading-state">
              <div className="history-loading-text">loading your generations...</div>
            </div>
          ) : safeJobs.length === 0 ? (
            <div className="history-empty-state">
              <div className="history-empty-icon">
                <i data-lucide="clapperboard"></i>
              </div>
              <div className="history-empty-message">
                no generations yet. <a onClick={() => setActiveTab && setActiveTab("sources")}>get started</a>
              </div>
            </div>
          ) : (
            <>
              {safeJobs.slice(0, safeDisplayedCount).map((job, index) => {
                // Defensive check: ensure job has required fields
                if (!job || typeof job !== 'object' || !job.id || !job.status) {
                  return null;
                }
                return (
                  <div key={job.id || `job-${index}`} className="history-card">
                  <div className="history-card-content">
                      <div className="history-card-title">{String(job.id)}</div>
                      <div className="history-card-status">{String(job.status)}</div>
                    </div>
                  </div>
                );
              })}
              {hasMore && loadMore && (
                <button className="history-load-more" onClick={() => loadMore && loadMore()}>
                  Load more
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    // Ignore DOM manipulation errors - they're not fatal and happen during cleanup
    if (error.message && error.message.includes('removeChild')) {
      return { hasError: false, error: null };
    }
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Don't log DOM manipulation errors - they're not real errors, just React/Lucide conflicts
    if (error.message && error.message.includes('removeChild')) {
      return;
    }
    
    // Only log actual component errors
    try {
      const fs = require("fs");
      const path = require("path");
      const os = require("os");
      const home = os.homedir();
      const logsDir = path.join(home, "Library", "Application Support", "sync. extensions", "logs");
      
      const isAE = (window as any).HOST_CONFIG && (window as any).HOST_CONFIG.isAE;
      const isPPRO = (window as any).HOST_CONFIG && (window as any).HOST_CONFIG.hostId === "PPRO";
      const logFileName = isAE ? "sync_ae_debug.log" : (isPPRO ? "sync_ppro_debug.log" : "sync_server_debug.log");
      const logFile = path.join(logsDir, logFileName);
      
      const logMessage = `[${new Date().toISOString()}] [HistoryTab] Error boundary caught error:\n` +
        `  Error: ${error.message}\n` +
        `  Stack: ${error.stack || "no stack"}\n` +
        `  Component Stack: ${errorInfo.componentStack || "no component stack"}\n\n`;
      
      fs.appendFileSync(logFile, logMessage);
    } catch (_) {}
    
    try {
      const hostConfig = (window as any).HOST_CONFIG || {};
      fetch(getApiUrl("/debug"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "history_tab_error",
          error: error.message,
          stack: error.stack,
          errorInfo: errorInfo.componentStack,
          timestamp: new Date().toISOString(),
          hostConfig,
        }),
      }).catch(() => {});
    } catch (_) {}
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    // Reset error state when switching away from history tab
    // Use a timeout to avoid React DOM conflicts during render
    if (this.state.hasError) {
      setTimeout(() => {
        try {
          const historyPane = document.getElementById("history");
          if (!historyPane || !historyPane.classList.contains("active")) {
            this.setState({ hasError: false, error: null });
          }
        } catch (_) {}
      }, 0);
    }
  }

  render() {
    if (this.state.hasError) {
      // Return null instead of rendering error UI to avoid React DOM issues
      return null;
    }

    return this.props.children;
  }
}

const HistoryTab: React.FC = () => {
  return (
    <ErrorBoundary>
      <HistoryTabContent />
    </ErrorBoundary>
  );
};

export default HistoryTab;
