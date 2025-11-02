/**
 * Expose global window functions for backward compatibility with original codebase
 * This ensures all code that expects these functions on window will continue to work
 */

import { useMedia } from "../hooks/useMedia";
import { useJobs } from "../hooks/useJobs";
import { useTabs } from "../hooks/useTabs";
import { useCore } from "../hooks/useCore";
import { useHistory } from "../hooks/useHistory";

export const setupWindowGlobals = (
  media: ReturnType<typeof useMedia>,
  jobs: ReturnType<typeof useJobs>,
  tabs: ReturnType<typeof useTabs>,
  core: ReturnType<typeof useCore>,
  history: ReturnType<typeof useHistory>
) => {
  // Core functions
  (window as any).debugLog = core.debugLog;
  (window as any).updateModelDisplay = core.updateModelDisplay;
  (window as any).updateBottomBarModelDisplay = core.updateModelDisplay;
  (window as any).ensureAuthToken = core.ensureAuthToken;
  (window as any).authHeaders = core.authHeaders;
  (window as any).getServerPort = () => (window as any).__syncServerPort || 3000;
  (window as any).isOffline = core.serverState.isOffline;

  // Media functions
  (window as any).openFileDialog = media.openFileDialog;
  (window as any).selectedVideo = media.selection.video;
  (window as any).selectedVideoUrl = media.selection.videoUrl;
  (window as any).selectedAudio = media.selection.audio;
  (window as any).selectedAudioUrl = media.selection.audioUrl;
  (window as any).selectedVideoIsTemp = media.selection.videoIsTemp;
  (window as any).selectedAudioIsTemp = media.selection.audioIsTemp;
  (window as any).selectedVideoIsUrl = media.selection.videoIsUrl;
  (window as any).selectedAudioIsUrl = media.selection.audioIsUrl;

  // Jobs functions
  (window as any).startLipsync = jobs.startLipsync;
  (window as any).jobs = history.jobs;

  // Tab functions
  (window as any).showTab = (tabName: string) => {
    // Map old tab names to new ones
    const tabMap: Record<string, "sources" | "history" | "settings"> = {
      sources: "sources",
      history: "history",
      settings: "settings",
    };
    
    const mappedTab = tabMap[tabName] || tabName as "sources" | "history" | "settings";
    tabs.setActiveTab(mappedTab);

    // Pause any playing media when switching tabs
    try {
      const v = document.getElementById("mainVideo");
      if (v) (v as HTMLVideoElement).pause();
    } catch (_) {}
    try {
      const ov = document.getElementById("outputVideo");
      if (ov) (ov as HTMLVideoElement).pause();
    } catch (_) {}
    try {
      const a = document.getElementById("audioPlayer");
      if (a) (a as HTMLAudioElement).pause();
    } catch (_) {}
  };

  // Toast notification function
  (window as any).showToast = (message: string, type: "info" | "error" | "success" = "info") => {
    // Simple toast implementation - can be enhanced later
    const toast = document.createElement("div");
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 24px;
      background: ${type === "error" ? "#dc2626" : type === "success" ? "#22c55e" : "#222225"};
      color: white;
      border-radius: 6px;
      z-index: 10000;
      font-family: var(--font-family);
      font-size: 14px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    `;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transition = "opacity 0.3s";
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 300);
    }, 3000);
  };

  // Debug log path function
  (window as any).getDebugLogPath = () => {
    try {
      if (typeof window !== "undefined" && (window as any).cep) {
        const fs = require("fs");
        const path = require("path");
        const os = require("os");
        const home = os.homedir();
        const logsDir =
          process.platform === "win32"
            ? path.join(home, "AppData", "Roaming", "sync. extensions", "logs")
            : path.join(home, "Library", "Application Support", "sync. extensions", "logs");

        // Check if debug is enabled
        const debugFlag = path.join(logsDir, "debug.enabled");
        if (!fs.existsSync(debugFlag)) {
          return null; // Debug logging disabled
        }

        // Determine host and return appropriate log file
        const isAE = (window as any).HOST_CONFIG && (window as any).HOST_CONFIG.isAE;
        const isPPRO = (window as any).HOST_CONFIG && (window as any).HOST_CONFIG.hostId === "PPRO";

        if (isAE) {
          return path.join(logsDir, "sync_ae_debug.log");
        } else if (isPPRO) {
          return path.join(logsDir, "sync_ppro_debug.log");
        } else {
          return path.join(logsDir, "sync_server_debug.log");
        }
      }
    } catch (_) {}
    return null;
  };

  // Open external URL function
  (window as any).openExternalURL = (url: string) => {
    try {
      if (typeof window !== "undefined" && (window as any).CSInterface) {
        const cs = new (window as any).CSInterface();
        cs.openURLInDefaultBrowser(url);
      } else {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    } catch (_) {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  // Set lipsync button state function
  (window as any).setLipsyncButtonState = ({ disabled, text }: { disabled?: boolean; text?: string }) => {
    try {
      const btn = document.getElementById("lipsyncBtn");
      if (!btn) return;
      
      if (typeof disabled === "boolean") {
        (btn as HTMLButtonElement).disabled = disabled;
      }
      
      if (typeof text === "string") {
        const label = btn.querySelector("span");
        if (label) {
          label.textContent = text;
          const icon = btn.querySelector("img");
          if (icon) {
            if (text === "submitted") {
              (icon as HTMLElement).style.display = "none";
            } else {
              (icon as HTMLElement).style.display = "";
            }
          }
        }
      }
    } catch (_) {}
  };

  // Update history function (already exposed by useHistory, but ensure it's here)
  (window as any).updateHistory = history.loadJobsFromServer;
  (window as any).loadJobsFromServer = history.loadJobsFromServer;

  // Expose evalExtendScript for backward compatibility (host-specific function calls)
  (window as any).evalExtendScript = async (fn: string, payload?: any) => {
    try {
      if (typeof window === "undefined" || !(window as any).CSInterface) {
        return { ok: false, error: "CSInterface not available" };
      }

      const cs = new (window as any).CSInterface();
      const arg = JSON.stringify(payload || {});
      const extPath = cs.getSystemPath((window as any).CSInterface.SystemPath.EXTENSION);
      
      // Determine host file based on function name (AEFT_ vs PPRO_)
      const isAE = String(fn || "").indexOf("AEFT_") === 0;
      const hostFile = isAE ? "/host/ae.jsx" : "/host/ppro.jsx";
      
      // Build code that ensures host is loaded before invoking
      function esc(s: string) {
        return String(s || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      }
      
      const call = fn + "(" + JSON.stringify(arg) + ")";
      const code = [
        "(function(){",
        "  try {",
        "    if (typeof " + fn + " !== 'function') {",
        '      $.evalFile("' + esc(extPath + hostFile) + '");',
        "    }",
        "    var r = " + call + ";",
        "    return r;",
        "  } catch(e) {",
        "    return String(e);",
        "  }",
        "})()",
      ].join("\n");

      return new Promise((resolve) => {
        cs.evalScript(code, (res: string) => {
          let out = null;
          try {
            out = typeof res === "string" ? JSON.parse(res) : res;
          } catch (_) {}
          
          if (!out || typeof out !== "object" || (out as any).ok === undefined) {
            // Fallback: treat raw string as a selected path
            if (res && typeof res === "string" && res.indexOf("/") !== -1) {
              resolve({ ok: true, path: res, _local: true });
              return;
            }
            resolve({ ok: false, error: String(res || "no response"), _local: true });
            return;
          }
          
          resolve(out);
        });
      });
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  };
};

