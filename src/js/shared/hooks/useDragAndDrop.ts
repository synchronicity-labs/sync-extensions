import { useEffect, useRef, useCallback } from "react";
import { useCore } from "./useCore";
import { getApiUrl } from "../utils/serverConfig";

interface UseDragAndDropOptions {
  onVideoSelected: (path: string) => void;
  onAudioSelected: (path: string) => void;
}

/**
 * Drag and drop functionality for video and audio files
 * Based on the main branch ui/dnd.js implementation
 */
export const useDragAndDrop = (options: UseDragAndDropOptions) => {
  const { onVideoSelected, onAudioSelected } = options;
  const { authHeaders, ensureAuthToken } = useCore();
  const videoZoneRef = useRef<HTMLDivElement | null>(null);
  const audioZoneRef = useRef<HTMLDivElement | null>(null);

  // Stat file size using CSInterface
  const statFileSizeBytes = useCallback(async (absPath: string): Promise<number> => {
    return new Promise((resolve) => {
      try {
        if (!(window as any).CSInterface) {
          resolve(0);
          return;
        }
        const cs = new (window as any).CSInterface();
        const safe = String(absPath).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
        const es = `(function(){try{var f=new File("${safe}");if(f&&f.exists){return String(f.length||0);}return '0';}catch(e){return '0';}})()`;
        cs.evalScript(es, (r: string) => {
          const n = Number(r || 0);
          resolve(isNaN(n) ? 0 : n);
        });
      } catch (_) {
        resolve(0);
      }
    });
  }, []);

  // Normalize path from URI
  const normalizePathFromUri = useCallback((uri: string): string => {
    try {
      if (!uri || typeof uri !== "string") return "";
      if (!uri.startsWith("file://")) return "";

      // Skip file reference URLs (macOS specific issue)
      if (uri.includes(".file/id=")) return "";

      let u = uri.replace(/^file:\/\//, "");
      // Handle file://localhost/...
      if (u.startsWith("localhost/")) u = u.slice("localhost/".length);
      // On macOS, u already starts with '/'
      if (u[0] !== "/") u = "/" + u;

      // Decode URI components carefully
      try {
        u = decodeURIComponent(u);
      } catch (_) {
        // Fallback: just replace common encoded characters
        try {
          u = u.replace(/%20/g, " ").replace(/%2F/g, "/");
        } catch (_) {}
      }

      // Final validation: ensure we have a valid path
      if (!u || u.length < 2 || !u.startsWith("/")) return "";

      return u;
    } catch (_) {
      return "";
    }
  }, []);

  // Extract file paths from drop event
  const extractFilePathsFromDrop = useCallback((e: DragEvent): string[] => {
    const out: string[] = [];
    try {
      const dt = e.dataTransfer || {};

      // 1) Direct file list (may include .path in CEP/Chromium)
      if (dt.files && dt.files.length) {
        for (let i = 0; i < dt.files.length; i++) {
          const f = dt.files[i];
          // Check for .path property (Electron/CEP)
          if (f && (f as any).path && typeof (f as any).path === "string" && (f as any).path.length > 0) {
            const cleanPath = String((f as any).path).trim();
            if (cleanPath && !cleanPath.startsWith(".file/id=") && !cleanPath.includes(".file/id=")) {
              out.push(cleanPath);
            }
          }
          // Also check name property as fallback (might need to resolve with CSInterface)
          else if (f && f.name && typeof f.name === "string") {
            // Will be handled by async file picker fallback
          }
        }
      }

      // 2) Check for DataTransferItems (more modern API)
      try {
        if (dt.items && dt.items.length > 0) {
          for (let i = 0; i < dt.items.length; i++) {
            const item = dt.items[i];
            if (item.kind === "file") {
              const file = item.getAsFile();
              if (file && (file as any).path && typeof (file as any).path === "string") {
                const cleanPath = String((file as any).path).trim();
                if (cleanPath && !cleanPath.includes(".file/id=") && cleanPath.startsWith("/")) {
                  out.push(cleanPath);
                }
              }
            }
          }
        }
      } catch (_) {}

      // 3) text/uri-list (Finder drops file:// URIs)
      try {
        const uriList = dt.getData && dt.getData("text/uri-list");
        if (uriList && typeof uriList === "string") {
          uriList.split(/\r?\n/).forEach((line) => {
            const s = String(line || "").trim();
            if (!s || s[0] === "#") return;
            // Skip file reference URLs (macOS specific issue)
            if (s.includes(".file/id=")) return;
            const p = normalizePathFromUri(s);
            if (p) out.push(p);
          });
        }
      } catch (_) {}

      // 4) text/plain fallback (sometimes provides file:/// or absolute path)
      try {
        const txt = dt.getData && dt.getData("text/plain");
        if (txt && typeof txt === "string") {
          const lines = txt.split(/\r?\n/);
          lines.forEach((line) => {
            const s = String(line || "").trim();
            if (!s) return;
            // Skip file reference URLs
            if (s.includes(".file/id=")) return;
            if (s.startsWith("file://")) {
              const p = normalizePathFromUri(s);
              if (p) out.push(p);
            } else if (s.startsWith("/")) {
              out.push(s);
            }
          });
        }
      } catch (_) {}
    } catch (_) {}
    // Deduplicate while preserving order
    const seen: Record<string, boolean> = {};
    return out.filter((p) => {
      if (seen[p]) {
        return false;
      }
      seen[p] = true;
      return true;
    });
  }, [normalizePathFromUri]);

  // Check for file references
  const checkForFileReferences = useCallback((e: DragEvent): boolean => {
    try {
      const dt = e.dataTransfer || {};

      // Check dataTransferItems for file references
      if (dt.items && dt.items.length > 0) {
        for (let i = 0; i < dt.items.length; i++) {
          const item = dt.items[i];
          if (item.kind === "file") {
            return true; // We have file items, even if paths aren't extractable
          }
        }
      }

      // Check files array
      if (dt.files && dt.files.length > 0) {
        return true;
      }

      // Check for file reference URLs in text data
      try {
        const uriList = dt.getData && dt.getData("text/uri-list");
        if (uriList && uriList.includes(".file/id=")) {
          return true;
        }
      } catch (_) {}

      try {
        const txt = dt.getData && dt.getData("text/plain");
        if (txt && txt.includes(".file/id=")) {
          return true;
        }
      } catch (_) {}

      return false;
    } catch (_) {
      return false;
    }
  }, []);

  // Pick first matching file by kind
  const pickFirstMatchingByKind = useCallback((paths: string[], kind: "video" | "audio"): string => {
    const videoExtOk = (ext: string) => ({ mov: 1, mp4: 1 }[ext] === 1);
    const audioExtOk = (ext: string) => ({ wav: 1, mp3: 1 }[ext] === 1);
    for (let i = 0; i < paths.length; i++) {
      const p = String(paths[i] || "");
      const ext = p.split(".").pop()?.toLowerCase() || "";
      if (kind === "video" && videoExtOk(ext)) return p;
      if (kind === "audio" && audioExtOk(ext)) return p;
    }
    return "";
  }, []);

  // Handle dropped video
  const handleDroppedVideo = useCallback(async (raw: string) => {
    try {
      // Validate path before proceeding
      if (!raw || typeof raw !== "string" || raw.includes(".file/id=") || raw.length < 2) {
        if (typeof (window as any).showToast === "function") {
          (window as any).showToast("invalid file path - please use upload button instead", "error");
        }
        return;
      }

      if (typeof (window as any).showToast === "function") {
        (window as any).showToast("validating video…", "info");
      }
      const ext = raw.split(".").pop()?.toLowerCase() || "";
      const ok = { mov: 1, mp4: 1, mxf: 1, mkv: 1, avi: 1, m4v: 1, mpg: 1, mpeg: 1 }[ext] === 1;
      if (!ok) {
        if (typeof (window as any).showToast === "function") {
          (window as any).showToast("please drop a video file", "error");
        }
        return;
      }
      const size = await statFileSizeBytes(raw);
      if (size > 1024 * 1024 * 1024) {
        if (typeof (window as any).showToast === "function") {
          (window as any).showToast("video exceeds 1gb (not allowed)", "error");
        }
        return;
      }

      // Set video selection
      (window as any).selectedVideoIsTemp = false;
      (window as any).selectedVideo = raw;
      console.log("[Video Selection] Drag & drop selected:", (window as any).selectedVideo);

      // Notify parent component
      onVideoSelected(raw);

      // Call update functions like main branch
      if (typeof (window as any).updateLipsyncButton === "function") {
        (window as any).updateLipsyncButton();
      }
      if (typeof (window as any).renderInputPreview === "function") {
        (window as any).renderInputPreview("drag-drop");
      }

      // Upload to server
      if (typeof (window as any).showToast === "function") {
        (window as any).showToast("uploading video…", "info");
      }
      try {
        await ensureAuthToken();
        const settings = JSON.parse(localStorage.getItem("syncSettings") || "{}");
        const body = { path: raw, apiKey: settings.syncApiKey || "" };
        const r = await fetch(getApiUrl("/upload"), {
          method: "POST",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify(body),
        });
        const j = await r.json().catch(() => null);
        if (r.ok && j && j.ok && j.url) {
          (window as any).uploadedVideoUrl = j.url;
          localStorage.setItem("uploadedVideoUrl", j.url);
        } else {
          const errorMsg = j?.error || "server error";
          if ((window as any).showToast) {
            (window as any).showToast(`video upload failed: ${errorMsg.toLowerCase()}`, "error");
          }
        }
      } catch (e: any) {
        if ((window as any).showToast) {
          const errorMsg = e.name === "AbortError" ? "upload timeout" : 
                          e.message?.includes("Failed to fetch") ? "server connection failed" : 
                          e.message?.toLowerCase() || "unknown error";
          (window as any).showToast(`video upload failed: ${errorMsg}`, "error");
        }
      }

    } catch (_) {}
  }, [statFileSizeBytes, authHeaders, ensureAuthToken, onVideoSelected]);

  // Handle dropped audio
  const handleDroppedAudio = useCallback(async (raw: string) => {
    try {
      // Validate path before proceeding
      if (!raw || typeof raw !== "string" || raw.includes(".file/id=") || raw.length < 2) {
        if (typeof (window as any).showToast === "function") {
          (window as any).showToast("invalid file path - please use upload button instead", "error");
        }
        return;
      }

      if (typeof (window as any).showToast === "function") {
        (window as any).showToast("validating audio…", "info");
      }
      const ext = raw.split(".").pop()?.toLowerCase() || "";
      const ok = { wav: 1, mp3: 1, aac: 1, aif: 1, aiff: 1, m4a: 1 }[ext] === 1;
      if (!ok) {
        if (typeof (window as any).showToast === "function") {
          (window as any).showToast("please drop an audio file", "error");
        }
        return;
      }
      const size = await statFileSizeBytes(raw);
      if (size > 1024 * 1024 * 1024) {
        if (typeof (window as any).showToast === "function") {
          (window as any).showToast("audio exceeds 1gb (not allowed)", "error");
        }
        return;
      }

      // Set audio selection
      (window as any).selectedAudioIsTemp = false;
      (window as any).selectedAudio = raw;

      // Notify parent component
      onAudioSelected(raw);

      // Call update functions like main branch
      if (typeof (window as any).updateLipsyncButton === "function") {
        (window as any).updateLipsyncButton();
      }
      if (typeof (window as any).renderInputPreview === "function") {
        (window as any).renderInputPreview("drag-drop");
      }
      if (typeof (window as any).updateInputStatus === "function") {
        (window as any).updateInputStatus();
      }

      // Upload to server
      if (typeof (window as any).showToast === "function") {
        (window as any).showToast("uploading audio…", "info");
      }
      try {
        await ensureAuthToken();
        const settings = JSON.parse(localStorage.getItem("syncSettings") || "{}");
        const body = { path: raw, apiKey: settings.syncApiKey || "" };
        const r = await fetch(getApiUrl("/upload"), {
          method: "POST",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify(body),
        });
        const j = await r.json().catch(() => null);
        if (r.ok && j && j.ok && j.url) {
          (window as any).uploadedAudioUrl = j.url;
          localStorage.setItem("uploadedAudioUrl", j.url);
        } else {
          const errorMsg = j?.error || "server error";
          if ((window as any).showToast) {
            (window as any).showToast(`audio upload failed: ${errorMsg.toLowerCase()}`, "error");
          }
        }
      } catch (e: any) {
        if ((window as any).showToast) {
          const errorMsg = e.name === "AbortError" ? "upload timeout" : 
                          e.message?.includes("Failed to fetch") ? "server connection failed" : 
                          e.message?.toLowerCase() || "unknown error";
          (window as any).showToast(`audio upload failed: ${errorMsg}`, "error");
        }
      }
    } catch (_) {}
  }, [statFileSizeBytes, authHeaders, ensureAuthToken, onAudioSelected]);

  // Handle drop event
  const handleDropEvent = useCallback(async (e: DragEvent, kind: "video" | "audio") => {
    try {
      const paths = extractFilePathsFromDrop(e);

      if (!paths.length) {
        // Check if we have file references that need to be resolved
        const hasFileReferences = checkForFileReferences(e);
        if (hasFileReferences) {
          // Try to get file path from Premiere bin selection or AE active item
          try {
            if ((window as any).CSInterface) {
              const cs = new (window as any).CSInterface();
              const appId = cs.getApplicationID();
              const { HOST_IDS } = await import("../../../shared/host");
              const isPPRO = appId && (appId.includes(HOST_IDS.PPRO) || appId.includes("Premiere"));
              const isAE = appId && (appId.includes(HOST_IDS.AEFT) || appId.includes("AfterEffects"));

              if (isPPRO || isAE) {
                // Get file path from project selection
                const extPath = cs.getSystemPath((window as any).CSInterface.SystemPath.EXTENSION);
                const hostFile = isPPRO ? "/host/ppro.jsx" : "/host/ae.jsx";
                const escPath = String(extPath + hostFile).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
                
                // Load host script
                await new Promise<void>((resolve) => {
                  cs.evalScript(`$.evalFile("${escPath}")`, () => resolve());
                });

                // Get file path from Premiere bin selection
                // When dragging from Premiere bin, get the path from the selected item
                let script = "";
                if (isPPRO) {
                  script = `
                    try {
                      if (typeof app !== 'undefined' && app.getCurrentProjectViewSelection) {
                        var selection = app.getCurrentProjectViewSelection();
                        if (selection && selection.length > 0) {
                          var item = selection[0];
                          if (item && typeof item.getMediaPath === 'function') {
                            var path = item.getMediaPath();
                            if (path) {
                              JSON.stringify({ ok: true, path: path });
                            } else {
                              JSON.stringify({ ok: false, error: 'no path' });
                            }
                          } else {
                            JSON.stringify({ ok: false, error: 'no getMediaPath' });
                          }
                        } else {
                          JSON.stringify({ ok: false, error: 'no selection' });
                        }
                      } else {
                        JSON.stringify({ ok: false, error: 'not available' });
                      }
                    } catch(e) {
                      JSON.stringify({ ok: false, error: String(e) });
                    }
                  `;
                } else if (isAE) {
                  script = `
                    try {
                      if (typeof app !== 'undefined' && app.project && app.project.activeItem) {
                        var item = app.project.activeItem;
                        if (item && item.file) {
                          var file = item.file;
                          if (file && file.fsName) {
                            JSON.stringify({ ok: true, path: file.fsName });
                          } else {
                            JSON.stringify({ ok: false, error: 'no fsName' });
                          }
                        } else {
                          JSON.stringify({ ok: false, error: 'no file' });
                        }
                      } else {
                        JSON.stringify({ ok: false, error: 'not available' });
                      }
                    } catch(e) {
                      JSON.stringify({ ok: false, error: String(e) });
                    }
                  `;
                }

                if (script) {
                  const result = await new Promise<{ ok: boolean; path?: string; error?: string }>((resolve) => {
                    cs.evalScript(script, (r: string) => {
                      try {
                        const parsed = JSON.parse(r || "{}");
                        resolve(parsed);
                      } catch (_) {
                        resolve({ ok: false, error: "parse error" });
                      }
                    });
                  });

                  if (result.ok && result.path) {
                    // Validate the path matches the kind
                    const ext = result.path.split(".").pop()?.toLowerCase() || "";
                    const videoExtOk = { mov: 1, mp4: 1, mxf: 1, mkv: 1, avi: 1, m4v: 1, mpg: 1, mpeg: 1 }[ext] === 1;
                    const audioExtOk = { wav: 1, mp3: 1, aac: 1, aif: 1, aiff: 1, m4a: 1 }[ext] === 1;
                    
                    if ((kind === "video" && videoExtOk) || (kind === "audio" && audioExtOk)) {
                      if (kind === "video") {
                        await handleDroppedVideo(result.path);
                      } else {
                        await handleDroppedAudio(result.path);
                      }
                      return;
                    } else {
                      // Path doesn't match the expected kind, but might still be valid
                      // Try to determine kind from extension and handle accordingly
                      if (videoExtOk && kind === "audio") {
                        // User dropped video in audio zone - show error
                        if (typeof (window as any).showToast === "function") {
                          (window as any).showToast("please drop an audio file", "error");
                        }
                        return;
                      } else if (audioExtOk && kind === "video") {
                        // User dropped audio in video zone - show error
                        if (typeof (window as any).showToast === "function") {
                          (window as any).showToast("please drop a video file", "error");
                        }
                        return;
                      }
                    }
                  }
                }
              }
            }
          } catch (_) {
            // Fall through to file picker fallback
          }

          // Fall back to file picker for file references
          if (typeof (window as any).showToast === "function") {
            (window as any).showToast("resolving file reference…", "info");
          }
          try {
            const path = await (window as any).openFileDialog(kind);
            if (path) {
              if (kind === "video") {
                await handleDroppedVideo(path);
              } else {
                await handleDroppedAudio(path);
              }
              return;
            }
          } catch (_) {
            // Silently fail
          }
        }

        // No paths found and no file references - silently return (main branch behavior)
        return;
      }

      // Pick first path matching kind
      const picked = pickFirstMatchingByKind(paths, kind);
      if (!picked) {
        if (typeof (window as any).showToast === "function") {
          const message = kind === "video" ? "only mp4 and mov supported" : "only mp3 and wav supported";
          (window as any).showToast(message, "error");
        }
        return;
      }

      if (kind === "video") {
        await handleDroppedVideo(picked);
      } else {
        await handleDroppedAudio(picked);
      }
    } catch (err) {
      console.error("[DnD] Error in handleDropEvent:", err);
    }
  }, [extractFilePathsFromDrop, checkForFileReferences, pickFirstMatchingByKind, handleDroppedVideo, handleDroppedAudio, onVideoSelected, onAudioSelected]);

  // Attach drop handlers to a zone element
  const attachDropHandlers = useCallback((zoneEl: HTMLElement, kind: "video" | "audio") => {
    // Helper to check if target is a button or interactive element
    const isInteractiveElement = (target: EventTarget | null): boolean => {
      if (!target) return false;
      const el = target as HTMLElement;
      // Check if it's a button, link, or inside an interactive container
      if (el.tagName === "BUTTON" || 
          el.tagName === "A" || 
          el.closest("button") !== null || 
          el.closest("a") !== null ||
          el.closest(".action-btn") !== null ||
          el.closest(".upload-actions") !== null ||
          el.closest(".action-row") !== null) {
        return true;
      }
      return false;
    };

    // Add handlers to the main dropzone
    const handleDragEnter = (e: DragEvent) => {
      if (isInteractiveElement(e.target)) return;
      try {
        e.preventDefault();
      } catch (_) {}
      try {
        zoneEl.classList.add("is-dragover");
      } catch (_) {}
    };

    const handleDragOver = (e: DragEvent) => {
      if (isInteractiveElement(e.target)) return;
      try {
        e.preventDefault();
        if (e.dataTransfer) {
          e.dataTransfer.dropEffect = "copy";
        }
      } catch (_) {
        try {
          e.preventDefault();
        } catch (_) {}
      }
      try {
        zoneEl.classList.add("is-dragover");
      } catch (_) {}
    };

    const handleDragLeave = (e: DragEvent) => {
      if (isInteractiveElement(e.target)) return;
      try {
        // Only remove dragover if we're actually leaving the dropzone
        if (!zoneEl.contains(e.relatedTarget as Node)) {
          zoneEl.classList.remove("is-dragover");
        }
      } catch (_) {}
    };

    const handleDrop = async (e: DragEvent) => {
      if (isInteractiveElement(e.target)) return;
      try {
        e.preventDefault();
        e.stopPropagation();
        try {
          zoneEl.classList.remove("is-dragover");
        } catch (_) {}

        // Delegate to the main drop handler
        await handleDropEvent(e, kind);
      } catch (err) {
        console.error("[DnD] Error in drop handler:", err);
      }
    };

    zoneEl.addEventListener("dragenter", handleDragEnter);
    zoneEl.addEventListener("dragover", handleDragOver);
    zoneEl.addEventListener("dragleave", handleDragLeave);
    zoneEl.addEventListener("drop", handleDrop);

    // Also add handlers to child elements to ensure events propagate
    // BUT skip buttons and other interactive elements to avoid blocking clicks
    const childElements = zoneEl.querySelectorAll("*");
    const childHandlers: Array<{ element: Element; handlers: Array<{ event: string; handler: EventListener }> }> = [];
    
    childElements.forEach((child) => {
      // Skip buttons and other interactive elements
      if (child.tagName === "BUTTON" || 
          child.tagName === "A" || 
          child.closest("button") || 
          child.closest("a") ||
          (child as HTMLElement).onclick !== null) {
        return;
      }
      
      const handlers = [
        { event: "dragenter", handler: handleDragEnter as EventListener },
        { event: "dragover", handler: handleDragOver as EventListener },
        { event: "dragleave", handler: handleDragLeave as EventListener },
        { event: "drop", handler: handleDrop as EventListener },
      ];
      
      handlers.forEach(({ event, handler }) => {
        child.addEventListener(event, handler);
      });
      
      childHandlers.push({ element: child, handlers });
    });

    // Return cleanup function
    return () => {
      zoneEl.removeEventListener("dragenter", handleDragEnter);
      zoneEl.removeEventListener("dragover", handleDragOver);
      zoneEl.removeEventListener("dragleave", handleDragLeave);
      zoneEl.removeEventListener("drop", handleDrop);
      
      childHandlers.forEach(({ element, handlers }) => {
        handlers.forEach(({ event, handler }) => {
          element.removeEventListener(event, handler);
        });
      });
    };
  }, [handleDropEvent]);

  // Initialize drag and drop
  useEffect(() => {
    // Prevent the panel from navigating away when files are dropped
    const handleDocumentDragOver = (e: DragEvent) => {
      e.preventDefault();
    };
    const handleDocumentDrop = (e: DragEvent) => {
      e.preventDefault();
    };

    document.addEventListener("dragover", handleDocumentDragOver, false);
    document.addEventListener("drop", handleDocumentDrop, false);

    // Attach handlers to dropzones when they're available
    let videoCleanup: (() => void) | null = null;
    let audioCleanup: (() => void) | null = null;

    const initZones = () => {
      const videoZone = document.getElementById("videoDropzone");
      const audioZone = document.getElementById("audioDropzone");

      if (videoZone) {
        // Always re-attach handlers to ensure they're fresh
        if (videoCleanup) {
          videoCleanup();
        }
        videoZoneRef.current = videoZone as HTMLDivElement;
        videoCleanup = attachDropHandlers(videoZone, "video");
      }
      if (audioZone) {
        // Always re-attach handlers to ensure they're fresh
        if (audioCleanup) {
          audioCleanup();
        }
        audioZoneRef.current = audioZone as HTMLDivElement;
        audioCleanup = attachDropHandlers(audioZone, "audio");
      }
    };

    // Try to initialize immediately
    initZones();

    // Also try after a short delay in case elements aren't ready yet
    const timer = setTimeout(initZones, 100);
    
    // Also try after a longer delay
    const timer2 = setTimeout(initZones, 500);
    
    // Also check periodically in case elements are added dynamically
    // Only check for a limited time to avoid infinite polling
    let checkCount = 0;
    const maxChecks = 20; // Check for up to 10 seconds (20 * 500ms)
    const interval = setInterval(() => {
      checkCount++;
      if (checkCount >= maxChecks) {
        clearInterval(interval);
        return;
      }
      initZones();
    }, 500);

    return () => {
      document.removeEventListener("dragover", handleDocumentDragOver, false);
      document.removeEventListener("drop", handleDocumentDrop, false);
      clearTimeout(timer);
      clearTimeout(timer2);
      clearInterval(interval);
      if (videoCleanup) {
        videoCleanup();
      }
      if (audioCleanup) {
        audioCleanup();
      }
    };
  }, [attachDropHandlers]);

  return {
    videoZoneRef,
    audioZoneRef,
  };
};

