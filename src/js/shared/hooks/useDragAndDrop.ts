import { useEffect, useRef, useCallback } from "react";
import { useCore } from "./useCore";
import { getApiUrl } from "../utils/serverConfig";
import { debugLog, debugError } from "../utils/debugLog";
import { showToast, ToastMessages } from "../utils/toast";

interface UseDragAndDropOptions {
  onVideoSelected: (path: string) => void;
  onAudioSelected: (path: string) => void;
}

// Track if drop is currently being processed to prevent multiple simultaneous drops
const dropProcessingFlags: { video: boolean; audio: boolean } = {
  video: false,
  audio: false,
};

// Track if a specific file path is currently being processed to prevent duplicate handling
const processingPaths: Set<string> = new Set();

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
    // Prevent duplicate processing of the same file path
    if (processingPaths.has(raw)) {
      debugLog("[Video Selection] Already processing this path, skipping", { path: raw });
      return;
    }

    try {
      // Validate path before proceeding
      if (!raw || typeof raw !== "string" || raw.includes(".file/id=") || raw.length < 2) {
        showToast(ToastMessages.INVALID_FILE_PATH_UPLOAD, "error");
        return;
      }

      // Mark this path as being processed
      processingPaths.add(raw);

      const ext = raw.split(".").pop()?.toLowerCase() || "";
      const ok = { mov: 1, mp4: 1 }[ext] === 1;
      if (!ok) {
        processingPaths.delete(raw);
        showToast(ToastMessages.ONLY_MP4_MOV_SUPPORTED, "error");
        return;
      }
      const size = await statFileSizeBytes(raw);
      if (size > 1024 * 1024 * 1024) {
        processingPaths.delete(raw);
        showToast(ToastMessages.VIDEO_EXCEEDS_1GB, "error");
        return;
      }

      // Set video selection
      (window as any).selectedVideoIsTemp = false;
      (window as any).selectedVideo = raw;
      debugLog("[Video Selection] Drag & drop selected", { video: (window as any).selectedVideo });

      // Show uploading toast before calling setVideoPath (which handles the upload)
      showToast(ToastMessages.UPLOADING_VIDEO, "info");
      
      // Notify parent component - setVideoPath will handle the upload
      await onVideoSelected(raw);

      // Call update functions like main branch
      if (typeof (window as any).updateLipsyncButton === "function") {
        (window as any).updateLipsyncButton();
      }
      if (typeof (window as any).renderInputPreview === "function") {
        (window as any).renderInputPreview("drag-drop");
      }

      // Clear the processing flag after a delay to allow the upload to complete
      setTimeout(() => {
        processingPaths.delete(raw);
      }, 2000);
    } catch (_) {
      processingPaths.delete(raw);
    }
  }, [statFileSizeBytes, authHeaders, ensureAuthToken, onVideoSelected]);

  // Handle dropped audio
  const handleDroppedAudio = useCallback(async (raw: string) => {
    try {
      // Validate path before proceeding
      if (!raw || typeof raw !== "string" || raw.includes(".file/id=") || raw.length < 2) {
        showToast(ToastMessages.INVALID_FILE_PATH_UPLOAD, "error");
        return;
      }

      showToast(ToastMessages.VALIDATING_AUDIO, "info");
      const ext = raw.split(".").pop()?.toLowerCase() || "";
      const ok = { wav: 1, mp3: 1 }[ext] === 1;
      if (!ok) {
        showToast(ToastMessages.ONLY_MP3_WAV_SUPPORTED, "error");
        return;
      }
      const size = await statFileSizeBytes(raw);
      if (size > 1024 * 1024 * 1024) {
        showToast(ToastMessages.AUDIO_EXCEEDS_1GB, "error");
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
      // Don't call updateInputStatus here - it will be called by useEffect when both are ready

      // Upload to server
      showToast(ToastMessages.UPLOADING_AUDIO, "info");
      try {
        // Cancel any existing audio upload
        if ((window as any).audioUploadController) {
          (window as any).audioUploadController.abort();
        }
        
        // Create new AbortController for this upload
        const controller = new AbortController();
        (window as any).audioUploadController = controller;
        
        await ensureAuthToken();
        const settings = JSON.parse(localStorage.getItem("syncSettings") || "{}");
        const body = { path: raw, apiKey: settings.syncApiKey || "" };
        const r = await fetch(getApiUrl("/upload"), {
          method: "POST",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        
        // Check if upload was aborted
        if (controller.signal.aborted) {
          return;
        }
        
        const j = await r.json().catch(() => null);
        if (r.ok && j && j.ok && j.url) {
          // Check again if upload was aborted before updating state
          if (controller.signal.aborted) {
            return;
          }
          (window as any).uploadedAudioUrl = j.url;
          localStorage.setItem("uploadedAudioUrl", j.url);
          showToast(ToastMessages.AUDIO_UPLOADED_SUCCESSFULLY, "success");
        } else {
          const errorMsg = j?.error || "server error";
          showToast(ToastMessages.AUDIO_UPLOAD_FAILED(errorMsg), "error");
        }
        
        // Clear controller reference if this was the current upload
        if ((window as any).audioUploadController === controller) {
          (window as any).audioUploadController = null;
        }
      } catch (e: any) {
        // Ignore abort errors
        if (e.name === "AbortError") {
          return;
        }
        const errorMsg = e.message?.includes("Failed to fetch") ? "server connection failed" : 
                        e.message?.toLowerCase() || "unknown error";
        showToast(ToastMessages.AUDIO_UPLOAD_FAILED(errorMsg), "error");
      }
    } catch (_) {}
  }, [statFileSizeBytes, authHeaders, ensureAuthToken, onAudioSelected]);

  // Handle drop event
  const handleDropEvent = useCallback(async (e: DragEvent, kind: "video" | "audio") => {
    try {
      const dataTransfer = e.dataTransfer;
      const hasFiles = dataTransfer?.files && dataTransfer.files.length > 0;
      const types = Array.from(dataTransfer?.types || []);
      const hasFileTypes = types.some((type: string) => 
        type === 'Files' || type === 'application/x-moz-file' || type.startsWith('application/x-ns-file')
      );

      debugLog("[DnD] Drop event received", { 
        hasFiles, 
        hasFileTypes, 
        kind,
        types: types
      });

      // FIRST: Always check selection IMMEDIATELY on drop when in Premiere/AE
      // CEP can't get file paths from drag-and-drop when dragging from Premiere bins/AE folders
      // So we "fake it" by checking what's selected RIGHT NOW when drop happens
      try {
        // Use window.HOST_CONFIG if available (set by host detection), otherwise try to detect
        let isPPRO = false;
        let isAE = false;
        
        if ((window as any).HOST_CONFIG) {
          const hostConfig = (window as any).HOST_CONFIG;
          const { HOST_IDS } = await import("../../../shared/host");
          isPPRO = hostConfig.hostId === HOST_IDS.PPRO;
          isAE = hostConfig.hostId === HOST_IDS.AEFT;
        } else if ((window as any).CSInterface) {
          // Fallback: try to detect using CSInterface
          try {
            const cs = new (window as any).CSInterface();
            const env = cs.getHostEnvironment?.();
            if (env) {
              const appId = (env.appId || "").toUpperCase();
              const appName = (env.appName || "").toUpperCase();
              const { HOST_IDS } = await import("../../../shared/host");
              isPPRO = appId.includes(HOST_IDS.PPRO) || appName.includes("PREMIERE");
              isAE = appId.includes(HOST_IDS.AEFT) || appName.includes("AFTER EFFECTS");
            }
          } catch (detectErr) {
            debugError("[DnD] Error detecting host", detectErr);
          }
        }

        if (isPPRO || isAE) {
          debugLog("[DnD] In Premiere/AE - checking bin/project selection IMMEDIATELY on drop", { isPPRO, isAE });

          // "Fake" drag-and-drop: Get file path from what's currently selected in the bin/project panel
          // For Premiere: Check getCurrentProjectViewSelection() - returns what's selected in the bin
          // For AE: Check app.project.activeItem - returns the active item in the project panel
          // The app object is available directly in ExtendScript context, no need to load scripts
          const cs = new (window as any).CSInterface();
          let script = "";
          if (isPPRO) {
                script = `
                (function() {
                  try {
                    // Immediately call getCurrentProjectViewSelection() to see what's selected in the bin
                    if (typeof app !== 'undefined' && app.getCurrentProjectViewSelection) {
                      var selection = app.getCurrentProjectViewSelection();
                      if (selection && selection.length > 0) {
                        var item = selection[0];
                        if (item && typeof item.getMediaPath === 'function') {
                          var path = item.getMediaPath();
                          if (path) {
                            return JSON.stringify({ ok: true, path: path });
                          } else {
                            return JSON.stringify({ ok: false, error: 'no path' });
                          }
                        } else {
                          return JSON.stringify({ ok: false, error: 'no getMediaPath' });
                        }
                      } else {
                        return JSON.stringify({ ok: false, error: 'no selection' });
                      }
                    } else {
                      return JSON.stringify({ ok: false, error: 'app.getCurrentProjectViewSelection not available' });
                    }
                  } catch(e) {
                    return JSON.stringify({ ok: false, error: String(e) });
                  }
                })();
              `;
            } else if (isAE) {
              script = `
                (function() {
                  try {
                    if (typeof app !== 'undefined' && app.project && app.project.activeItem) {
                      var item = app.project.activeItem;
                      if (item && item.file) {
                        var file = item.file;
                        if (file && file.fsName) {
                          return JSON.stringify({ ok: true, path: file.fsName });
                        } else {
                          return JSON.stringify({ ok: false, error: 'no fsName' });
                        }
                      } else {
                        return JSON.stringify({ ok: false, error: 'no file' });
                      }
                    } else {
                      return JSON.stringify({ ok: false, error: 'app.project.activeItem not available' });
                    }
                  } catch(e) {
                    return JSON.stringify({ ok: false, error: String(e) });
                  }
                })();
              `;
          }

          if (script) {
                debugLog("[DnD] Executing selection script", { scriptLength: script.length, isPPRO, isAE });
                const result = await new Promise<{ ok: boolean; path?: string; error?: string }>((resolve) => {
                  cs.evalScript(script, (r: string) => {
                    debugLog("[DnD] evalScript callback received", { 
                      raw: r, 
                      type: typeof r, 
                      length: r?.length,
                      firstChars: r?.substring(0, 100)
                    });
                    try {
                      // Handle case where evalScript returns the JSON string directly
                      let parsed;
                      if (!r || r.trim().length === 0) {
                        debugError("[DnD] Empty response from evalScript", { raw: r });
                        parsed = { ok: false, error: 'empty response' };
                      } else if (typeof r === 'string' && r.trim().startsWith('{')) {
                        parsed = JSON.parse(r);
                      } else if (typeof r === 'string' && r.trim().length > 0) {
                        // Try to parse as-is - might be wrapped in quotes or have extra whitespace
                        const cleaned = r.trim().replace(/^["']|["']$/g, '');
                        parsed = JSON.parse(cleaned || "{}");
                      } else {
                        debugError("[DnD] Unexpected response type", { raw: r, type: typeof r });
                        parsed = { ok: false, error: 'unexpected response type' };
                      }
                      debugLog("[DnD] Parsed result", { parsed });
                      resolve(parsed);
                    } catch (parseErr) {
                      debugError("[DnD] Failed to parse selection result", { raw: r, error: parseErr });
                      resolve({ ok: false, error: `parse error: ${parseErr}` });
                    }
                  });
                });

                debugLog("[DnD] Project selection result", { ok: result.ok, path: result.path, error: result.error });
                
                if (result.ok && result.path && result.path.trim().length > 0) {
                  const cleanPath = result.path.trim();
                  // Validate the path matches the kind
                  const ext = cleanPath.split(".").pop()?.toLowerCase() || "";
                  const videoExtOk = { mov: 1, mp4: 1 }[ext] === 1;
                  const audioExtOk = { wav: 1, mp3: 1 }[ext] === 1;
                  
                  debugLog("[DnD] File type validation", { ext, videoExtOk, audioExtOk, kind, path: cleanPath });
                  
                  if ((kind === "video" && videoExtOk) || (kind === "audio" && audioExtOk)) {
                    debugLog("[DnD] ✅ SUCCESS: Processing dropped file from project selection", { path: cleanPath, kind });
                    if (kind === "video") {
                      await handleDroppedVideo(cleanPath);
                    } else {
                      await handleDroppedAudio(cleanPath);
                    }
                    return; // Successfully handled from project selection, exit early
                  } else {
                    // Path doesn't match the expected kind
                    debugLog("[DnD] File type mismatch", { ext, videoExtOk, audioExtOk, kind, path: cleanPath });
                    if (videoExtOk && kind === "audio") {
                      // User dropped video in audio zone - show error
                      showToast(ToastMessages.PLEASE_DROP_AUDIO_FILE, "error");
                      return;
                    } else if (audioExtOk && kind === "video") {
                      // User dropped audio in video zone - show error
                      showToast(ToastMessages.PLEASE_DROP_VIDEO_FILE, "error");
                      return;
                    } else {
                      // Unknown file type - log and continue to file path handling
                      debugLog("[DnD] Unknown file type from selection, trying file paths", { ext, path: cleanPath });
                    }
                  }
                } else {
                  debugLog("[DnD] Selection check returned no valid path", { ok: result.ok, error: result.error });
                }
              }
          }
      } catch (projectSelectionErr) {
        debugLog("[DnD] Project selection check failed, falling back to file paths", { error: projectSelectionErr });
        // Continue to file path handling below
      }
      
      // SECOND: Extract and handle file paths from drop event (fallback if selection didn't work or not in Premiere/AE)
      const paths = extractFilePathsFromDrop(e);
      
      if (!paths.length) {
        // Check if we have file references that need to be resolved
        const hasFileReferences = checkForFileReferences(e);
        
        debugLog("[DnD] No paths found after project selection check", { 
          hasFiles, 
          hasFileTypes, 
          hasFileReferences, 
          kind,
          types: types,
          pathsLength: paths.length
        });

        // Fall back to file picker for file references
        if (hasFileReferences) {
          showToast(ToastMessages.RESOLVING_FILE_REFERENCE, "info");
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
        const message = kind === "video" 
          ? ToastMessages.ONLY_MP4_MOV_SUPPORTED 
          : ToastMessages.ONLY_MP3_WAV_SUPPORTED;
        showToast(message, "error");
        return;
      }

      if (kind === "video") {
        await handleDroppedVideo(picked);
      } else {
        await handleDroppedAudio(picked);
      }
    } catch (err) {
      debugError("[DnD] Error in handleDropEvent", err);
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
      
      // Prevent multiple simultaneous drop processing
      if (dropProcessingFlags[kind]) {
        debugLog("[DnD] Drop already processing, ignoring duplicate", { kind });
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      
      try {
        e.preventDefault();
        e.stopPropagation();
        try {
          zoneEl.classList.remove("is-dragover");
        } catch (_) {}

        debugLog("[DnD] Drop event received", { 
          kind, 
          files: e.dataTransfer?.files?.length || 0,
          types: Array.from(e.dataTransfer?.types || []),
          items: e.dataTransfer?.items?.length || 0
        });

        // Set processing flag
        dropProcessingFlags[kind] = true;

        try {
          // Delegate to the main drop handler - properly await it
          await handleDropEvent(e, kind);
        } catch (err) {
          debugError("[DnD] Error in drop handler promise", err);
        } finally {
          // Clear processing flag immediately when done
          // Use a small delay only to prevent rapid duplicate drops from the same event
          setTimeout(() => {
            dropProcessingFlags[kind] = false;
          }, 100);
        }
      } catch (err) {
        debugError("[DnD] Error in drop handler", err);
        dropProcessingFlags[kind] = false;
      }
    };

    // Use capture phase so dropzone handlers run before document-level handlers
    zoneEl.addEventListener("dragenter", handleDragEnter, true);
    zoneEl.addEventListener("dragover", handleDragOver, true);
    zoneEl.addEventListener("dragleave", handleDragLeave, true);
    zoneEl.addEventListener("drop", handleDrop, true);

    // Also add handlers to child elements for dragenter/dragover/dragleave to ensure visual feedback
    // BUT skip buttons and other interactive elements to avoid blocking clicks
    // NOTE: We don't attach drop handlers to children - events will bubble up to the zone element
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
      
      // Only attach dragenter/dragover/dragleave to children, NOT drop
      // Drop events will bubble up to the zone element naturally
      const handlers = [
        { event: "dragenter", handler: handleDragEnter as EventListener },
        { event: "dragover", handler: handleDragOver as EventListener },
        { event: "dragleave", handler: handleDragLeave as EventListener },
      ];
      
      handlers.forEach(({ event, handler }) => {
        child.addEventListener(event, handler);
      });
      
      childHandlers.push({ element: child, handlers });
    });

    // Return cleanup function
    return () => {
      zoneEl.removeEventListener("dragenter", handleDragEnter, true);
      zoneEl.removeEventListener("dragover", handleDragOver, true);
      zoneEl.removeEventListener("dragleave", handleDragLeave, true);
      zoneEl.removeEventListener("drop", handleDrop, true);
      
      childHandlers.forEach(({ element, handlers }) => {
        handlers.forEach(({ event, handler }) => {
          element.removeEventListener(event, handler);
        });
      });
    };
  }, [handleDropEvent]);

  // Initialize drag and drop
  useEffect(() => {
    // Only prevent navigation on dragover - dropzone handlers will handle actual drops
    // This prevents the browser from navigating away when files are dragged over the panel
    const handleDocumentDragOver = (e: DragEvent) => {
      e.preventDefault();
    };
    
    try {
      // Always prevent default on dragover to avoid navigation
      document.addEventListener("dragover", handleDocumentDragOver, false);
      // Don't add a document-level drop handler - let dropzone handlers handle all drops
    } catch (err) {
      debugError("[DnD] Error adding document listeners", err);
    }

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
      try {
        document.removeEventListener("dragover", handleDocumentDragOver, false);
        clearTimeout(timer);
        clearTimeout(timer2);
        clearInterval(interval);
        if (videoCleanup) {
          videoCleanup();
        }
        if (audioCleanup) {
          audioCleanup();
        }
      } catch (err) {
        debugError("[DnD] Error in cleanup", err);
      }
    };
  }, [attachDropHandlers]);

  return {
    videoZoneRef,
    audioZoneRef,
  };
};

