import { os } from "../cep/node";
import { csi } from "./bolt";

/**
 * Register all possible keyboard shortcuts on Mac and Windows for you CEP Panel
 * Warning: Note that certain keys will not work per OS regardless of registration
 */

export const keyRegisterOverride = () => {
  //@ts-ignore
  const platform = navigator.platform.substring(0, 3);
  let maxKey = 0;
  if (platform === "Mac") maxKey = 126; // Mac Max Key Code
  else if (platform === "Win") maxKey = 222; // HTML Max Key Code
  let allKeys: {
    keyCode: number;
    ctrlKey: boolean;
    altKey: boolean;
    shiftKey: boolean;
    metaKey: boolean;
  }[] = [];
  for (let k = 0; k <= maxKey; k++) {
    for (let j = 0; j <= 15; j++) {
      const guide = (j >>> 0).toString(2).padStart(4, "0");
      allKeys.push({
        keyCode: k,
        ctrlKey: guide[0] === "1",
        altKey: guide[1] === "1",
        shiftKey: guide[2] === "1",
        metaKey: guide[3] === "1",
      });
    }
  }
  const keyRes = csi.registerKeyEventsInterest(JSON.stringify(allKeys));
  console.log("Key Events Registered Completed: " + keyRes);
};

export const textCepPatch = (e: KeyboardEvent) => {
  const isMac = os.platform() === "darwin";
  if (!isMac) return; // Only needed on MacOS, Windows handles this natively

  // console.log("keyup", e);

  const isShiftKey = e.shiftKey;
  const input = e.target as HTMLTextAreaElement | HTMLInputElement;
  const start = input.selectionStart;
  let end = input.selectionEnd;

  const selectionExists = start !== null && end !== null && start !== end;

  if (start === null || end === null) return;

  if (e.key === "ArrowLeft") {
    if (start === 0) return; // Prevents going to -1
    if (isShiftKey) {
      input.setSelectionRange(start - 1, end);
    } else {
      input.setSelectionRange(start - 1, start - 1);
    }
  } else if (e.key === "ArrowRight") {
    if (end === input.value.length) return; // Prevents going to start
    if (isShiftKey) {
      input.setSelectionRange(start, end + 1);
    } else {
      input.setSelectionRange(end + 1, end + 1);
    }
  }
};

/**
 * Prevents the user from dropping files or URLs onto the panel and navigating away
 * Also handles fake drag-and-drop by calling getCurrentProjectViewSelection (Premiere) or getting activeItem (After Effects)
 * Only triggers when dragging from the app itself (no files in dataTransfer), not from Finder/File Explorer
 */

export const dropDisable = () => {
  window.addEventListener("dragover", (e) => e.preventDefault(), false);
  window.addEventListener("drop", async (e) => {
    e.preventDefault();
    
    // Check if this is a drag from the app itself vs from Finder/File Explorer
    const dataTransfer = e.dataTransfer;
    const hasFiles = dataTransfer?.files && dataTransfer.files.length > 0;
    const hasFileTypes = dataTransfer?.types?.some((type: string) => 
      type === 'Files' || type === 'application/x-moz-file' || type.startsWith('application/x-ns-file')
    );
    
    // Only call selection function if NO files are being dragged (i.e., drag from app itself)
    if (hasFiles || hasFileTypes) {
      // This is a drag from Finder/File Explorer - just prevent default, don't call selection
      return;
    }
    
    // Determine which dropzone was targeted
    const target = e.target as HTMLElement;
    const videoDropzone = document.getElementById('videoDropzone');
    const audioDropzone = document.getElementById('audioDropzone');
    
    // Check if drop occurred over a dropzone
    const isOverVideoZone = videoDropzone && videoDropzone.contains(target);
    const isOverAudioZone = audioDropzone && audioDropzone.contains(target);
    
    // Determine the kind (video or audio) based on which dropzone was targeted
    let kind: 'video' | 'audio' | null = null;
    if (isOverVideoZone) {
      kind = 'video';
    } else if (isOverAudioZone) {
      kind = 'audio';
    } else {
      // If not over a specific dropzone, try to determine from the drop target
      // Check if we're in the video or audio section
      const videoSection = document.getElementById('videoSection');
      const audioSection = document.getElementById('audioSection');
      if (videoSection && videoSection.contains(target)) {
        kind = 'video';
      } else if (audioSection && audioSection.contains(target)) {
        kind = 'audio';
      }
    }
    
    // If we can't determine the kind, don't proceed
    if (!kind) {
      return;
    }
    
    // This appears to be a drag from within the app - call selection function
    try {
      if ((window as any).CSInterface) {
        const cs = new (window as any).CSInterface();
        // Detect host application
        const appId = cs.getApplicationID();
        const { HOST_IDS } = await import("../../../shared/host");
        const isAE = appId && (appId.includes(HOST_IDS.AEFT) || appId.includes('AfterEffects'));
        const isPPRO = appId && (appId.includes(HOST_IDS.PPRO) || appId.includes('Premiere'));
        
        // Get extension path for loading host scripts
        const extPath = cs.getSystemPath((window as any).CSInterface.SystemPath.EXTENSION);
        const hostFile = isPPRO ? "/host/ppro.jsx" : "/host/ae.jsx";
        const escPath = String(extPath + hostFile).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
        
        // Load host script first
        await new Promise<void>((resolve) => {
          cs.evalScript(`$.evalFile("${escPath}")`, () => resolve());
        });
        
        // Call host-specific function via evalScript to get file path
        const result = await new Promise<{ ok: boolean; path?: string; error?: string }>((resolve) => {
          let script = '';
          if (isPPRO) {
            // Premiere Pro: use getCurrentProjectViewSelection
            script = `
              try {
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
                  return JSON.stringify({ ok: false, error: 'not available' });
                }
              } catch(e) {
                return JSON.stringify({ ok: false, error: String(e) });
              }
            `;
          } else if (isAE) {
            // After Effects: get active composition/item
            script = `
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
                  return JSON.stringify({ ok: false, error: 'not available' });
                }
              } catch(e) {
                return JSON.stringify({ ok: false, error: String(e) });
              }
            `;
          } else {
            // Unknown host - try both
            script = `
              try {
                if (typeof app !== 'undefined') {
                  if (app.getCurrentProjectViewSelection) {
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
                  } else if (app.project && app.project.activeItem) {
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
                    return JSON.stringify({ ok: false, error: 'not available' });
                  }
                } else {
                  return JSON.stringify({ ok: false, error: 'not available' });
                }
              } catch(e) {
                return JSON.stringify({ ok: false, error: String(e) });
              }
            `;
          }
          
          cs.evalScript(script, (r: string) => {
            try {
              const parsed = JSON.parse(r || "{}");
              resolve(parsed);
            } catch (_) {
              resolve({ ok: false, error: "parse error" });
            }
          });
        });
        
        // If we got a file path, trigger the appropriate handler
        if (result.ok && result.path) {
          // Validate the path matches the kind
          const ext = result.path.split(".").pop()?.toLowerCase() || "";
          const videoExtOk = { mov: 1, mp4: 1 }[ext] === 1;
          const audioExtOk = { wav: 1, mp3: 1 }[ext] === 1;
          
          // Check if the file type matches the dropzone
          if ((kind === "video" && videoExtOk) || (kind === "audio" && audioExtOk)) {
            // Call the appropriate handler
            if (kind === "video" && typeof (window as any).setVideoPath === 'function') {
              await (window as any).setVideoPath(result.path);
            } else if (kind === "audio" && typeof (window as any).setAudioPath === 'function') {
              await (window as any).setAudioPath(result.path);
            }
          } else {
            // File type doesn't match dropzone - show error
            const { showToast, ToastMessages } = await import("../../shared/utils/toast");
            if (videoExtOk && kind === "audio") {
              showToast(ToastMessages.PLEASE_DROP_AUDIO_FILE, "error");
            } else if (audioExtOk && kind === "video") {
              showToast(ToastMessages.PLEASE_DROP_VIDEO_FILE, "error");
            }
          }
        }
      }
    } catch (error) {
      // Log error but don't break the app
      const { debugError } = await import("../../shared/utils/debugLog");
      debugError("[dropDisable] Error handling fake drag-and-drop", error);
    }
  }, false);
};

