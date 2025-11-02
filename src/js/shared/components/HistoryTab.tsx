import React, { useEffect } from "react";
import { useHistory } from "../hooks/useHistory";
import { useTabs } from "../hooks/useTabs";

const HistoryTab: React.FC = () => {
  const { jobs, isLoading, hasMore, loadMore } = useHistory();
  const { setActiveTab, activeTab } = useTabs();

  // Re-initialize Lucide icons when component mounts
  useEffect(() => {
    const timer = setTimeout(() => {
      if ((window as any).lucide && (window as any).lucide.createIcons) {
        (window as any).lucide.createIcons();
      }
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div id="history" className={`tab-pane ${activeTab === "history" ? "active" : ""}`}>
      <div className="history-wrapper">
        <div id="historyList" className="history-list-container">
          {isLoading && jobs.length === 0 ? (
            <div className="history-loading-state">
              <div className="history-loading-text">loading your generations...</div>
            </div>
          ) : jobs.length === 0 ? (
            <div className="history-empty-state">
              <div className="history-empty-icon">
                <i data-lucide="clapperboard"></i>
              </div>
              <div className="history-empty-message">
                no generations yet. <a onClick={() => setActiveTab("sources")}>get started</a>
              </div>
            </div>
          ) : (
            <>
              {jobs.slice(0, 10).map((job) => (
                <div key={job.id} className="history-card">
                  <div className="history-card-content">
                    <div className="history-card-title">{job.id}</div>
                    <div className="history-card-status">{job.status}</div>
                  </div>
                </div>
              ))}
              {hasMore && (
                <button className="history-load-more" onClick={loadMore}>
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

export default HistoryTab;
