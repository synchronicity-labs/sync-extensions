import { useState, useCallback } from "react";
import { useCore } from "./useCore";
import { useMedia } from "./useMedia";
import { useSettings } from "./useSettings";

interface JobStatus {
  id: string;
  status: "pending" | "processing" | "completed" | "failed";
  progress?: number;
}

export const useJobs = () => {
  const { authHeaders, ensureAuthToken } = useCore();
  const { selection } = useMedia();
  const { settings } = useSettings();
  const [currentJob, setCurrentJob] = useState<JobStatus | null>(null);

  const startLipsync = useCallback(async () => {
    if (!selection.video || !selection.audio) {
      return { ok: false, error: "Please select both video and audio" };
    }

    try {
      await ensureAuthToken();
      
      const body = {
        videoUrl: selection.videoUrl || selection.video,
        audioUrl: selection.audioUrl || selection.audio,
        model: settings.model,
        temperature: settings.temperature,
        syncMode: settings.syncMode,
        activeSpeakerOnly: settings.activeSpeakerOnly,
        detectObstructions: settings.detectObstructions,
        apiKey: settings.syncApiKey,
      };

      const response = await fetch("http://127.0.0.1:3000/jobs", {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(body),
      });

      const data = await response.json().catch(() => null);
      
      if (response.ok && data?.ok) {
        setCurrentJob({ id: data.jobId, status: "pending" });
        return { ok: true, jobId: data.jobId };
      } else {
        return { ok: false, error: data?.error || "Failed to start job" };
      }
    } catch (error: any) {
      return { ok: false, error: error.message || "Unknown error" };
    }
  }, [selection, settings, authHeaders, ensureAuthToken]);

  const checkJobStatus = useCallback(async (jobId: string) => {
    try {
      await ensureAuthToken();
      const response = await fetch(`http://127.0.0.1:3000/jobs/${jobId}`, {
        headers: authHeaders(),
      });

      const data = await response.json().catch(() => null);
      if (response.ok && data?.ok) {
        setCurrentJob({
          id: jobId,
          status: data.status || "pending",
          progress: data.progress,
        });
        return data;
      }
      return { ok: false };
    } catch (_) {
      return { ok: false };
    }
  }, [authHeaders, ensureAuthToken]);

  return {
    currentJob,
    startLipsync,
    checkJobStatus,
  };
};
