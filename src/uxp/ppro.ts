// UXP Host Script for Premiere Pro
// Converted from ExtendScript to UXP JavaScript

import { storage } from "uxp";
import { app } from "application";

const fs = storage.localFileSystem;

// Utility functions
function _respond(data: any): string {
  try {
    return JSON.stringify(data);
  } catch (e) {
    return String(data);
  }
}

async function SYNC_getBaseDirs() {
  try {
    const isWindows = process.platform === "win32";
    const dataFolder = await fs.getDataFolder();
    const baseFolder = await dataFolder.createFolder("sync. extensions", { create: true });
    
    const ensure = async (name: string) => {
      const folder = await baseFolder.createFolder(name, { create: true });
      return folder.nativePath;
    };
    
    return {
      base: baseFolder.nativePath,
      logs: await ensure("logs"),
      cache: await ensure("cache"),
      state: await ensure("state"),
      uploads: await ensure("uploads"),
      updates: await ensure("updates"),
    };
  } catch (e) {
    console.error("[SYNC_getBaseDirs] Error:", e);
    return {
      base: "",
      logs: "",
      cache: "",
      state: "",
      uploads: "",
      updates: "",
    };
  }
}

async function SYNC_getLogDir() {
  try {
    const dirs = await SYNC_getBaseDirs();
    return dirs.logs;
  } catch (_) {
    return "";
  }
}

async function SYNC_getUploadsDir() {
  try {
    const dirs = await SYNC_getBaseDirs();
    return dirs.uploads;
  } catch (_) {
    return "";
  }
}

async function _pproDebugLogPath() {
  try {
    const isWindows = process.platform === "win32";
    const dir = await SYNC_getLogDir();
    if (!dir) {
      const temp = await fs.getTemporaryFolder();
      return temp.nativePath + (isWindows ? "\\" : "/") + "sync_ppro_debug.log";
    }
    
    // Check for debug flag
    const flagFile = await fs.getFileForReading(dir + (isWindows ? "\\" : "/") + ".debug");
    if (!(await flagFile.exists())) {
      return "";
    }
    
    return dir + (isWindows ? "\\" : "/") + "sync_ppro_debug.log";
  } catch (e) {
    const temp = await fs.getTemporaryFolder();
    return temp.nativePath + "/sync_ppro_debug.log";
  }
}

async function _hostLog(msg: string) {
  try {
    const s = String(msg || "");
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] [ppro] ${s}\n`;
    
    const logPath = await _pproDebugLogPath();
    if (logPath) {
      const logFile = await fs.getFileForWriting(logPath);
      await logFile.write(logLine, { append: true });
    }
  } catch (e) {
    // Silently fail
  }
}

let __showDialogBusy = false;

export async function PPRO_showFileDialog(payloadJson: string) {
  try {
    if (__showDialogBusy) {
      await _hostLog("PPRO_showFileDialog busy");
      return _respond({ ok: false, error: "busy" });
    }
    __showDialogBusy = true;
    await _hostLog("PPRO_showFileDialog invoked");
    
    let p: any = {};
    try {
      p = JSON.parse(payloadJson);
    } catch (e) {}
    
    const kind = p.kind || "video";
    const allow = kind === "audio" ? { wav: 1, mp3: 1 } : { mov: 1, mp4: 1 };
    
    // UXP file picker
    const fileFilter = kind === "audio" 
      ? [{ name: "Audio Files", extensions: ["wav", "mp3"] }]
      : [{ name: "Video Files", extensions: ["mov", "mp4"] }];
    
    const file = await fs.getFileForOpening({ types: fileFilter });
    
    if (file) {
      const ext = file.name.split(".").pop()?.toLowerCase() || "";
      if (!allow[ext as keyof typeof allow]) {
        return _respond({ ok: false, error: "Invalid file type" });
      }
      
      // Check file size
      const stat = await file.stat();
      if (stat.size > 1024 * 1024 * 1024) {
        await _hostLog(`PPRO_showFileDialog rejected: file size exceeds 1GB (${stat.size} bytes)`);
        return _respond({ ok: false, error: "File size exceeds 1GB limit" });
      }
      
      await _hostLog(`PPRO_showFileDialog selected: ${file.nativePath}`);
      return _respond({ ok: true, path: file.nativePath });
    }
    
    await _hostLog("PPRO_showFileDialog canceled");
    return _respond({ ok: false, error: "No file selected" });
  } catch (e) {
    return _respond({ ok: false, error: String(e) });
  } finally {
    __showDialogBusy = false;
  }
}

export async function PPRO_getProjectDir() {
  try {
    if (app && app.project && app.project.path) {
      const projPath = app.project.path;
      if (projPath) {
        const projFile = await fs.getFileForReading(projPath);
        const parent = await projFile.parent;
        if (parent) {
          const outFolder = await parent.createFolder("sync. outputs", { create: true });
          return _respond({
            ok: true,
            projectDir: parent.nativePath,
            outputDir: outFolder.nativePath,
          });
        }
      }
    }
    return _respond({ ok: false, error: "No project open" });
  } catch (e) {
    return _respond({ ok: false, error: String(e) });
  }
}

// Placeholder implementations for other functions
// These will need to be implemented using UXP APIs

export async function PPRO_insertAtPlayhead(jobId: string) {
  // TODO: Implement using UXP APIs
  return _respond({ ok: false, error: "Not yet implemented in UXP" });
}

export async function PPRO_insertFileAtPlayhead(payloadJson: string) {
  // TODO: Implement using UXP APIs
  return _respond({ ok: false, error: "Not yet implemented in UXP" });
}

export async function PPRO_importIntoBin(jobId: string) {
  // TODO: Implement using UXP APIs
  return _respond({ ok: false, error: "Not yet implemented in UXP" });
}

export async function PPRO_importFileToBin(payloadJson: string) {
  // TODO: Implement using UXP APIs
  return _respond({ ok: false, error: "Not yet implemented in UXP" });
}

export async function PPRO_revealFile(payloadJson: string) {
  try {
    const p: any = {};
    try {
      p = JSON.parse(payloadJson || "{}");
    } catch (e) {}
    
    const fsPath = String((p && (p.path || p)) || "");
    if (!fsPath) {
      return _respond({ ok: false, error: "No path" });
    }
    
    const file = await fs.getFileForReading(fsPath);
    if (!(await file.exists())) {
      return _respond({ ok: false, error: "File not found" });
    }
    
    // UXP doesn't have a direct reveal API, but we can return success
    // The panel can handle revealing the file
    return _respond({ ok: true });
  } catch (e) {
    return _respond({ ok: false, error: String(e) });
  }
}

export async function PPRO_exportInOutVideo(payloadJson: string) {
  // TODO: Implement using UXP APIs
  return _respond({ ok: false, error: "Not yet implemented in UXP" });
}

export async function PPRO_exportInOutAudio(payloadJson: string) {
  // TODO: Implement using UXP APIs
  return _respond({ ok: false, error: "Not yet implemented in UXP" });
}

export async function PPRO_startBackend() {
  // Backend startup is handled by the panel, not the host script
  return _respond({ ok: true, message: "Backend startup handled by panel" });
}

export async function PPRO_stopBackend() {
  // Backend stop is handled by the panel
  return _respond({ ok: true, message: "Backend stop handled by panel" });
}

export async function PPRO_diag() {
  return _respond({
    ok: true,
    systemType: typeof system,
    fileName: __filename || "",
    os: process.platform,
  });
}

export async function PPRO_diagInOut(payloadJson: string) {
  return _respond({
    ok: true,
    hasActiveSequence: !!(app && app.project && app.project.activeSequence),
  });
}
