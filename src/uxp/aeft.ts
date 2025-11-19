// UXP Host Script for After Effects
// Converted from ExtendScript to UXP JavaScript

import { storage } from "uxp";
import { app } from "application";

const fs = storage.localFileSystem;

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

async function _syncDebugLogPath() {
  try {
    const isWindows = process.platform === "win32";
    const dir = await SYNC_getLogDir();
    if (!dir) {
      const temp = await fs.getTemporaryFolder();
      return temp.nativePath + (isWindows ? "\\" : "/") + "sync_ae_debug.log";
    }
    
    const flagFile = await fs.getFileForReading(dir + (isWindows ? "\\" : "/") + ".debug");
    if (!(await flagFile.exists())) {
      return "";
    }
    
    return dir + (isWindows ? "\\" : "/") + "sync_ae_debug.log";
  } catch (e) {
    const temp = await fs.getTemporaryFolder();
    return temp.nativePath + "/sync_ae_debug.log";
  }
}

async function _hostLog(msg: string) {
  try {
    const s = String(msg || "");
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] [aeft] ${s}\n`;
    
    const logPath = await _syncDebugLogPath();
    if (logPath) {
      const logFile = await fs.getFileForWriting(logPath);
      await logFile.write(logLine, { append: true });
    }
  } catch (e) {
    // Silently fail
  }
}

export async function AEFT_getProjectDir() {
  try {
    if (app && app.project && app.project.file) {
      const projFile = app.project.file;
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
    return _respond({ ok: false, error: "No project folder" });
  } catch (e) {
    return _respond({ ok: false, error: String(e) });
  }
}

export async function AEFT_showFileDialog(payloadJson: string) {
  try {
    let p: any = {};
    try {
      p = JSON.parse(payloadJson || "{}");
    } catch (e) {}
    
    const kind = String(p.kind || "video");
    await _hostLog(`AEFT_showFileDialog called, kind: ${kind}`);
    
    const allow = kind === "audio" ? { wav: 1, mp3: 1 } : { mov: 1, mp4: 1 };
    
    const fileFilter = kind === "audio"
      ? [{ name: "Audio Files", extensions: ["wav", "mp3"] }]
      : [{ name: "Video Files", extensions: ["mov", "mp4"] }];
    
    const file = await fs.getFileForOpening({ types: fileFilter });
    
    if (file) {
      const ext = file.name.split(".").pop()?.toLowerCase() || "";
      if (!allow[ext as keyof typeof allow]) {
        await _hostLog(`Invalid file type: ${ext}`);
        return _respond({ ok: false, error: "Invalid file type" });
      }
      
      const stat = await file.stat();
      if (stat.size > 1024 * 1024 * 1024) {
        await _hostLog(`File size exceeds 1GB: ${stat.size} bytes`);
        return _respond({ ok: false, error: "File size exceeds 1GB limit" });
      }
      
      await _hostLog(`File selected: ${file.nativePath}`);
      return _respond({ ok: true, path: file.nativePath });
    }
    
    await _hostLog("No file selected or file doesn't exist");
    return _respond({ ok: false, error: "No file selected" });
  } catch (e) {
    await _hostLog(`AEFT_showFileDialog error: ${String(e)}`);
    return _respond({ ok: false, error: String(e) });
  }
}

export async function AEFT_exportInOutVideo(payloadJson: string) {
  // TODO: Implement using UXP APIs
  return _respond({ ok: false, error: "Not yet implemented in UXP" });
}

export async function AEFT_exportInOutAudio(payloadJson: string) {
  // TODO: Implement using UXP APIs
  return _respond({ ok: false, error: "Not yet implemented in UXP" });
}

export async function AEFT_insertAtPlayhead(jobId: string) {
  // TODO: Implement using UXP APIs
  return _respond({ ok: false, error: "Not yet implemented in UXP" });
}

export async function AEFT_insertFileAtPlayhead(payloadOrJson: string) {
  // TODO: Implement using UXP APIs
  return _respond({ ok: false, error: "Not yet implemented in UXP" });
}

export async function AEFT_importFileToBin(payloadOrJson: string) {
  // TODO: Implement using UXP APIs
  return _respond({ ok: false, error: "Not yet implemented in UXP" });
}

export async function AEFT_revealFile(payloadJson: string) {
  try {
    const p: any = {};
    try {
      p = JSON.parse(payloadJson || "{}");
    } catch (e) {}
    
    const path = String(p.path || p || "");
    if (!path) {
      return _respond({ ok: false, error: "No path" });
    }
    
    const file = await fs.getFileForReading(path);
    if (!(await file.exists())) {
      return _respond({ ok: false, error: "File not found" });
    }
    
    return _respond({ ok: true });
  } catch (e) {
    return _respond({ ok: false, error: String(e) });
  }
}

export async function AEFT_startBackend() {
  return _respond({ ok: true, message: "Backend startup handled by panel" });
}

export async function AEFT_stopBackend() {
  return _respond({ ok: true, message: "Backend stop handled by panel" });
}

export async function AEFT_diagInOut(payloadJson: string) {
  return _respond({
    ok: true,
    host: "AEFT",
    projectOpen: !!(app && app.project),
  });
}
