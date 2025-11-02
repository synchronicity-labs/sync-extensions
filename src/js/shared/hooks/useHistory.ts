import { useState, useEffect, useCallback } from "react";
import { useCore } from "./useCore";

interface Job {
  id: string;
  status: string;
  createdAt: number | string;
  outputPath?: string;
  [key: string]: any;
}

export const useHistory = () => {
  const { authHeaders, ensureAuthToken, fetchWithTimeout } = useCore();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [displayedCount, setDisplayedCount] = useState(0);
  const pageSize = 10;

  // Expose jobs globally for backward compatibility
  useEffect(() => {
    (window as any).jobs = jobs;
  }, [jobs]);

  const loadJobsFromServer = useCallback(async () => {
    setIsLoading(true);
    try {
      await ensureAuthToken();
      const settings = JSON.parse(localStorage.getItem("syncSettings") || "{}");
      const apiKey = settings.syncApiKey || "";
      
      if (!apiKey) {
        setIsLoading(false);
        return;
      }

      const response = await fetchWithTimeout(
        "http://127.0.0.1:3000/jobs",
        {
          method: "GET",
          headers: authHeaders(),
        },
        10000
      );

      if (response.ok) {
        const data = await response.json().catch(() => ({ jobs: [] }));
        const loadedJobs = data.jobs || [];
        setJobs(loadedJobs);
        setDisplayedCount(Math.min(pageSize, loadedJobs.length));
      }
    } catch (error) {
      console.error("[History] Failed to load jobs:", error);
    } finally {
      setIsLoading(false);
    }
  }, [authHeaders, ensureAuthToken, fetchWithTimeout]);

  const loadMore = useCallback(() => {
    setDisplayedCount((prev) => Math.min(prev + pageSize, jobs.length));
  }, [jobs.length]);

  const hasMore = displayedCount < jobs.length;

  useEffect(() => {
    // Initial load
    const settings = JSON.parse(localStorage.getItem("syncSettings") || "{}");
    if (settings.syncApiKey) {
      loadJobsFromServer();
    }
  }, [loadJobsFromServer]);

  // Expose global functions for backward compatibility
  useEffect(() => {
    (window as any).updateHistory = () => {
      loadJobsFromServer();
    };
    (window as any).loadJobsFromServer = loadJobsFromServer;
  }, [loadJobsFromServer]);

  return {
    jobs,
    isLoading,
    displayedCount,
    hasMore,
    loadMore,
    loadJobsFromServer,
  };
};
