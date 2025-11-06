import { useState, useEffect, useCallback } from "react";
import { useCore } from "./useCore";
import { getApiUrl } from "../utils/serverConfig";

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
  const [serverError, setServerError] = useState<string | null>(null);
  const pageSize = 10;

  // Expose jobs globally for backward compatibility
  useEffect(() => {
    try {
    (window as any).jobs = jobs;
    } catch (error) {
      console.error("[useHistory] Error setting global jobs:", error);
    }
  }, [jobs]);

  const loadJobsFromServer = useCallback(async () => {
    setIsLoading(true);
    setServerError(null); // Clear previous errors
    try {
      // Ensure we have auth token before making request
      let token = await ensureAuthToken();
      if (!token) {
        // If no token, wait a bit and retry once
        await new Promise(resolve => setTimeout(resolve, 100));
        token = await ensureAuthToken();
        if (!token) {
          setServerError("authentication failed - server may not be running");
          setJobs([]);
          setDisplayedCount(0);
          setIsLoading(false);
          return;
        }
      }
      
      const settings = JSON.parse(localStorage.getItem("syncSettings") || "{}");
      const apiKey = settings.syncApiKey || "";
      
      if (!apiKey) {
        // Clear jobs when no API key
        setJobs([]);
        setDisplayedCount(0);
        setServerError(null);
        setIsLoading(false);
        return;
      }

      // Pass API key as query parameter to fetch from Sync API
      const urlObj = new URL(getApiUrl("/jobs"));
      urlObj.searchParams.set("syncApiKey", apiKey);
      const url = urlObj.toString();
      
      // Pass token directly to avoid race condition with state update
      const headers = authHeaders({}, token);
      
      // Log debug info
      try {
        const hostConfig = (window as any).HOST_CONFIG || {};
        fetch(getApiUrl("/debug"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "history_load_jobs_start",
            url,
            hasToken: !!headers["x-auth-token"],
            timestamp: new Date().toISOString(),
            hostConfig,
          }),
        }).catch(() => {});
      } catch (_) {}

      const response = await fetchWithTimeout(url, {
        method: "GET",
        headers,
      }, 10000);

      // Log response status
      try {
        const hostConfig = (window as any).HOST_CONFIG || {};
        fetch(getApiUrl("/debug"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "history_load_jobs_response",
            status: response.status,
            ok: response.ok,
            timestamp: new Date().toISOString(),
            hostConfig,
          }),
        }).catch(() => {});
      } catch (_) {}

      if (response.ok) {
        const data = await response.json().catch(() => null);
        
        // Log response data
        try {
          const hostConfig = (window as any).HOST_CONFIG || {};
          fetch(getApiUrl("/debug"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: "history_load_jobs_data",
              isArray: Array.isArray(data),
              dataType: typeof data,
              dataKeys: data && typeof data === 'object' ? Object.keys(data) : [],
              dataLength: Array.isArray(data) ? data.length : (data?.jobs?.length || 0),
              timestamp: new Date().toISOString(),
              hostConfig,
            }),
          }).catch(() => {});
        } catch (_) {}
        
        // Handle both response formats: array directly or wrapped in { jobs: [...] }
        let rawJobs: any[] = [];
        if (Array.isArray(data)) {
          rawJobs = data;
        } else if (data && typeof data === 'object' && Array.isArray(data.jobs)) {
          rawJobs = data.jobs;
        }
        
        // Filter out invalid jobs (must have an id and status)
        const loadedJobs = rawJobs.filter((job) => {
          return job && typeof job === 'object' && job.id != null && job.status != null;
        });
        
        // Log final result
        try {
          const hostConfig = (window as any).HOST_CONFIG || {};
          fetch(getApiUrl("/debug"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: "history_load_jobs_result",
              rawJobsCount: rawJobs.length,
              loadedJobsCount: loadedJobs.length,
              timestamp: new Date().toISOString(),
              hostConfig,
            }),
          }).catch(() => {});
        } catch (_) {}
        
        setJobs(loadedJobs);
        // Start with first page only (10 jobs)
        setDisplayedCount(Math.min(pageSize, loadedJobs.length));
        setServerError(null); // Clear error on success
      } else {
        const errorText = await response.text().catch(() => "");
        try {
          const hostConfig = (window as any).HOST_CONFIG || {};
          fetch(getApiUrl("/debug"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: "history_load_jobs_error",
              status: response.status,
              error: errorText.substring(0, 200),
              timestamp: new Date().toISOString(),
              hostConfig,
            }),
          }).catch(() => {});
        } catch (_) {}
        
        // Non-ok response - set empty array to prevent crashes
        setJobs([]);
        setDisplayedCount(0);
        setServerError(`Server returned error ${response.status}`);
      }
    } catch (error: any) {
      console.error("[History] Failed to load jobs:", error);
      
      // Log catch error
      try {
        const hostConfig = (window as any).HOST_CONFIG || {};
        fetch(getApiUrl("/debug"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "history_load_jobs_catch",
            error: String(error),
            timestamp: new Date().toISOString(),
            hostConfig,
          }),
        }).catch(() => {});
      } catch (_) {}
      
      // Detect network/server connectivity errors
      const errorMessage = String(error || "");
      const isNetworkError = 
        errorMessage.includes("Failed to fetch") ||
        errorMessage.includes("NetworkError") ||
        errorMessage.includes("network") ||
        errorMessage.includes("ECONNREFUSED") ||
        errorMessage.includes("timeout") ||
        error?.name === "TypeError" ||
        error?.message?.includes("fetch");
      
      if (isNetworkError) {
        setServerError("cannot connect to server. the server may not be running.");
      } else {
        setServerError(`failed to load history: ${errorMessage.substring(0, 100).toLowerCase()}`);
      }
      
      // Set empty array on error to prevent crashes
      setJobs([]);
      setDisplayedCount(0);
    } finally {
      setIsLoading(false);
    }
  }, [authHeaders, ensureAuthToken, fetchWithTimeout]);

  const loadMore = useCallback(() => {
    try {
      setDisplayedCount((prev) => {
        const next = prev + pageSize;
        return Math.min(next, jobs.length);
      });
    } catch (error) {
      console.error("[useHistory] Error in loadMore:", error);
    }
  }, [jobs.length, pageSize]);

  const hasMore = displayedCount < jobs.length;

  // Expose global functions for backward compatibility
  useEffect(() => {
    try {
    (window as any).updateHistory = () => {
      loadJobsFromServer();
    };
    (window as any).loadJobsFromServer = loadJobsFromServer;
    } catch (error) {
      console.error("[useHistory] Error setting global functions:", error);
    }
  }, [loadJobsFromServer]);

  return {
    jobs: Array.isArray(jobs) ? jobs : [],
    isLoading: Boolean(isLoading),
    displayedCount: typeof displayedCount === 'number' ? displayedCount : 0,
    hasMore: Boolean(hasMore),
    serverError: serverError || null,
    loadMore,
    loadJobsFromServer,
  };
};
