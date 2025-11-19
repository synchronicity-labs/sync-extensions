// UXP Host Script for After Effects
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
    
    try {
      const flagFile = await fs.getFileForReading(dir + (isWindows ? "\\" : "/") + ".debug");
      if (!(await flagFile.exists())) {
        return "";
      }
    } catch (_) {
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
      try {
        const logFile = await fs.getFileForWriting(logPath);
        await logFile.write(logLine, { append: true });
      } catch (_) {
        // Silently fail
      }
    }
  } catch (e) {
    // Silently fail
  }
}

function _extensionRoot(): string {
  try {
    const pluginFolder = require("uxp").storage.localFileSystem.getPluginFolder();
    return pluginFolder?.nativePath || "";
  } catch (e) {
    return "";
  }
}

async function _waitForFileReady(filePath: string, timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  let lastSize = -1;
  let stable = 0;
  
  while (Date.now() - start < (timeoutMs || 20000)) {
    try {
      const file = await fs.getFileForReading(filePath);
      if (await file.exists()) {
        const stat = await file.stat();
        const sz = stat.size;
        if (sz > 0) {
          if (sz === lastSize) {
            stable++;
            if (stable > 2) return true;
          } else {
            lastSize = sz;
            stable = 0;
          }
        }
      }
    } catch (e) {
      // Ignore
    }
    
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  try {
    const file = await fs.getFileForReading(filePath);
    return await file.exists();
  } catch (e) {
    return false;
  }
}

async function _safeOutDir(): Promise<string> {
  try {
    const d = await SYNC_getBaseDirs();
    if (d && d.uploads) return d.uploads;
  } catch (_) {}
  
  try {
    const ext = _extensionRoot();
    if (ext) {
      const dir1 = await fs.getFolderForReading(ext + "/server/.cache");
      if (!(await dir1.exists())) {
        await dir1.create();
      }
      return dir1.nativePath;
    }
  } catch (_) {}
  
  try {
    const temp = await fs.getTemporaryFolder();
    return temp.nativePath;
  } catch (_) {}
  
  return "";
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
    
    try {
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
    } catch (e) {
      // User cancelled or error
    }
    
    await _hostLog("No file selected or file doesn't exist");
    return _respond({ ok: false, error: "No file selected" });
  } catch (e) {
    await _hostLog(`AEFT_showFileDialog error: ${String(e)}`);
    return _respond({ ok: false, error: String(e) });
  }
}

export async function AEFT_exportInOutVideo(payloadJson: string) {
  try {
    await _hostLog(`AEFT_exportInOutVideo called`);
    
    let p: any = {};
    try {
      p = JSON.parse(payloadJson || "{}");
    } catch (e) {
      await _hostLog(`JSON parse error: ${String(e)}`);
    }
    
    if (!app || !app.project) {
      return _respond({ ok: false, error: "No project" });
    }
    
    const comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) {
      await _hostLog("AEFT_exportInOutVideo: No active composition");
      return _respond({ ok: false, error: "No active composition" });
    }
    
    const rq = app.project.renderQueue;
    try {
      rq.items.clear();
    } catch (_) {
      // Ignore
    }
    
    const item = rq.items.add(comp);
    try {
      item.applyTemplate("Best Settings");
    } catch (_) {
      // Ignore
    }
    
    // Set time span based on work area
    const __start = (comp.displayStartTime || 0) + (comp.workAreaStart || 0);
    try {
      item.timeSpanStart = __start;
    } catch (_) {
      // Ignore
    }
    try {
      item.timeSpanDuration = comp.workAreaDuration;
    } catch (_) {
      // Ignore
    }
    
    const want = String(p.codec || "h264").toLowerCase();
    const om = item.outputModule(1);
    
    // If H.264 selected, render directly to mp4
    if (want === "h264") {
      const h264T = [
        "H.264 - Match Render Settings - 15 Mbps",
        "H.264 - Match Render Settings - 5 Mbps",
        "H.264 - Match Render Settings - 40 Mbps",
        "H.264",
      ];
      let applied = "";
      
      for (const template of h264T) {
        try {
          om.applyTemplate(template);
          applied = template;
          break;
        } catch (_) {
          // Try next
        }
      }
      
      if (!applied) {
        try {
          om.applyTemplate("Lossless");
        } catch (_) {
          // Ignore
        }
      }
      
      const uploadsDir = await SYNC_getUploadsDir();
      const mp4Path = uploadsDir + "/sync_inout_" + Date.now() + ".mp4";
      const mp4File = await fs.getFileForWriting(mp4Path);
      
      try {
        om.file = mp4File;
      } catch (_) {
        // Ignore
      }
      
      try {
        rq.render();
      } catch (eRender) {
        return _respond({ ok: false, error: `Render failed: ${String(eRender)}` });
      }
      
      // Wait for render to complete
      let waited = 0;
      while (waited < 180000) {
        try {
          const file = await fs.getFileForReading(mp4Path);
          if (await file.exists()) {
            const stat = await file.stat();
            if (stat.size > 0) {
              // Check render queue status
              if (rq && rq.numItems > 0 && rq.item(1)) {
                const status = rq.item(1).status;
                if (status === 6) break; // DONE
                if (status === 5 || status === 4) {
                  return _respond({ ok: false, error: "Render failed" });
                }
              } else {
                break;
              }
            }
          }
        } catch (_) {
          // Ignore
        }
        
        await new Promise(resolve => setTimeout(resolve, 200));
        waited += 200;
      }
      
      const mp4 = await fs.getFileForReading(mp4Path);
      if (!(await mp4.exists())) {
        return _respond({ ok: false, error: "Render timeout" });
      }
      
      // Check file size
      const stat = await mp4.stat();
      if (stat.size > 1024 * 1024 * 1024) {
        try {
          await mp4.delete();
        } catch (_) {
          // Ignore
        }
        return _respond({ ok: false, error: "File size exceeds 1GB limit. Please use shorter in/out points or lower quality settings." });
      }
      
      return _respond({ ok: true, path: mp4Path, note: "AE H.264 direct" });
    }
    
    // Otherwise render ProRes 4444
    let appliedHQ = "";
    try {
      om.applyTemplate("High Quality with Alpha");
      appliedHQ = "High Quality with Alpha";
    } catch (_) {
      try {
        om.applyTemplate("Lossless");
        appliedHQ = "Lossless";
      } catch (_) {
        // Ignore
      }
    }
    
    const uploadsDir = await SYNC_getUploadsDir();
    const srcMovPath = uploadsDir + "/sync_inout_" + Date.now() + ".mov";
    const srcMovFile = await fs.getFileForWriting(srcMovPath);
    
    try {
      om.file = srcMovFile;
    } catch (_) {
      // Ignore
    }
    
    try {
      rq.render();
    } catch (eRender2) {
      return _respond({ ok: false, error: `Render failed: ${String(eRender2)}` });
    }
    
    // Wait for render to complete
    let waited2 = 0;
    while (waited2 < 180000) {
      try {
        const file = await fs.getFileForReading(srcMovPath);
        if (await file.exists()) {
          const stat = await file.stat();
          if (stat.size > 0) {
            if (rq && rq.numItems > 0 && rq.item(1)) {
              const status = rq.item(1).status;
              if (status === 6) break; // DONE
              if (status === 5 || status === 4) {
                return _respond({ ok: false, error: "Render failed" });
              }
            } else {
              break;
            }
          }
        }
      } catch (_) {
        // Ignore
      }
      
      await new Promise(resolve => setTimeout(resolve, 200));
      waited2 += 200;
    }
    
    const srcMov = await fs.getFileForReading(srcMovPath);
    if (!(await srcMov.exists())) {
      return _respond({ ok: false, error: "Render timeout (src)" });
    }
    
    // Check file size
    const stat = await srcMov.stat();
    if (stat.size > 1024 * 1024 * 1024) {
      try {
        await srcMov.delete();
      } catch (_) {
        // Ignore
      }
      return _respond({ ok: false, error: "File size exceeds 1GB limit. Please use shorter in/out points or lower quality settings." });
    }
    
    return _respond({ ok: true, path: srcMovPath, note: "prores render completed" });
  } catch (e) {
    await _hostLog(`AEFT_exportInOutVideo error: ${String(e)}`);
    return _respond({ ok: false, error: String(e) });
  }
}

export async function AEFT_exportInOutAudio(payloadJson: string) {
  try {
    await _hostLog(`AEFT_exportInOutAudio called`);
    
    let p: any = {};
    try {
      p = JSON.parse(payloadJson || "{}");
    } catch (e) {
      await _hostLog(`JSON parse error: ${String(e)}`);
    }
    
    if (!app || !app.project) {
      return _respond({ ok: false, error: "No project" });
    }
    
    const comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) {
      await _hostLog("AEFT_exportInOutAudio: No active composition");
      return _respond({ ok: false, error: "No active composition" });
    }
    
    const rq = app.project.renderQueue;
    try {
      rq.items.clear();
    } catch (_) {
      // Ignore
    }
    
    const item = rq.items.add(comp);
    try {
      item.applyTemplate("Best Settings");
    } catch (_) {
      // Ignore
    }
    
    // Set time span based on work area
    const __astart = (comp.displayStartTime || 0) + (comp.workAreaStart || 0);
    try {
      item.timeSpanStart = __astart;
    } catch (_) {
      // Ignore
    }
    try {
      item.timeSpanDuration = comp.workAreaDuration;
    } catch (_) {
      // Ignore
    }
    
    const om = item.outputModule(1);
    let applied = "";
    try {
      om.applyTemplate("AIFF 48kHz");
      applied = "AIFF 48kHz";
    } catch (_) {
      try {
        om.applyTemplate("Sound Only");
        applied = "Sound Only";
      } catch (_) {
        // Ignore
      }
    }
    
    const outDir = await _safeOutDir();
    const aifPath = outDir + "/sync_inout_audio_src_" + Date.now() + ".aif";
    const aifFile = await fs.getFileForWriting(aifPath);
    
    try {
      om.file = aifFile;
    } catch (_) {
      // Ignore
    }
    
    await _hostLog(`starting audio render to: ${aifPath}`);
    
    try {
      rq.render();
      await _hostLog("render() call completed");
    } catch (eRender) {
      await _hostLog(`render error: ${String(eRender)}`);
      return _respond({ ok: false, error: `Render failed: ${String(eRender)}` });
    }
    
    // Wait for render to complete
    let waited = 0;
    while (waited < 180000) {
      try {
        const file = await fs.getFileForReading(aifPath);
        if (await file.exists()) {
          const stat = await file.stat();
          if (stat.size > 0) {
            if (rq && rq.numItems > 0 && rq.item(1)) {
              const status = rq.item(1).status;
              if (status === 6) break; // DONE
              if (status === 5 || status === 4) {
                await _hostLog(`render failed with status: ${status}`);
                return _respond({ ok: false, error: "Render failed" });
              }
            } else {
              break;
            }
          }
        }
      } catch (_) {
        // Ignore
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
      waited += 500;
    }
    
    const aif = await fs.getFileForReading(aifPath);
    if (!(await aif.exists())) {
      return _respond({ ok: false, error: "Render timeout (audio)" });
    }
    
    // Convert AIFF to requested format using server
    const want = String(p.format || "wav").toLowerCase();
    
    if (want === "mp3" || want === "wav") {
      // Use server-side conversion
      const stat = await aif.stat();
      await _hostLog(`aif=${aifPath} len=${stat.size}`);
      
      try {
        // Call server conversion endpoint
        const response = await fetch(
          `http://127.0.0.1:3000/audio/convert?format=${want}&srcPath=${encodeURIComponent(aifPath)}`
        );
        
        if (!response.ok) {
          throw new Error(`Server conversion failed: ${response.statusText}`);
        }
        
        const result = await response.json();
        if (result.ok && result.path) {
          const outputPath = outDir + "/sync_inout_audio_" + Date.now() + "." + want;
          const serverFile = await fs.getFileForReading(result.path);
          const outputFile = await fs.getFileForWriting(outputPath);
          
          if (await serverFile.exists()) {
            const serverData = await serverFile.read();
            await outputFile.write(serverData);
            
            // Wait for file to be ready
            await _waitForFileReady(outputPath, 10000);
            
            const outputStat = await outputFile.stat();
            if (outputStat.size > 1024 * 1024 * 1024) {
              try {
                await outputFile.delete();
              } catch (_) {
                // Ignore
              }
              return _respond({ ok: false, error: "File size exceeds 1GB limit. Please use shorter in/out points or lower quality settings." });
            }
            
            try {
              await aif.delete();
            } catch (_) {
              // Ignore
            }
            
            return _respond({ ok: true, path: outputPath, note: `server convert ${want}` });
          }
        } else {
          throw new Error(result.error || "Server conversion failed");
        }
      } catch (e) {
        await _hostLog(`server convert error: ${String(e)}`);
        return _respond({ ok: false, error: `Audio conversion failed: ${String(e)}` });
      }
    }
    
    return _respond({ ok: false, error: "Audio conversion failed. Please check server logs and try again." });
  } catch (e) {
    await _hostLog(`AEFT_exportInOutAudio error: ${String(e)}`);
    return _respond({ ok: false, error: String(e) });
  }
}

export async function AEFT_insertAtPlayhead(jobId: string) {
  try {
    await _hostLog(`AEFT_insertAtPlayhead called with jobId: ${jobId}`);
    
    const uploadsDir = await SYNC_getUploadsDir();
    const outputPath = uploadsDir + "/" + jobId + "_output.mp4";
    
    const outputFile = await fs.getFileForReading(outputPath);
    if (!(await outputFile.exists())) {
      return _respond({ ok: false, error: `Output file not found: ${outputPath}` });
    }
    
    // Wait for file to be ready
    await _waitForFileReady(outputPath, 20000);
    
    try {
      if (app && app.beginUndoGroup) {
        app.beginUndoGroup("sync. import");
      }
      
      // Find existing or import the file
      let imported = null;
      
      if (app && app.project && app.project.items) {
        const items = app.project.items;
        const n = items ? items.length : 0;
        
        for (let i = 1; i <= n; i++) {
          const it = items[i];
          try {
            if (it && it instanceof FootageItem && it.file && it.file.nativePath === outputPath) {
              imported = it;
              break;
            }
          } catch (_) {
            // Ignore
          }
        }
      }
      
      // Import if not found
      if (!imported && app && app.project) {
        try {
          const io = new ImportOptions(outputFile);
          if (io && io.canImportAs && io.canImportAs(ImportAsType.FOOTAGE)) {
            io.importAs = ImportAsType.FOOTAGE;
          }
          imported = app.project.importFile ? app.project.importFile(io) : null;
        } catch (e) {
          await _hostLog(`Import error: ${String(e)}`);
        }
      }
      
      if (!imported) {
        if (app && app.endUndoGroup) {
          app.endUndoGroup();
        }
        return _respond({ ok: false, error: "Import failed" });
      }
      
      // Ensure/locate "sync. outputs" folder
      let outputsFolder = null;
      try {
        if (app && app.project && app.project.items) {
          const items = app.project.items;
          const n = items ? items.length : 0;
          
          for (let i = 1; i <= n; i++) {
            const it = items[i];
            if (it && (it instanceof FolderItem) && String(it.name) === "sync. outputs") {
              outputsFolder = it;
              break;
            }
          }
          
          if (!outputsFolder) {
            outputsFolder = app.project.items.addFolder("sync. outputs");
          }
        }
      } catch (_) {
        // Ignore
      }
      
      try {
        if (outputsFolder && imported && imported.parentFolder !== outputsFolder) {
          imported.parentFolder = outputsFolder;
        }
      } catch (_) {
        // Ignore
      }
      
      // Insert as a new layer in the active comp at playhead
      const comp = app.project.activeItem;
      if (!comp || !(comp instanceof CompItem)) {
        if (app && app.endUndoGroup) {
          app.endUndoGroup();
        }
        return _respond({ ok: false, error: "No active composition" });
      }
      
      let before = 0;
      try {
        before = comp.layers ? comp.layers.length : 0;
      } catch (_) {
        // Ignore
      }
      
      let layer = null;
      try {
        layer = comp.layers.add(imported);
      } catch (eAdd) {
        layer = null;
        await _hostLog(`Layer add error: ${String(eAdd)}`);
      }
      
      if (!layer) {
        if (app && app.endUndoGroup) {
          app.endUndoGroup();
        }
        return _respond({ ok: false, error: "Layer add failed" });
      }
      
      try {
        layer.startTime = comp.time;
      } catch (_) {
        // Ignore
      }
      
      let after = 0;
      try {
        after = comp.layers ? comp.layers.length : 0;
      } catch (_) {
        // Ignore
      }
      
      if (app && app.endUndoGroup) {
        app.endUndoGroup();
      }
      
      if (after > before) {
        return _respond({ ok: true, mode: "insert", layerName: (layer && layer.name) || "" });
      }
      
      return _respond({ ok: false, error: "Insert verification failed" });
    } catch (e) {
      if (app && app.endUndoGroup) {
        app.endUndoGroup();
      }
      await _hostLog(`AEFT_insertAtPlayhead error: ${String(e)}`);
      return _respond({ ok: false, error: String(e) });
    }
  } catch (e) {
    await _hostLog(`AEFT_insertAtPlayhead outer error: ${String(e)}`);
    return _respond({ ok: false, error: String(e) });
  }
}

export async function AEFT_insertFileAtPlayhead(payloadOrJson: string) {
  try {
    await _hostLog(`AEFT_insertFileAtPlayhead called`);
    
    let p: any = {};
    let path = "";
    
    try {
      if (payloadOrJson && typeof payloadOrJson === "string" && (payloadOrJson.charAt(0) === "{" || payloadOrJson.charAt(0) === '"')) {
        p = JSON.parse(payloadOrJson || "{}");
        path = String(p.path || "");
      }
    } catch (_) {
      // Ignore
    }
    
    if (!path) {
      path = String(payloadOrJson || "");
    }
    
    if (!path) {
      return _respond({ ok: false, error: "No path" });
    }
    
    const f = await fs.getFileForReading(path);
    if (!(await f.exists())) {
      return _respond({ ok: false, error: "File not found" });
    }
    
    // Wait for file to be ready
    await _waitForFileReady(path, 20000);
    
    try {
      if (app && app.beginUndoGroup) {
        app.beginUndoGroup("sync. import");
      }
      
      // Find existing or import the file
      let imported = null;
      
      if (app && app.project && app.project.items) {
        const items = app.project.items;
        const n = items ? items.length : 0;
        
        for (let i = 1; i <= n; i++) {
          const it = items[i];
          try {
            if (it && it instanceof FootageItem && it.file && it.file.nativePath === path) {
              imported = it;
              break;
            }
          } catch (_) {
            // Ignore
          }
        }
      }
      
      // Import if not found
      if (!imported && app && app.project) {
        try {
          const io = new ImportOptions(f);
          if (io && io.canImportAs && io.canImportAs(ImportAsType.FOOTAGE)) {
            io.importAs = ImportAsType.FOOTAGE;
          }
          imported = app.project.importFile ? app.project.importFile(io) : null;
        } catch (e) {
          await _hostLog(`Import error: ${String(e)}`);
        }
      }
      
      if (!imported) {
        if (app && app.endUndoGroup) {
          app.endUndoGroup();
        }
        return _respond({ ok: false, error: "Import failed" });
      }
      
      // Ensure/locate "sync. outputs" folder
      let outputsFolder = null;
      try {
        if (app && app.project && app.project.items) {
          const items = app.project.items;
          const n = items ? items.length : 0;
          
          for (let i = 1; i <= n; i++) {
            const it = items[i];
            if (it && (it instanceof FolderItem) && String(it.name) === "sync. outputs") {
              outputsFolder = it;
              break;
            }
          }
          
          if (!outputsFolder) {
            outputsFolder = app.project.items.addFolder("sync. outputs");
          }
        }
      } catch (_) {
        // Ignore
      }
      
      try {
        if (outputsFolder && imported && imported.parentFolder !== outputsFolder) {
          imported.parentFolder = outputsFolder;
        }
      } catch (_) {
        // Ignore
      }
      
      // Insert as a new layer in the active comp at playhead
      const comp = app.project.activeItem;
      if (!comp || !(comp instanceof CompItem)) {
        if (app && app.endUndoGroup) {
          app.endUndoGroup();
        }
        return _respond({ ok: false, error: "No active composition" });
      }
      
      let before = 0;
      try {
        before = comp.layers ? comp.layers.length : 0;
      } catch (_) {
        // Ignore
      }
      
      let layer = null;
      try {
        layer = comp.layers.add(imported);
      } catch (eAdd) {
        layer = null;
      }
      
      if (!layer) {
        if (app && app.endUndoGroup) {
          app.endUndoGroup();
        }
        return _respond({ ok: false, error: "Layer add failed" });
      }
      
      try {
        layer.startTime = comp.time;
      } catch (_) {
        // Ignore
      }
      
      let after = 0;
      try {
        after = comp.layers ? comp.layers.length : 0;
      } catch (_) {
        // Ignore
      }
      
      if (app && app.endUndoGroup) {
        app.endUndoGroup();
      }
      
      if (after > before) {
        return _respond({ ok: true, mode: "insert", layerName: (layer && layer.name) || "" });
      }
      
      return _respond({ ok: false, error: "Insert verification failed" });
    } catch (e) {
      if (app && app.endUndoGroup) {
        app.endUndoGroup();
      }
      await _hostLog(`AEFT_insertFileAtPlayhead error: ${String(e)}`);
      return _respond({ ok: false, error: String(e) });
    }
  } catch (e) {
    await _hostLog(`AEFT_insertFileAtPlayhead outer error: ${String(e)}`);
    return _respond({ ok: false, error: String(e) });
  }
}

export async function AEFT_importFileToBin(payloadOrJson: string) {
  try {
    await _hostLog(`AEFT_importFileToBin: START`);
    
    // Guard: Check if app and project exist
    if (!app || !app.project) {
      await _hostLog("AEFT_importFileToBin: No project open");
      return _respond({ ok: false, error: "No project open" });
    }
    
    if (!app.project.items) {
      await _hostLog("AEFT_importFileToBin: No project items");
      return _respond({ ok: false, error: "No project items" });
    }
    
    // Normalize inputs
    let p: any = {};
    let path = "";
    let binName = "sync. outputs";
    
    try {
      if (payloadOrJson && typeof payloadOrJson === "string" && (payloadOrJson.charAt(0) === "{" || payloadOrJson.charAt(0) === '"')) {
        p = JSON.parse(payloadOrJson || "{}");
        path = String(p.path || "");
        if (p && p.binName) {
          binName = String(p.binName);
        }
      }
    } catch (_) {
      // Ignore
    }
    
    if (!path) {
      path = String(payloadOrJson || "");
    }
    
    if (!path) {
      await _hostLog("AEFT_importFileToBin: No path provided");
      return _respond({ ok: false, error: "No path" });
    }
    
    const f = await fs.getFileForReading(path);
    if (!(await f.exists())) {
      await _hostLog(`AEFT_importFileToBin: File not found at ${path}`);
      return _respond({ ok: false, error: "File not found" });
    }
    
    await _hostLog(`AEFT_importFileToBin: File exists at ${f.nativePath}`);
    
    // Wait for file to be ready
    await _waitForFileReady(path, 20000);
    
    // Extended file readiness check
    let extendedWait = 0;
    while (extendedWait < 2000) {
      try {
        const stat = await f.stat();
        if (stat.size > 0) break;
      } catch (_) {
        // Ignore
      }
      await new Promise(resolve => setTimeout(resolve, 200));
      extendedWait += 200;
    }
    
    if (!(await f.exists())) {
      await _hostLog("AEFT_importFileToBin: File disappeared after wait");
      return _respond({ ok: false, error: "File disappeared after wait" });
    }
    
    try {
      if (app && app.beginUndoGroup) {
        app.beginUndoGroup("sync. import");
      }
      
      let imported = null;
      let reusedExisting = false;
      
      // Check if file is already imported
      try {
        const items = app.project.items;
        const n = items ? items.length : 0;
        
        for (let i = 1; i <= n; i++) {
          const it = items[i];
          try {
            if (it && it instanceof FootageItem && it.file && it.file.nativePath === path) {
              imported = it;
              reusedExisting = true;
              await _hostLog(`AEFT_importFileToBin: Reused existing item: ${it.name}`);
              break;
            }
          } catch (_) {
            // Ignore
          }
        }
      } catch (_) {
        // Ignore
      }
      
      // Import if not already in project
      if (!imported) {
        await _hostLog(`AEFT_importFileToBin: Attempting import for ${f.nativePath}`);
        
        try {
          const io = new ImportOptions(f);
          if (io && io.canImportAs && io.canImportAs(ImportAsType.FOOTAGE)) {
            io.importAs = ImportAsType.FOOTAGE;
          }
          imported = app.project.importFile ? app.project.importFile(io) : null;
          await _hostLog(`AEFT_importFileToBin: importFile returned ${imported ? "item" : "null"}`);
        } catch (importErr) {
          await _hostLog(`AEFT_importFileToBin: importFile error: ${String(importErr)}`);
          imported = null;
        }
        
        // Fallback: try importFiles method
        if (!imported) {
          await _hostLog("AEFT_importFileToBin: Trying importFiles fallback");
          try {
            const itemsBefore = app.project.items ? app.project.items.length : 0;
            app.project.importFiles([f.nativePath], false, false, false);
            await _hostLog("AEFT_importFileToBin: importFiles completed, searching for item");
            await new Promise(resolve => setTimeout(resolve, 200));
            
            const items3 = app.project.items;
            const n3 = items3 ? items3.length : 0;
            
            for (let k = 1; k <= n3; k++) {
              const it3 = items3[k];
              try {
                if (it3 && it3 instanceof FootageItem && it3.file && it3.file.nativePath === path) {
                  imported = it3;
                  await _hostLog(`AEFT_importFileToBin: Found imported item by path: ${it3.name}`);
                  break;
                }
              } catch (_) {
                // Ignore
              }
            }
            
            if (!imported && n3 > itemsBefore) {
              await _hostLog("AEFT_importFileToBin: Searching for newest item");
              for (let m = n3; m > itemsBefore; m--) {
                const newItem = items3[m];
                try {
                  if (newItem && newItem instanceof FootageItem) {
                    imported = newItem;
                    await _hostLog(`AEFT_importFileToBin: Found new item: ${newItem.name}`);
                    break;
                  }
                } catch (_) {
                  // Ignore
                }
              }
            }
            
            if (!imported) {
              await _hostLog("AEFT_importFileToBin: Could not find imported item after importFiles");
            }
          } catch (importFilesErr) {
            await _hostLog(`AEFT_importFileToBin: importFiles error: ${String(importFilesErr)}`);
            imported = null;
          }
        }
      }
      
      if (!imported) {
        if (app && app.endUndoGroup) {
          app.endUndoGroup();
        }
        await _hostLog("AEFT_importFileToBin: Import failed - both methods");
        return _respond({ ok: false, error: "Import failed" });
      }
      
      // Find or create target bin
      let target = null;
      try {
        const items2 = app.project.items;
        const n2 = items2 ? items2.length : 0;
        
        for (let j = 1; j <= n2; j++) {
          const it2 = items2[j];
          if (it2 && (it2 instanceof FolderItem) && String(it2.name) === binName) {
            target = it2;
            await _hostLog(`AEFT_importFileToBin: Found existing bin: ${binName}`);
            break;
          }
        }
        
        if (!target) {
          target = app.project.items.addFolder(binName);
          await _hostLog(`AEFT_importFileToBin: Created new bin: ${binName}`);
        }
      } catch (binErr) {
        await _hostLog(`AEFT_importFileToBin: Bin error: ${String(binErr)}`);
        target = null;
      }
      
      // Move item to target bin
      let moved = false;
      if (target && imported) {
        await _hostLog(`AEFT_importFileToBin: Attempting to move ${imported.name} to ${target.name}`);
        
        for (let mv = 0; mv < 10; mv++) {
          try {
            imported.parentFolder = target;
            await _hostLog(`AEFT_importFileToBin: Set parentFolder on attempt ${mv + 1}`);
          } catch (moveErr) {
            await _hostLog(`AEFT_importFileToBin: Move error on attempt ${mv + 1}: ${String(moveErr)}`);
          }
          
          await new Promise(resolve => setTimeout(resolve, 100));
          
          try {
            if (imported && imported.parentFolder === target) {
              moved = true;
              await _hostLog(`AEFT_importFileToBin: Move verified on attempt ${mv + 1}`);
              break;
            }
          } catch (_) {
            // Ignore
          }
        }
        
        if (!moved) {
          await _hostLog("AEFT_importFileToBin: Failed to verify move after 10 attempts");
        }
      }
      
      if (app && app.endUndoGroup) {
        app.endUndoGroup();
      }
      
      // Return detailed success info
      const result = {
        ok: true,
        imported: true,
        reused: reusedExisting,
        binName: binName,
        itemName: (imported && imported.name) || "",
        moved: moved,
      };
      
      await _hostLog(`AEFT_importFileToBin: SUCCESS - ${JSON.stringify(result)}`);
      return _respond(result);
    } catch (e) {
      if (app && app.endUndoGroup) {
        app.endUndoGroup();
      }
      await _hostLog(`AEFT_importFileToBin: Exception - ${String(e)}`);
      return _respond({ ok: false, error: String(e) });
    }
  } catch (e) {
    await _hostLog(`AEFT_importFileToBin: Outer exception - ${String(e)}`);
    return _respond({ ok: false, error: String(e) });
  }
}

export async function AEFT_revealFile(payloadJson: string) {
  try {
    let p: any = {};
    try {
      p = JSON.parse(payloadJson || "{}");
    } catch (e) {}
    
    const path = String(p.path || p || "");
    if (!path) {
      return _respond({ ok: false, error: "No path" });
    }
    
    const f = await fs.getFileForReading(path);
    if (!(await f.exists())) {
      return _respond({ ok: false, error: "File not found" });
    }
    
    // UXP doesn't have a direct reveal API
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
  try {
    const info: any = { ok: true, host: "AEFT" };
    
    try {
      info.projectOpen = !!(app && app.project);
    } catch (e) {
      info.projectOpen = false;
      info.error = String(e);
    }
    
    await _hostLog(`AEFT_diagInOut called`);
    await _hostLog(`projectOpen: ${String(info.projectOpen)}`);
    await _hostLog(`app exists: ${String(!!app)}`);
    await _hostLog(`app.project exists: ${String(!!(app && app.project))}`);
    
    return _respond(info);
  } catch (e) {
    return _respond({ ok: false, error: String(e) });
  }
}

// Thumbnail support functions
export async function AEFT_ensureDir(dirPath: string) {
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

export async function AEFT_fileExists(filePath: string) {
  try {
    const file = await fs.getFileForReading(filePath);
    return _respond({ ok: true, exists: await file.exists() });
  } catch (e) {
    return _respond({ ok: false, error: String(e) });
  }
}

export async function AEFT_readThumbnail(filePath: string) {
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

export async function AEFT_saveThumbnail(payload: string) {
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
