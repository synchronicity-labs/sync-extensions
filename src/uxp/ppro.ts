// UXP Host Script for Premiere Pro
// Converted from ExtendScript to UXP JavaScript

import { storage } from "uxp";

// UXP application APIs
declare const app: any;
declare const require: any;
declare const process: any;
declare const CompItem: any;
declare const FootageItem: any;
declare const FolderItem: any;
declare const ImportOptions: any;
declare const ImportAsType: any;

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
    
    try {
      const flagFile = await fs.getFileForReading(dir + (isWindows ? "\\" : "/") + ".debug");
      if (!(await flagFile.exists())) {
        return "";
      }
    } catch (_) {
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
      try {
        const logFile = await fs.getFileForWriting(logPath);
        await logFile.write(logLine, { append: true });
      } catch (_) {
        // Silently fail if write fails
      }
    }
  } catch (e) {
    // Silently fail
  }
}

function _extensionRoot(): string {
  try {
    // UXP provides plugin folder path
    const pluginFolder = require("uxp").storage.localFileSystem.getPluginFolder();
    return pluginFolder?.nativePath || "";
  } catch (e) {
    return "";
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
    
    try {
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
    } catch (e) {
      // User cancelled or error
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

export async function PPRO_insertAtPlayhead(jobId: string) {
  try {
    await _hostLog(`PPRO_insertAtPlayhead called with jobId: ${jobId}`);
    
    const uploadsDir = await SYNC_getUploadsDir();
    const outputPath = uploadsDir + "/" + jobId + "_output.mp4";
    
    const outputFile = await fs.getFileForReading(outputPath);
    if (!(await outputFile.exists())) {
      return _respond({ ok: false, error: "Output file not found" });
    }
    
    if (!app || !app.project) {
      return _respond({ ok: false, error: "No project open" });
    }
    
    const project = app.project;
    const sequence = project.activeSequence;
    if (!sequence) {
      return _respond({ ok: false, error: "No active sequence" });
    }
    
    // Import file into project
    const projectItems = project.importFiles([outputPath], true, project.getInsertionBin(), false);
    if (!projectItems || projectItems.length === 0) {
      return _respond({ ok: false, error: "Failed to import file" });
    }
    
    const projectItem = projectItems[0];
    const playheadPosition = sequence.getPlayerPosition();
    
    // Insert at playhead on first video track
    if (sequence.videoTracks && sequence.videoTracks.length > 0) {
      sequence.videoTracks[0].clips.insert(projectItem, playheadPosition.seconds);
      return _respond({ ok: true, message: "Inserted at playhead" });
    }
    
    return _respond({ ok: false, error: "No video tracks available" });
  } catch (e) {
    await _hostLog(`PPRO_insertAtPlayhead error: ${String(e)}`);
    return _respond({ ok: false, error: String(e) });
  }
}

export async function PPRO_insertFileAtPlayhead(payloadJson: string) {
  try {
    await _hostLog(`PPRO_insertFileAtPlayhead called`);
    
    let p: any = {};
    try {
      p = JSON.parse(payloadJson || "{}");
    } catch (e) {
      await _hostLog(`JSON parse error: ${String(e)}`);
    }
    
    const fsPath = String((p && (p.path || p)) || "");
    if (!fsPath) {
      return _respond({ ok: false, error: "No path provided" });
    }
    
    const file = await fs.getFileForReading(fsPath);
    if (!(await file.exists())) {
      return _respond({ ok: false, error: "File not found" });
    }
    
    if (!app || !app.project) {
      return _respond({ ok: false, error: "No project" });
    }
    
    const project = app.project;
    const sequence = project.activeSequence;
    if (!sequence) {
      return _respond({ ok: false, error: "No active sequence" });
    }
    
    // Ensure destination bin exists
    const root = project.rootItem;
    let targetBin = null;
    
    for (let i = 0; i < root.children.numItems; i++) {
      const it = root.children[i];
      if (it && it.type === 2 && it.name === "sync. outputs") {
        targetBin = it;
        break;
      }
    }
    
    if (!targetBin) {
      try {
        targetBin = root.createBin("sync. outputs");
      } catch (e) {
        // Ignore
      }
    }
    
    if (!targetBin) {
      return _respond({ ok: false, error: "Bin not found" });
    }
    
    // Find or import project item
    let projItem = null;
    
    // Check if already imported
    for (let j = targetBin.children.numItems - 1; j >= 0; j--) {
      const child = targetBin.children[j];
      try {
        if (child && typeof child.getMediaPath === "function") {
          const mp = child.getMediaPath();
          if (mp && mp === fsPath) {
            projItem = child;
            break;
          }
        }
      } catch (e) {
        // Ignore
      }
      if (!projItem && child && child.name === file.name) {
        projItem = child;
        break;
      }
    }
    
    // Import if not found
    if (!projItem) {
      try {
        project.importFiles([fsPath], true, targetBin, false);
        // Find the newly imported item
        for (let k = targetBin.children.numItems - 1; k >= 0; k--) {
          const c = targetBin.children[k];
          try {
            if (c && typeof c.getMediaPath === "function" && c.getMediaPath() === fsPath) {
              projItem = c;
              break;
            }
          } catch (e) {
            // Ignore
          }
          if (!projItem && c && c.name === file.name) {
            projItem = c;
            break;
          }
        }
      } catch (e) {
        // Ignore
      }
    }
    
    if (!projItem) {
      return _respond({ ok: false, error: "Import failed" });
    }
    
    const pos = sequence.getPlayerPosition();
    
    // Choose targeted video track if available
    let vIndex = 0;
    try {
      const vCount = sequence.videoTracks ? sequence.videoTracks.numTracks : 0;
      for (let vi = 0; vi < vCount; vi++) {
        try {
          if (sequence.videoTracks[vi] && typeof sequence.videoTracks[vi].isTargeted === "function" && sequence.videoTracks[vi].isTargeted()) {
            vIndex = vi;
            break;
          }
        } catch (e) {
          // Ignore
        }
      }
    } catch (e) {
      // Ignore
    }
    
    // Overwrite at playhead
    try {
      const t = sequence.videoTracks[vIndex];
      const beforeCount = (t && t.clips) ? t.clips.numItems : 0;
      t.overwriteClip(projItem, pos.ticks);
      
      // Verify success
      let success = false;
      try {
        if (t && t.clips && t.clips.numItems >= beforeCount) {
          for (let ix = 0; ix < t.clips.numItems; ix++) {
            const cc = t.clips[ix];
            const st = cc.start.ticks;
            const en = cc.end.ticks;
            if (st <= pos.ticks && en > pos.ticks) {
              success = true;
              break;
            }
          }
        }
      } catch (e) {
        // Ignore
      }
      
      if (success) {
        return _respond({ ok: true, videoTrack: vIndex, mode: "overwrite" });
      }
    } catch (e1) {
      // Ignore and return error
    }
    
    return _respond({ ok: false, error: "overwrite failed" });
  } catch (e) {
    await _hostLog(`PPRO_insertFileAtPlayhead error: ${String(e)}`);
    return _respond({ ok: false, error: String(e) });
  }
}

export async function PPRO_importIntoBin(jobId: string) {
  try {
    await _hostLog(`PPRO_importIntoBin called with jobId: ${jobId}`);
    
    const uploadsDir = await SYNC_getUploadsDir();
    const outputPath = uploadsDir + "/" + jobId + "_output.mp4";
    
    const outputFile = await fs.getFileForReading(outputPath);
    if (!(await outputFile.exists())) {
      return _respond({ ok: false, error: "Output file not found" });
    }
    
    if (!app || !app.project) {
      return _respond({ ok: false, error: "No project open" });
    }
    
    const project = app.project;
    const projectItems = project.importFiles([outputPath], true, project.getInsertionBin(), false);
    
    if (projectItems && projectItems.length > 0) {
      return _respond({ ok: true, message: "Added to project bin" });
    }
    
    return _respond({ ok: false, error: "Failed to import file" });
  } catch (e) {
    await _hostLog(`PPRO_importIntoBin error: ${String(e)}`);
    return _respond({ ok: false, error: String(e) });
  }
}

export async function PPRO_importFileToBin(payloadJson: string) {
  try {
    await _hostLog(`PPRO_importFileToBin called`);
    
    let p: any = {};
    try {
      p = JSON.parse(payloadJson || "{}");
    } catch (e) {
      await _hostLog(`JSON parse error: ${String(e)}`);
    }
    
    const fsPath = String(p.path || "");
    const binName = String(p.binName || "");
    
    if (!app || !app.project) {
      return _respond({ ok: false, error: "No project" });
    }
    
    const project = app.project;
    let targetBin = project.getInsertionBin();
    
    if (binName) {
      // Try to find/create bin with given name at root
      const root = project.rootItem;
      let found = null;
      
      for (let i = 0; i < root.children.numItems; i++) {
        const item = root.children[i];
        if (item && item.name === binName && item.type === 2) {
          found = item;
          break;
        }
      }
      
      if (!found) {
        try {
          found = root.createBin(binName);
        } catch (e) {
          // Ignore
        }
      }
      
      if (found) {
        targetBin = found;
      }
    }
    
    let results = null;
    try {
      results = project.importFiles([fsPath], true, targetBin, false);
    } catch (e) {
      results = null;
    }
    
    // Verify import succeeded
    if (!results || !results.length) {
      try {
        const fileName = fsPath.split(/[/\\]/).pop() || "";
        for (let k = targetBin.children.numItems - 1; k >= 0; k--) {
          const c = targetBin.children[k];
          try {
            if (c && typeof c.getMediaPath === "function") {
              const mp = c.getMediaPath();
              if (mp && mp === fsPath) {
                return _respond({ ok: true, reused: true });
              }
            }
            if (c && fileName && c.name === fileName) {
              return _respond({ ok: true, byName: true });
            }
          } catch (_) {
            // Ignore
          }
        }
      } catch (_) {
        // Ignore
      }
    } else {
      return _respond({ ok: true });
    }
    
    return _respond({ ok: false, error: "Import verification failed" });
  } catch (e) {
    await _hostLog(`PPRO_importFileToBin error: ${String(e)}`);
    return _respond({ ok: false, error: String(e) });
  }
}

export async function PPRO_revealFile(payloadJson: string) {
  try {
    let p: any = {};
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
    
    // UXP doesn't have a direct reveal API
    // Return success - the panel can handle revealing if needed
    return _respond({ ok: true });
  } catch (e) {
    return _respond({ ok: false, error: String(e) });
  }
}

function _eprRoot(): string {
  try {
    const extRoot = _extensionRoot();
    if (!extRoot) return "";
    
    // Check both locations
    const actualPath = extRoot + "/js/panels/ppro/epr";
    const legacyPath = extRoot + "/epr";
    
    // Try to check if folder exists (would need async, but for now return path)
    return actualPath;
  } catch (e) {
    return "";
  }
}

async function _listEprRec(folderPath: string, depth: number): Promise<any[]> {
  const out: any[] = [];
  try {
    const folder = await fs.getFolderForReading(folderPath);
    if (!(await folder.exists())) return out;
    
    const entries = await folder.getEntries();
    for (const entry of entries) {
      try {
        if (entry.isFile && entry.name.toLowerCase().indexOf(".epr") !== -1) {
          out.push(entry);
        } else if (entry.isFolder && depth > 0) {
          const sub = await _listEprRec(entry.nativePath, depth - 1);
          out.push(...sub);
        }
      } catch (e) {
        // Ignore
      }
    }
  } catch (e) {
    // Ignore
  }
  return out;
}

async function _findEprByKeywords(kind: string, prefers: string[]): Promise<string> {
  try {
    const root = _eprRoot();
    if (!root) return "";
    
    const files = await _listEprRec(root, 3);
    if (!files.length) return "";
    
    // Score files by keyword hits in name
    function score(name: string): number {
      let s = 0;
      const nm = String(name || "").toLowerCase();
      for (const pref of prefers) {
        if (nm.indexOf(pref.toLowerCase()) !== -1) s += 10;
      }
      return s;
    }
    
    let best: any = null;
    let bestScore = -1;
    
    for (const f of files) {
      const sc = score(f.name);
      if (sc > bestScore) {
        best = f;
        bestScore = sc;
      }
    }
    
    return best ? best.nativePath : "";
  } catch (e) {
    return "";
  }
}

async function _pickVideoPresetPath(codec: string): Promise<string> {
  const c = String(codec || "h264").toLowerCase();
  const root = _eprRoot();
  if (!root) return "";
  
  function join(name: string): string {
    return root + "/" + name;
  }
  
  // Prefer exact filenames
  if (c === "h264") {
    const p1 = join("Match Source - Adaptive High Bitrate.epr");
    const p2 = join("Match Source - High Bitrate.epr");
    const kw = await _findEprByKeywords("video", ["match source", "adaptive", "high bitrate", "h.264", "h264"]);
    if (kw) return kw;
  }
  
  if (c === "prores_422") {
    const p = join("ProRes 422.epr");
    const kw2 = await _findEprByKeywords("video", ["prores 422", "prores", "422"]);
    if (kw2) return kw2;
  }
  
  return "";
}

async function _pickAudioPresetPath(format: string): Promise<string> {
  const f = String(format || "wav").toLowerCase();
  
  if (f === "wav") {
    return await _findEprByKeywords("audio", ["wav", "waveform"]);
  }
  
  if (f === "mp3") {
    return await _findEprByKeywords("audio", ["mp3", "320"]);
  }
  
  return "";
}

async function _getTempPath(ext: string): Promise<string> {
  try {
    const uploadsDir = await SYNC_getUploadsDir();
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 10000);
    return uploadsDir + "/inout_" + timestamp + "_" + random + "." + ext;
  } catch (e) {
    return "";
  }
}

async function _waitForFile(filePath: string, ms: number): Promise<boolean> {
  const start = Date.now();
  let lastSize = -1;
  let stableCount = 0;
  
  while (Date.now() - start < (ms || 120000)) {
    try {
      const file = await fs.getFileForReading(filePath);
      if (await file.exists()) {
        const stat = await file.stat();
        const sz = stat.size;
        if (sz > 0) {
          if (sz === lastSize) {
            stableCount++;
            if (stableCount > 3) return true;
          } else {
            lastSize = sz;
            stableCount = 0;
          }
        }
      }
    } catch (e) {
      // Ignore
    }
    
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  return false;
}

export async function PPRO_exportInOutVideo(payloadJson: string) {
  try {
    await _hostLog(`PPRO_exportInOutVideo called`);
    
    let p: any = {};
    try {
      p = JSON.parse(payloadJson || "{}");
    } catch (e) {
      await _hostLog(`JSON parse error: ${String(e)}`);
    }
    
    if (!app || !app.project) {
      return _respond({ ok: false, error: "No project" });
    }
    
    const sequence = app.project.activeSequence;
    if (!sequence) {
      return _respond({ ok: false, error: "No active sequence" });
    }
    
    const codec = String(p.codec || "h264");
    const presetPath = await _pickVideoPresetPath(codec);
    
    if (!presetPath) {
      return _respond({ ok: false, error: `Preset not found for ${codec}`, eprRoot: _eprRoot() });
    }
    
    // Verify preset file exists
    try {
      const presetFile = await fs.getFileForReading(presetPath);
      if (!(await presetFile.exists())) {
        return _respond({ ok: false, error: "Preset path missing", preset: presetPath });
      }
    } catch (e) {
      return _respond({ ok: false, error: `Preset path invalid: ${String(e)}`, preset: presetPath });
    }
    
    // Get export extension
    let ext = "";
    try {
      ext = String(sequence.getExportFileExtension ? sequence.getExportFileExtension(presetPath) : "") || "";
    } catch (e) {
      // Ignore
    }
    
    if (!ext) {
      ext = codec === "h264" ? ".mp4" : ".mov";
    }
    
    const out = await _getTempPath(ext.replace(/^\./, ""));
    if (!out) {
      return _respond({ ok: false, error: "Temp path failed" });
    }
    
    const finalOut = out.toLowerCase().indexOf(ext.toLowerCase()) === -1 
      ? out.replace(/\.[^\.]+$/, "") + ext 
      : out;
    
    // Export using sequence API
    let ok = false;
    try {
      if (sequence.exportAsMediaDirect) {
        ok = sequence.exportAsMediaDirect(finalOut, presetPath, 1);
      } else {
        return _respond({ ok: false, error: "exportAsMediaDirect not available" });
      }
    } catch (e) {
      return _respond({ ok: false, error: `exportAsMediaDirect failed: ${String(e)}`, out: finalOut });
    }
    
    if (!ok) {
      return _respond({ ok: false, error: "exportAsMediaDirect returned false", out: finalOut });
    }
    
    // Wait for export to complete
    const done = await _waitForFile(finalOut, 180000);
    if (!done) {
      return _respond({ ok: false, error: "Export timeout", out: finalOut });
    }
    
    // Check file size
    try {
      const outFile = await fs.getFileForReading(finalOut);
      const stat = await outFile.stat();
      if (stat.size > 1024 * 1024 * 1024) {
        try {
          await outFile.delete();
        } catch (_) {
          // Ignore
        }
        return _respond({ ok: false, error: "File size exceeds 1GB limit. Please use shorter in/out points or lower quality settings." });
      }
    } catch (e) {
      // Ignore
    }
    
    return _respond({ ok: true, path: finalOut, preset: presetPath });
  } catch (e) {
    await _hostLog(`PPRO_exportInOutVideo error: ${String(e)}`);
    return _respond({ ok: false, error: String(e) });
  }
}

export async function PPRO_exportInOutAudio(payloadJson: string) {
  try {
    await _hostLog(`PPRO_exportInOutAudio called`);
    
    let p: any = {};
    try {
      p = JSON.parse(payloadJson || "{}");
    } catch (e) {
      await _hostLog(`JSON parse error: ${String(e)}`);
    }
    
    if (!app || !app.project) {
      return _respond({ ok: false, error: "No project" });
    }
    
    const sequence = app.project.activeSequence;
    if (!sequence) {
      return _respond({ ok: false, error: "No active sequence" });
    }
    
    const format = String(p.format || "wav");
    const presetPath = await _pickAudioPresetPath(format);
    
    if (!presetPath) {
      return _respond({ ok: false, error: `Preset not found for ${format}`, eprRoot: _eprRoot() });
    }
    
    // Verify preset file exists
    try {
      const presetFile = await fs.getFileForReading(presetPath);
      if (!(await presetFile.exists())) {
        return _respond({ ok: false, error: "Preset path missing", preset: presetPath });
      }
    } catch (e) {
      return _respond({ ok: false, error: `Preset path invalid: ${String(e)}`, preset: presetPath });
    }
    
    // Get export extension
    let ext = "";
    try {
      ext = String(sequence.getExportFileExtension ? sequence.getExportFileExtension(presetPath) : "") || "";
    } catch (e) {
      // Ignore
    }
    
    if (!ext) {
      ext = format === "mp3" ? ".mp3" : ".wav";
    }
    
    const out = await _getTempPath(ext.replace(/^\./, ""));
    if (!out) {
      return _respond({ ok: false, error: "Temp path failed" });
    }
    
    const finalOut = out.toLowerCase().indexOf(ext.toLowerCase()) === -1 
      ? out.replace(/\.[^\.]+$/, "") + ext 
      : out;
    
    // Export using sequence API
    let ok = false;
    try {
      if (sequence.exportAsMediaDirect) {
        ok = sequence.exportAsMediaDirect(finalOut, presetPath, 1);
      } else {
        return _respond({ ok: false, error: "exportAsMediaDirect not available" });
      }
    } catch (e) {
      return _respond({ ok: false, error: `exportAsMediaDirect failed: ${String(e)}`, out: finalOut });
    }
    
    if (!ok) {
      return _respond({ ok: false, error: "exportAsMediaDirect returned false", out: finalOut });
    }
    
    // Wait for export to complete
    const done = await _waitForFile(finalOut, 180000);
    if (!done) {
      return _respond({ ok: false, error: "Export timeout", out: finalOut });
    }
    
    // Check file size
    try {
      const outFile = await fs.getFileForReading(finalOut);
      const stat = await outFile.stat();
      if (stat.size > 1024 * 1024 * 1024) {
        try {
          await outFile.delete();
        } catch (_) {
          // Ignore
        }
        return _respond({ ok: false, error: "File size exceeds 1GB limit. Please use shorter in/out points or lower quality settings." });
      }
    } catch (e) {
      // Ignore
    }
    
    return _respond({ ok: true, path: finalOut, preset: presetPath });
  } catch (e) {
    await _hostLog(`PPRO_exportInOutAudio error: ${String(e)}`);
    return _respond({ ok: false, error: String(e) });
  }
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
  try {
    const info: any = { ok: true };
    
    try {
      info.extRoot = _extensionRoot();
    } catch (e) {
      info.extRootError = String(e);
    }
    
    try {
      info.eprRoot = _eprRoot();
    } catch (e) {
      info.eprRootError = String(e);
    }
    
    let seq = null;
    try {
      if (app && app.project) {
        seq = app.project.activeSequence;
      }
    } catch (e) {
      info.activeSequenceError = String(e);
    }
    
    info.hasActiveSequence = !!seq;
    info.hasExportAsMediaDirect = !!(seq && typeof seq.exportAsMediaDirect === "function");
    
    try {
      if (seq && typeof seq.getInPoint === "function") {
        const ip = seq.getInPoint();
        info.inTicks = ip ? ip.ticks : 0;
      }
    } catch (e) {
      info.inError = String(e);
    }
    
    try {
      if (seq && typeof seq.getOutPoint === "function") {
        const op = seq.getOutPoint();
        info.outTicks = op ? op.ticks : 0;
      }
    } catch (e) {
      info.outError = String(e);
    }
    
    try {
      const root = info.eprRoot || "";
      const files = root ? await _listEprRec(root, 1) : [];
      info.eprCount = files.length;
      info.firstEpr = files.length && files[0] && files[0].nativePath ? files[0].nativePath : "";
    } catch (e) {
      info.eprListError = String(e);
    }
    
    return _respond(info);
  } catch (e) {
    return _respond({ ok: false, error: String(e) });
  }
}

// Thumbnail support functions
export async function PPRO_ensureDir(dirPath: string) {
  try {
    const folder = await fs.getFolderForReading(dirPath);
    if (!(await folder.exists())) {
      await folder.create();
    }
    return _respond({ ok: await folder.exists() });
  } catch (e) {
    return _respond({ ok: false, error: String(e) });
  }
}

export async function PPRO_fileExists(filePath: string) {
  try {
    const file = await fs.getFileForReading(filePath);
    return _respond({ ok: true, exists: await file.exists() });
  } catch (e) {
    return _respond({ ok: false, error: String(e) });
  }
}

export async function PPRO_readThumbnail(filePath: string) {
  try {
    const file = await fs.getFileForReading(filePath);
    if (!(await file.exists())) {
      return _respond({ ok: false, error: "File does not exist" });
    }
    
    const data = await file.read();
    
    // Convert to base64
    const base64 = btoa(data);
    const dataUrl = "data:image/jpeg;base64," + base64;
    
    return _respond({ ok: true, dataUrl: dataUrl });
  } catch (e) {
    return _respond({ ok: false, error: String(e) });
  }
}

export async function PPRO_saveThumbnail(payload: string) {
  try {
    let data: any = {};
    try {
      data = JSON.parse(payload);
    } catch (e) {
      return _respond({ ok: false, error: `JSON parse failed: ${String(e)}` });
    }
    
    const path = data.path;
    const dataUrl = data.dataUrl;
    
    if (!path || !dataUrl) {
      return _respond({ ok: false, error: "Missing path or dataUrl" });
    }
    
    // Extract base64 data from data URL
    const base64Data = dataUrl.split(",")[1];
    if (!base64Data) {
      return _respond({ ok: false, error: "Invalid data URL format" });
    }
    
    // Decode base64 and write to file
    const file = await fs.getFileForWriting(path);
    const binaryData = atob(base64Data);
    await file.write(binaryData);
    
    // Verify file was created
    if (!(await file.exists())) {
      return _respond({ ok: false, error: "File was not created" });
    }
    
    return _respond({ ok: true, path: path });
  } catch (e) {
    return _respond({ ok: false, error: String(e) });
  }
}
