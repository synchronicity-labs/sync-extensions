// Safe system caller across environments
function _callSystem(cmd) {
  try {
    if (typeof System !== 'undefined' && System.callSystem) {
      return System.callSystem(cmd);
    }
  } catch(e) { /* fallthrough */ }
  try {
    if (typeof system !== 'undefined' && system.callSystem) {
      return system.callSystem(cmd);
    }
  } catch(e2) { /* ignore */ }
  // Return non-zero exit code if system call is not available
  return -1;
}
function SYNC_getBaseDirs(){
  try{
    var isWindows = false; try { isWindows = ($.os && $.os.toString().indexOf('Windows') !== -1); } catch(_){ isWindows = false; }
    var root = Folder.userData.fsName;
    var base = new Folder(root + (isWindows ? "\\sync. extensions" : "/sync. extensions"));
    if (!base.exists) { try{ base.create(); }catch(_){ } }
    function ensure(name){ var f = new Folder(base.fsName + (isWindows ? ('\\' + name) : ('/' + name))); if(!f.exists){ try{ f.create(); }catch(_){ } } return f.fsName; }
    return { base: base.fsName, logs: ensure('logs'), cache: ensure('cache'), state: ensure('state'), uploads: ensure('uploads'), updates: ensure('updates') };
  }catch(e){ try{ return { base: Folder.userData.fsName, logs: Folder.userData.fsName, cache: Folder.userData.fsName, state: Folder.userData.fsName, uploads: Folder.userData.fsName, updates: Folder.userData.fsName }; }catch(_){ return { base:'', logs:'', cache:'', state:'', uploads:'', updates:'' }; } }
}
function SYNC_getLogDir(){ try{ return SYNC_getBaseDirs().logs; }catch(_){ return ''; } }
function SYNC_getUploadsDir(){ try{ return SYNC_getBaseDirs().uploads; }catch(_){ return ''; } }
function _pproDebugLogPath(){
  try{
    var isWindows=false; try{ isWindows = ($.os && $.os.toString().indexOf('Windows') !== -1); }catch(_){ isWindows=false; }
    var dir=SYNC_getLogDir(); if(!dir){ dir = Folder.temp.fsName; }
    // Respect debug flag file in logs (no UI toggle / env required)
    try{
      var flag = new File(dir + (isWindows?'\\':'/') + '.debug');
      var enabled = false;
      try{ enabled = flag && flag.exists; }catch(_){ enabled = false; }
      if (!enabled) { return ''; }
    }catch(_){ }
    return dir + (isWindows?'\\':'/') + 'sync_ppro_debug.log';
  }catch(e){ try{ return Folder.temp.fsName + '/sync_ppro_debug.log'; }catch(_){ return 'sync_ppro_debug.log'; } }
}
function _pproDebugLogFile(){ try{ return new File(_pproDebugLogPath()); }catch(e){ try{ return new File(Folder.temp.fsName + '/sync_ppro_debug.log'); }catch(_){ return new File('sync_ppro_debug.log'); } } }

// Auto-start is now handled by ui/nle.js

var __showDialogBusy = false;

// Polyfill String.trim() for ExtendScript (must be before JSON.parse)
if (typeof String.prototype.trim !== 'function') {
  String.prototype.trim = function() {
    return this.replace(/^\s+|\s+$/g, '');
  };
}

// Minimal JSON polyfill for ExtendScript environments lacking JSON
try {
  if (typeof JSON === 'undefined') { JSON = {}; }
  // Check if native JSON.parse exists - if so, use it (more reliable than polyfill)
  if (typeof JSON.parse === 'function') {
    // Native JSON.parse exists - keep it, but ensure trim polyfill is available
    // The polyfill above should handle trim if needed
  }
  if (typeof JSON.stringify !== 'function') {
    JSON.stringify = function(value){
      function escStr(s){ return String(s).replace(/[\\"\n\r\t\b\f]/g, function(ch){
        if (ch === '"') return '\\"';
        if (ch === '\\') return '\\\\';
        if (ch === '\n') return '\\n';
        if (ch === '\r') return '\\r';
        if (ch === '\t') return '\\t';
        if (ch === '\b') return '\\b';
        if (ch === '\f') return '\\f';
        return ch;
      }); }
      function ser(v){
        if (v === null) return 'null';
        var t = typeof v;
        if (t === 'string') return '"' + escStr(v) + '"';
        if (t === 'number' || t === 'boolean') return String(v);
        if (t === 'undefined') return 'null';
        if (v instanceof Array) {
          var arr = [];
          for (var i=0;i<v.length;i++){ arr.push(ser(v[i])); }
          return '[' + arr.join(',') + ']';
        }
        var props = [];
        for (var k in v) {
          if (!v.hasOwnProperty(k)) continue;
          props.push('"' + escStr(k) + '":' + ser(v[k]));
        }
        return '{' + props.join(',') + '}';
      }
      return ser(value);
    };
  }
  if (typeof JSON.parse !== 'function') {
    // Use eval() as JSON parser - simpler and more reliable than polyfill for ExtendScript
    JSON.parse = function(text){
      try {
        // eval() can safely parse JSON in ExtendScript
        return eval('(' + String(text || '') + ')');
      } catch(e) {
        throw new Error('JSON parse error: ' + String(e));
      }
    };
  } else {
    // Native JSON.parse exists - test if it works, if not use eval fallback
    try {
      JSON.parse('{"test":true}');
    } catch(e) {
      // Native JSON.parse exists but doesn't work - use eval fallback
      var nativeParse = JSON.parse;
      JSON.parse = function(text) {
        try {
          return nativeParse(text);
        } catch(e1) {
          try {
            return eval('(' + String(text || '') + ')');
          } catch(e2) {
            throw new Error('JSON parse failed: ' + String(e1));
          }
        }
      };
    }
  }
} catch(e) { /* ignore */ }

export function PPRO_showFileDialog(payloadJson) {
  try {
    if (__showDialogBusy) { try{ _hostLog('PPRO_showFileDialog busy'); }catch(_){} return _respond({ ok:false, error:'busy' }); }
    __showDialogBusy = true;
    _hostLog('PPRO_showFileDialog invoked');
    var p = {};
    try { p = JSON.parse(payloadJson); } catch(e) {}
    var kind = p.kind || 'video';
    var allow = (kind === 'audio')
      ? { wav:1, mp3:1 }
      : { mov:1, mp4:1 };

    var file = null;
    try {
      if ($.os && $.os.toString().indexOf('Windows') !== -1) {
        // Windows can honor filter strings
        var filterStr = (kind === 'audio')
          ? 'Audio files:*.wav;*.mp3'
          : 'Video files:*.mov;*.mp4';
        file = File.openDialog('Select ' + kind + ' file', filterStr);
      } else {
        // macOS: use function filter to hide non-matching files
        var fn = function(f){
          try {
            if (f instanceof Folder) return true;
            var n = (f && f.name) ? String(f.name).toLowerCase() : '';
            var i = n.lastIndexOf('.');
            if (i < 0) return false;
            var ext = n.substring(i+1);
            return allow[ext] === 1;
          } catch (e) { return true; }
        };
        file = File.openDialog('Select ' + kind + ' file', fn);
      }
    } catch (_) {}

    if (file && file.exists) {
      try {
        var n = String(file.name || '').toLowerCase();
        var i = n.lastIndexOf('.');
        var ext = (i >= 0) ? n.substring(i+1) : '';
        if (allow[ext] !== 1) { return _respond({ ok:false, error:'Invalid file type' }); }
      } catch(e) {}
      
      // Check file size - reject if over 1GB
      var fileSize = 0;
      try {
        if (file && file.length) {
          fileSize = file.length;
        }
      } catch(e) {}
      if (fileSize > 1024 * 1024 * 1024) {
        try { _hostLog('PPRO_showFileDialog rejected: file size exceeds 1GB (' + String(fileSize) + ' bytes)'); } catch(_){ }
        return _respond({ ok:false, error:'File size exceeds 1GB limit' });
      }
      
      try { _hostLog('PPRO_showFileDialog selected: ' + file.fsName); } catch(_){ }
      return _respond({ ok: true, path: file.fsName });
    }
    try { _hostLog('PPRO_showFileDialog canceled'); } catch(_){ }
    return _respond({ ok: false, error: 'No file selected' });
  } catch(e) {
    return _respond({ ok: false, error: String(e) });
  } finally {
    __showDialogBusy = false;
  }
}

function _hostLog(msg){
  try{
    var s = String(msg||'');
    var timestamp = new Date().toISOString();
    var logLine = `[${timestamp}] [ppro] ${s}\n`;
    
    try {
      var logFile = _pproDebugLogFile();
      logFile.open('a');
      logFile.write(logLine);
      logFile.close();
    } catch(_){ }
  }catch(e){ }
}

export function PPRO_insertAtPlayhead(jobId) {
  try {
    var extPath = _extensionRoot();
    var outputPath = SYNC_getUploadsDir() + "/" + jobId + "_output.mp4";
    var outputFile = new File(outputPath);
    
    try {
      var logFile = _pproDebugLogFile();
      logFile.open("a");
      logFile.writeln("[" + new Date().toString() + "] PPRO_insertAtPlayhead called with jobId: " + jobId);
      logFile.writeln("[" + new Date().toString() + "] Output path: " + outputPath);
      logFile.writeln("[" + new Date().toString() + "] File exists: " + outputFile.exists);
      logFile.close();
    } catch(e){ try { var log = _pproDebugLogFile(); log.open("a"); log.writeln("[" + new Date().toString() + "] catch: " + String(e)); log.close(); } catch(_){} }
    
    if (outputFile.exists) {
      var project = app.project;
      if (project) {
        var sequence = project.activeSequence;
        if (sequence) {
          var projectItem = project.importFiles([outputFile.fsName], true, project.getInsertionBin(), false);
          if (projectItem && projectItem.length > 0) {
            sequence.videoTracks[0].clips.insert(projectItem[0], sequence.getPlayerPosition().seconds);
            return _respond({ ok: true, message: "Inserted at playhead" });
          }
        }
      }
      return _respond({ ok: false, error: "No active sequence" });
    } else {
      return _respond({ ok: false, error: "Output file not found" });
    }
  } catch(e) {
    return _respond({ ok: false, error: String(e) });
  }
}

export function PPRO_insertFileAtPlayhead(payloadJson) {
  try {
    var p = {}; try { p = JSON.parse(payloadJson||'{}'); } catch(e){ try { var log = _pproDebugLogFile(); log.open("a"); log.writeln("[" + new Date().toString() + "] catch: " + String(e)); log.close(); } catch(_){} }
    var fsPath = String((p && (p.path||p)) || '');
    var file = new File(fsPath);
    
    try {
      var logFile = _pproDebugLogFile();
      logFile.open("a");
      logFile.writeln("[" + new Date().toString() + "] PPRO_insertFileAtPlayhead called");
      logFile.writeln("[" + new Date().toString() + "] Payload: " + String(payloadJson));
      logFile.writeln("[" + new Date().toString() + "] Parsed path: " + fsPath);
      logFile.writeln("[" + new Date().toString() + "] File exists: " + file.exists);
      logFile.close();
    } catch(e){ try { var log = _pproDebugLogFile(); log.open("a"); log.writeln("[" + new Date().toString() + "] catch: " + String(e)); log.close(); } catch(_){} }
    
    if (!file.exists) return _respond({ ok:false, error:'File not found' });

    var project = app.project;
    if (!project) return _respond({ ok:false, error:'No project' });
    var sequence = project.activeSequence;
    if (!sequence) return _respond({ ok:false, error:'No active sequence' });

    // Ensure destination bin exists
    var root = project.rootItem;
    var targetBin = null;
    for (var i=0; i<root.children.numItems; i++) {
      var it = root.children[i];
      if (it && it.type === 2 && it.name === 'sync. outputs') { targetBin = it; break; }
    }
    if (!targetBin) {
      try { targetBin = root.createBin('sync. outputs'); } catch(e) { /* ignore */ }
    }
    if (!targetBin) return _respond({ ok:false, error:'Bin not found' });

    // Find or import project item
    var projItem = null;
    for (var j=targetBin.children.numItems-1; j>=0; j--) {
      var child = targetBin.children[j];
      try {
        if (child && typeof child.getMediaPath === 'function') {
          var mp = child.getMediaPath();
          if (mp && mp === file.fsName) { projItem = child; break; }
        }
      } catch(e) { /* ignore */ }
      if (!projItem && child && child.name === file.name) { projItem = child; break; }
    }
    if (!projItem) {
      try {
        project.importFiles([file.fsName], true, targetBin, false);
        for (var k=targetBin.children.numItems-1; k>=0; k--) {
          var c = targetBin.children[k];
          try { if (c && typeof c.getMediaPath === 'function' && c.getMediaPath() === file.fsName) { projItem = c; break; } } catch(e) { }
          if (!projItem && c && c.name === file.name) { projItem = c; break; }
        }
      } catch(e) { /* ignore */ }
    }
    if (!projItem) return _respond({ ok:false, error:'Import failed' });

    var pos = sequence.getPlayerPosition();

    // Choose targeted video track if available
    var vIndex = 0;
    try {
      var vCount = sequence.videoTracks ? sequence.videoTracks.numTracks : 0;
      for (var vi=0; vi<vCount; vi++) {
        try { if (sequence.videoTracks[vi] && typeof sequence.videoTracks[vi].isTargeted === 'function' && sequence.videoTracks[vi].isTargeted()) { vIndex = vi; break; } } catch(e) {}
      }
    } catch(e) {}

    // Overwrite at playhead rather than ripple insert
    try {
      var t = sequence.videoTracks[vIndex];
      var beforeCount = (t && t.clips) ? t.clips.numItems : 0;
      t.overwriteClip(projItem, pos.ticks);
      // Some APIs may throw despite success; verify visually by checking overlap
      var success = false;
      try{
        if (t && t.clips && t.clips.numItems >= beforeCount){
          for (var ix=0; ix<t.clips.numItems; ix++){
            var cc = t.clips[ix];
            var st = cc.start.ticks; var en = cc.end.ticks;
            if (st <= pos.ticks && en > pos.ticks) { success = true; break; }
          }
        }
      }catch(e){}
      if (success) return _respond({ ok:true, videoTrack:vIndex, mode:'overwrite' });
    } catch (e1) {
      // ignore and try fallback
    }
    // Do not use ripple insert fallback to avoid duplicate placements
    return _respond({ ok:false, error:'overwrite failed' });
  } catch (e) {
    return _respond({ ok:false, error:String(e) });
  }
}

export function PPRO_importIntoBin(jobId) {
  try {
    var extPath = _extensionRoot();
    var outputPath = SYNC_getUploadsDir() + "/" + jobId + "_output.mp4";
    var outputFile = new File(outputPath);
    
    try {
      var logFile = _pproDebugLogFile();
      logFile.open("a");
      logFile.writeln("[" + new Date().toString() + "] PPRO_importIntoBin called with jobId: " + jobId);
      logFile.writeln("[" + new Date().toString() + "] Output path: " + outputPath);
      logFile.writeln("[" + new Date().toString() + "] File exists: " + outputFile.exists);
      logFile.close();
    } catch(e){ try { var log = _pproDebugLogFile(); log.open("a"); log.writeln("[" + new Date().toString() + "] catch: " + String(e)); log.close(); } catch(_){} }
    
    if (outputFile.exists) {
      var project = app.project;
      if (project) {
        var projectItem = project.importFiles([outputFile.fsName], true, project.getInsertionBin(), false);
        if (projectItem && projectItem.length > 0) {
          return _respond({ ok: true, message: "Added to project bin" });
        }
      }
      return _respond({ ok: false, error: "Failed to import file" });
    } else {
      return _respond({ ok: false, error: "Output file not found" });
    }
  } catch(e) {
    return _respond({ ok: false, error: String(e) });
  }
}

export function PPRO_getProjectDir() {
  try {
    if (app && app.project && app.project.path) {
      var projPath = app.project.path;
      if (projPath) {
        var f = new File(projPath);
        var parent = f.parent;
        if (parent && parent.exists) {
          var outFolder = new Folder(parent.fsName + "/sync. outputs");
          if (!outFolder.exists) { outFolder.create(); }
          return _respond({ ok: true, projectDir: parent.fsName, outputDir: outFolder.fsName });
        }
      }
    }
    return _respond({ ok: false, error: 'No project open' });
  } catch (e) {
    return _respond({ ok: false, error: String(e) });
  }
}

export function PPRO_importFileToBin(payloadJson) {
  try {
    var p = {}; try { p = JSON.parse(payloadJson||'{}'); } catch(e){ try { var log = _pproDebugLogFile(); log.open("a"); log.writeln("[" + new Date().toString() + "] catch: " + String(e)); log.close(); } catch(_){} }
    var fsPath = String(p.path||'');
    var binName = String(p.binName||'');
    
    try {
      var logFile = _pproDebugLogFile();
      logFile.open("a");
      logFile.writeln("[" + new Date().toString() + "] PPRO_importFileToBin called");
      logFile.writeln("[" + new Date().toString() + "] Payload: " + String(payloadJson));
      logFile.writeln("[" + new Date().toString() + "] Parsed path: " + fsPath);
      logFile.writeln("[" + new Date().toString() + "] Bin name: " + binName);
      logFile.close();
    } catch(e){ try { var log = _pproDebugLogFile(); log.open("a"); log.writeln("[" + new Date().toString() + "] catch: " + String(e)); log.close(); } catch(_){} }
    
    var project = app.project;
    if (!project) return _respond({ ok:false, error:'No project' });
    var targetBin = project.getInsertionBin();
    if (binName) {
      // Try to find/create bin with given name at root
      var root = project.rootItem;
      var found = null;
      for (var i=0; i<root.children.numItems; i++) {
        var item = root.children[i];
        if (item && item.name === binName && item.type === 2) { found = item; break; }
      }
      if (!found) {
        found = root.createBin(binName);
      }
      if (found) { targetBin = found; }
    }
    var results = null;
    try { results = project.importFiles([fsPath], true, targetBin, false); } catch(e) { results = null; }
    // Some Premiere versions do not return an array even when import succeeds; verify by scanning target bin
    if (!results || !results.length) {
      try {
        var name = '';
        try { var f = new File(fsPath); name = f && f.name ? f.name : ''; } catch(_){ }
        for (var k = targetBin.children.numItems - 1; k >= 0; k--) {
          var c = targetBin.children[k];
          try {
            if (c && typeof c.getMediaPath === 'function') {
              var mp = c.getMediaPath();
              if (mp && mp === fsPath) { return _respond({ ok:true, reused:true }); }
            }
            if (c && name && c.name === name) { return _respond({ ok:true, byName:true }); }
          } catch(_){ }
        }
      } catch(_){ }
    } else {
      // Array returned and non-empty
      return _respond({ ok:true });
    }
    return _respond({ ok:false, error:'Import verification failed' });
  } catch (e) {
    return _respond({ ok:false, error:String(e) });
  }
}

export function PPRO_revealFile(payloadJson) {
  try {
    var p = {}; try { p = JSON.parse(payloadJson||'{}'); } catch(e){}
    var fsPath = String((p && (p.path||p)) || '');
    var f = new File(fsPath);
    if (!f.exists) return _respond({ ok:false, error:'File not found' });
    var isWindows = false; try { isWindows = ($.os && $.os.toString().indexOf('Windows') !== -1); } catch(_){ isWindows = false; }
    if (isWindows) {
      var cmd = 'cmd.exe /c explorer.exe /select,"' + String(f.fsName||'').replace(/"/g,'\"') + '"';
      System.callSystem(cmd);
      return _respond({ ok:true });
    } else {
      // macOS: reveal in Finder
      var esc = String(f.fsName||'').replace(/\\/g, "\\\\").replace(/\"/g, "\\\"");
      var cmd2 = "/usr/bin/osascript -e 'tell application " + '"Finder"' + " to reveal POSIX file \"" + esc + "\"' -e 'tell application " + '"Finder"' + " to activate'";
      System.callSystem(cmd2);
      return _respond({ ok:true });
    }
  } catch (e) {
    return _respond({ ok:false, error:String(e) });
  }
}

function _extensionRoot() {
  try {
    // Method 1: Derive from this script path: <ext>/host/ppro.jsx → <ext>
    var here = new File($.fileName);
    if (here && here.exists) {
      var hostDir = here.parent; // /host
      if (hostDir) {
        var extDir = hostDir.parent; // extension root
        if (extDir && extDir.exists) { return extDir.fsName; }
      }
    }
  } catch(e) {}
  
  try {
    // Method 2: Use CEP API to get extension path
    var extPath = $.eval('cs.getSystemPath(cs.SystemPath.EXTENSION)');
    if (extPath) return extPath;
  } catch(e) {}
  
  try {
    // Method 3: Check both user and system-wide locations
    var userHome = Folder.userDocuments.parent.fsName;
    var isWindows = false; 
    try { isWindows = ($.os && $.os.toString().indexOf('Windows') !== -1); } catch(_){ isWindows = false; }
    
    var userPath, systemPath;
    if (isWindows) {
      userPath = userHome + "\\AppData\\Roaming\\Adobe\\CEP\\extensions\\com.sync.extension";
      systemPath = "C:\\Program Files\\Adobe\\CEP\\extensions\\com.sync.extension";
    } else {
      userPath = userHome + "/Library/Application Support/Adobe/CEP/extensions/com.sync.extension";
      systemPath = "/Library/Application Support/Adobe/CEP/extensions/com.sync.extension";
    }
    
    // Check user location first
    var userExt = new File(userPath);
    if (userExt && userExt.exists) return userPath;
    
    // Check system location
    var systemExt = new File(systemPath);
    if (systemExt && systemExt.exists) return systemPath;
    
    // Fallback to user location (for development)
    return userPath;
  } catch(e2) {}
  return '';
}

function _respond(data) {
  return JSON.stringify(data);
}

// _diagSequenceState removed (unused)

function _listFilesRec(folder, depth){
  var out = [];
  try{
    if (!folder || !(folder instanceof Folder) || !folder.exists) return out;
    var items = folder.getFiles();
    for (var i=0; i<items.length; i++){
      var it = items[i];
      try{
        if (it instanceof File) { out.push(it); }
        else if (it instanceof Folder && depth > 0) { var sub = _listFilesRec(it, depth-1); for (var j=0;j<sub.length;j++){ out.push(sub[j]); } }
      }catch(e){}
    }
  }catch(e){}
  return out;
}

function _findPresetByName(namePart){
  var want = String(namePart||'').toLowerCase();
  var dirs = [];
  try{
    // Adobe Media Encoder system/user preset locations (macOS)
    dirs.push(new Folder('/Library/Application Support/Adobe/Adobe Media Encoder')); // will recurse versions
    dirs.push(new Folder('~/Library/Application Support/Adobe/Adobe Media Encoder'));
    dirs.push(new Folder('~/Documents/Adobe/Adobe Media Encoder'));
    // Premiere app bundle presets (some installs include EPRs here)
    var candidates = ['2025','2024','2023','2022'];
    for (var ci=0; ci<candidates.length; ci++){
      var base = new Folder('/Applications/Adobe Media Encoder ' + candidates[ci] + '/Adobe Media Encoder ' + candidates[ci] + '.app/Contents/EncoderPresets');
      dirs.push(base);
      var base2 = new Folder('/Applications/Adobe Premiere Pro ' + candidates[ci] + '/Adobe Premiere Pro ' + candidates[ci] + '.app/Contents/Settings/EncoderPresets');
      dirs.push(base2);
    }
    // Extension-bundled presets (if any)
    try{
      var extPath = _extensionRoot();
      dirs.push(new Folder(extPath + '/presets'));
    }catch(e){}
  }catch(e){}

  for (var di=0; di<dirs.length; di++){
    var d = dirs[di];
    try{
      var files = _listFilesRec(d, 3);
      for (var fi=0; fi<files.length; fi++){
        var f = files[fi];
        try{
          if (!(f instanceof File)) continue;
          var nm = String(f.name||'').toLowerCase();
          if (nm.indexOf('.epr') === -1) continue;
          if (nm.indexOf(want) !== -1) { return f.fsName; }
        }catch(e){}
      }
    }catch(e){}
  }
  return '';
}

function _findPresetForCodec(codec){
  var c = String(codec||'h264').toLowerCase();
  var aliases = [];
  if (c === 'h264') aliases = ['match source - high bitrate', 'match source – high bitrate', 'adaptive high bitrate', 'h.264'];
  else if (c === 'prores_422') aliases = ['apple prores 422', 'prores 422'];
  else aliases = [c];
  for (var i=0;i<aliases.length;i++){ var p = _findPresetByName(aliases[i]); if (p) return p; }
  return '';
}

function _findPresetForAudio(format){
  var f = String(format||'wav').toLowerCase();
  var aliases = [];
  if (f === 'wav') aliases = ['waveform audio', 'wav'];
  else if (f === 'mp3') aliases = ['mp3'];
  else aliases = [f];
  for (var i=0;i<aliases.length;i++){ var p = _findPresetByName(aliases[i]); if (p) return p; }
  return '';
}

function _getTempPath(ext){
  try{
    // Always use global Application Support folder for temp files (same as AE)
    var root = Folder.userData.fsName; // ~/Library/Application Support on macOS
    var uploadsFolder = new Folder(root + '/sync. extensions/uploads');
    if (!uploadsFolder.exists) { try { if (!uploadsFolder.create()) { return ''; } } catch(e){ return ''; } }
    
    var f = new File(uploadsFolder.fsName + '/inout_' + (new Date().getTime()) + '_' + Math.floor(Math.random()*10000) + '.' + ext);
    return f && f.fsName ? f.fsName : '';
  }catch(e){ return ''; }
}

function _waitForFile(path, ms){
  var start = (new Date()).getTime();
  var lastSize = -1; var stableCount = 0;
  while (((new Date()).getTime() - start) < (ms||120000)){
    try {
      var f = new File(path);
      if (f.exists){
        try{ f.open('r'); f.seek(0,2); var sz = f.length; f.close(); }catch(e){ var sz = f.length; }
        if (sz > 0){
          if (sz === lastSize){ stableCount++; if (stableCount > 3) return true; }
          else { lastSize = sz; stableCount = 0; }
        }
      }
    } catch(e) {}
    $.sleep(500);
  }
  return false;
}

export function PPRO_pickPreset(payloadJson){
  try{
    var p = {}; try{ p = JSON.parse(payloadJson||'{}'); }catch(e){}
    var file = File.openDialog('Select AME preset (.epr)', function(f){ try{ return (f instanceof File) && String(f.name||'').toLowerCase().indexOf('.epr') !== -1; }catch(e){ return true; } });
    if (file && file.exists) return _respond({ ok:true, path: file.fsName });
    return _respond({ ok:false, error:'No preset selected' });
  }catch(e){ return _respond({ ok:false, error:String(e) }); }
}

function _eprRoot(){ 
  try{ 
    var extRoot = _extensionRoot();
    if(!extRoot) return '';
    // vite-cep-plugin copies EPR files to js/panels/ppro/epr (preserving path structure)
    // Check both locations for backward compatibility: js/panels/ppro/epr (actual) and /epr (legacy)
    var actualPath = extRoot + '/js/panels/ppro/epr';
    var legacyPath = extRoot + '/epr';
    var actualFolder = new Folder(actualPath);
    var legacyFolder = new Folder(legacyPath);
    if(actualFolder.exists) return actualPath;
    if(legacyFolder.exists) return legacyPath;
    // Fallback to actual path even if it doesn't exist yet (for development)
    return actualPath;
  }catch(e){ return ''; } 
}
function _listEprRec(folder, depth){ var out=[]; try{ var f=new Folder(folder); if(!f.exists) return out; var items=f.getFiles(); for(var i=0;i<items.length;i++){ var it=items[i]; try{ if(it instanceof File && String(it.name||'').toLowerCase().indexOf('.epr')!==-1){ out.push(it); } else if (it instanceof Folder && depth>0){ var sub=_listEprRec(it.fsName, depth-1); for(var j=0;j<sub.length;j++){ out.push(sub[j]); } } }catch(e){} } }catch(e){} return out; }
function _findEprByKeywords(kind, prefers){
  try{
    var root=_eprRoot(); if(!root) return '';
    var files=_listEprRec(root, 3);
    if(!files.length) return '';
    // Score files by keyword hits in name
    function score(name){ var s=0; var nm=String(name||'').toLowerCase(); for(var i=0;i<prefers.length;i++){ if(nm.indexOf(prefers[i])!==-1) s+=10; } return s; }
    var best=null; var bestScore=-1;
    for(var i=0;i<files.length;i++){ var f=files[i]; var sc=score(f.name); if(sc>bestScore){ best=f; bestScore=sc; } }
    return best ? best.fsName : '';
  }catch(e){ return ''; }
}
function _pickVideoPresetPath(codec){
  var c=String(codec||'h264').toLowerCase();
  var root=_eprRoot(); if(!root) return '';
  function join(name){ return _normPath(root + '/' + name); }
  // Prefer exact filenames we ship; fallback to keyword search
  if(c==='h264'){
    var p1=join('Match Source - Adaptive High Bitrate.epr'); if (File(p1).exists) return p1;
    var p2=join('Match Source - High Bitrate.epr'); if (File(p2).exists) return p2;
    var kw=_findEprByKeywords('video', ['match source','adaptive','high bitrate','h.264','h264']); if(kw) return kw;
  }
  if(c==='prores_422'){
    var p=join('ProRes 422.epr'); if (File(p).exists) return p;
    var kw2=_findEprByKeywords('video', ['prores 422','prores','422']); if(kw2) return kw2;
  }
  if(c==='prores_422_proxy'){
    var p3=join('ProRes 422 Proxy.epr'); if (File(p3).exists) return p3;
    var kw3=_findEprByKeywords('video', ['prores 422 proxy','proxy']); if(kw3) return kw3;
  }
  if(c==='prores_422_lt'){
    var p4=join('ProRes 422 LT.epr'); if (File(p4).exists) return p4;
    var kw4=_findEprByKeywords('video', ['prores 422 lt','lt']); if(kw4) return kw4;
  }
  if(c==='prores_422_hq'){
    var p5=join('ProRes 422 HQ.epr'); if (File(p5).exists) return p5;
    var kw5=_findEprByKeywords('video', ['prores 422 hq','hq']); if(kw5) return kw5;
  }
  return '';
}
function _pickAudioPresetPath(format){
  var f=String(format||'wav').toLowerCase();
  if(f==='wav'){
    var p=_findEprByKeywords('audio', ['wav','waveform']); if(p) return p;
  }
  if(f==='mp3'){
    var p2=_findEprByKeywords('audio', ['mp3','320']); if(p2) return p2;
  }
  return '';
}

export function PPRO_exportInOutVideo(payloadJson){
  try{
    var p={}; try{ p=JSON.parse(payloadJson||'{}'); }catch(e){ try { var log = _pproDebugLogFile(); log.open("a"); log.writeln("[" + new Date().toString() + "] catch: " + String(e)); log.close(); } catch(_){} }
    
    try {
      var logFile = _pproDebugLogFile();
      logFile.open("a");
      logFile.writeln("[" + new Date().toString() + "] PPRO_exportInOutVideo called");
      logFile.writeln("[" + new Date().toString() + "] Payload: " + String(payloadJson));
      logFile.close();
    } catch(e){ try { var log = _pproDebugLogFile(); log.open("a"); log.writeln("[" + new Date().toString() + "] catch: " + String(e)); log.close(); } catch(_){} }
    
    var seq=app.project.activeSequence; if(!seq) return _respond({ ok:false, error:'No active sequence' });
    var codec=String(p.codec||'h264');
    var eprRoot = _eprRoot();
    var presetPath = _pickVideoPresetPath(codec);
    if(!presetPath) {
      var debugInfo = { codec: codec, eprRoot: eprRoot, extRoot: _extensionRoot() };
      try {
        if(eprRoot) {
          var testFolder = new Folder(eprRoot);
          debugInfo.eprRootExists = testFolder.exists;
          if(testFolder.exists) {
            var files = _listEprRec(eprRoot, 1);
            debugInfo.eprFilesFound = files.length;
            debugInfo.eprFileNames = files.map(function(f){ return f.name; });
          }
        }
      } catch(e) { debugInfo.eprCheckError = String(e); }
      return _respond({ ok:false, error:'Preset not found in /epr for '+codec, debug: debugInfo });
    }
    try { var pf = new File(presetPath); if (!pf || !pf.exists) { return _respond({ ok:false, error:'Preset path missing', preset:presetPath }); } } catch(e) { return _respond({ ok:false, error:'Preset path invalid: '+String(e), preset:presetPath }); }
    var ext=''; try{ ext = String(seq.getExportFileExtension(presetPath)||''); }catch(e){ try { var log = _pproDebugLogFile(); log.open("a"); log.writeln("[" + new Date().toString() + "] catch: " + String(e)); log.close(); } catch(_){} }
    if(!ext) ext = (codec==='h264')?'.mp4':'.mov';
    var out = _getTempPath(ext.replace(/^\./,'')); if(!out) return _respond({ ok:false, error:'Temp path failed' });
    if (String(out).toLowerCase().indexOf(ext.toLowerCase()) === -1) { out = out.replace(/\.[^\.]+$/, '') + ext; }

    var ok=false; try{ ok = seq.exportAsMediaDirect(out, presetPath, 1); }catch(e){ return _respond({ ok:false, error:'exportAsMediaDirect failed: '+String(e), out: out }); }
    if(!ok) return _respond({ ok:false, error:'exportAsMediaDirect returned false', out: out });
    var done = _waitForFile(out, 180000);
    if(!done) return _respond({ ok:false, error:'Export timeout', out: out });
    
    // Check file size - reject if over 1GB
    var fileSize = 0;
    try {
      var outFile = new File(out);
      if (outFile && outFile.exists) {
        fileSize = outFile.length;
      }
    } catch(e){ }
    if (fileSize > 1024 * 1024 * 1024) {
      try {
        var outFile = new File(out);
        if (outFile && outFile.exists) {
          outFile.remove();
        }
      } catch(_){ }
      return _respond({ ok:false, error:'File size exceeds 1GB limit. Please use shorter in/out points or lower quality settings.' });
    }
    
    return _respond({ ok:true, path: out, preset: presetPath });
  }catch(e){ return _respond({ ok:false, error:String(e) }); }
}

export function PPRO_exportInOutAudio(payloadJson){
  try{
    var p={}; try{ p=JSON.parse(payloadJson||'{}'); }catch(e){ try { var log = _pproDebugLogFile(); log.open("a"); log.writeln("[" + new Date().toString() + "] catch: " + String(e)); log.close(); } catch(_){} }
    
    try {
      var logFile = _pproDebugLogFile();
      logFile.open("a");
      logFile.writeln("[" + new Date().toString() + "] PPRO_exportInOutAudio called");
      logFile.writeln("[" + new Date().toString() + "] Payload: " + String(payloadJson));
      logFile.close();
    } catch(e){ try { var log = _pproDebugLogFile(); log.open("a"); log.writeln("[" + new Date().toString() + "] catch: " + String(e)); log.close(); } catch(_){} }
    
    var seq=app.project.activeSequence; if(!seq) return _respond({ ok:false, error:'No active sequence' });
    var format=String(p.format||'wav');
    var presetPath = _pickAudioPresetPath(format);
    if(!presetPath) return _respond({ ok:false, error:'Preset not found in /epr for '+format, eprRoot:_eprRoot() });
    try { var pf = new File(presetPath); if (!pf || !pf.exists) { return _respond({ ok:false, error:'Preset path missing', preset:presetPath }); } } catch(e) { return _respond({ ok:false, error:'Preset path invalid: '+String(e), preset:presetPath }); }
    var ext=''; try{ ext = String(seq.getExportFileExtension(presetPath)||''); }catch(e){ try { var log = _pproDebugLogFile(); log.open("a"); log.writeln("[" + new Date().toString() + "] catch: " + String(e)); log.close(); } catch(_){} }
    if(!ext) ext = (format==='mp3')?'.mp3':'.wav';
    var out = _getTempPath(ext.replace(/^\./,'')); if(!out) return _respond({ ok:false, error:'Temp path failed' });
    if (String(out).toLowerCase().indexOf(ext.toLowerCase()) === -1) { out = out.replace(/\.[^\.]+$/, '') + ext; }

    var ok=false; try{ ok = seq.exportAsMediaDirect(out, presetPath, 1); }catch(e){ return _respond({ ok:false, error:'exportAsMediaDirect failed: '+String(e), out: out }); }
    if(!ok) return _respond({ ok:false, error:'exportAsMediaDirect returned false', out: out });
    var done = _waitForFile(out, 180000);
    if(!done) return _respond({ ok:false, error:'Export timeout', out: out });
    
    // Check file size - reject if over 1GB
    var fileSize = 0;
    try {
      var outFile = new File(out);
      if (outFile && outFile.exists) {
        fileSize = outFile.length;
      }
    } catch(e){ }
    if (fileSize > 1024 * 1024 * 1024) {
      try {
        var outFile = new File(out);
        if (outFile && outFile.exists) {
          outFile.remove();
        }
      } catch(_){ }
      return _respond({ ok:false, error:'File size exceeds 1GB limit. Please use shorter in/out points or lower quality settings.' });
    }
    
    return _respond({ ok:true, path: out, preset: presetPath });
  }catch(e){ return _respond({ ok:false, error:String(e) }); }
}

export function PPRO_diagInOut(payloadJson){
  try{
    var info = { ok:true };
    try { info.extRoot = _extensionRoot(); } catch(e) { info.extRootError = String(e); }
    try { info.eprRoot = _eprRoot(); } catch(e) { info.eprRootError = String(e); }
    var seq = null;
    try { seq = app.project.activeSequence; } catch(e){ info.activeSequenceError = String(e); }
    info.hasActiveSequence = !!seq;
    info.hasExportAsMediaDirect = !!(seq && typeof seq.exportAsMediaDirect === 'function');
    try {
      app.enableQE();
      info.qeActive = !!(qe && qe.project && qe.project.getActiveSequence());
    } catch(e) { info.qeError = String(e); }
    try {
      if (seq && typeof seq.getInPoint === 'function') { var ip = seq.getInPoint(); info.inTicks = ip ? ip.ticks : 0; }
    } catch(e) { info.inError = String(e); }
    try {
      if (seq && typeof seq.getOutPoint === 'function') { var op = seq.getOutPoint(); info.outTicks = op ? op.ticks : 0; }
    } catch(e) { info.outError = String(e); }
    try {
      var root = info.eprRoot || '';
      var files = root ? _listEprRec(root, 1) : [];
      info.eprCount = files.length;
      info.firstEpr = (files.length && files[0] && files[0].fsName) ? files[0].fsName : '';
    } catch(e){ info.eprListError = String(e); }
    return _respond(info);
  }catch(e){ return _respond({ ok:false, error:String(e) }); }
}

function _normPath(p){
  try {
    var f = new File(p);
    return f && f.fsName ? f.fsName : String(p||'');
  } catch(e) {
    return String(p||'');
  }
}

// Safely single-quote a string for bash -lc
function _shq(s){
  try { return "'" + String(s||'').replace(/'/g, "'\\''") + "'"; } catch(e){ return "''"; }
}

export function PPRO_startBackend() {
  try {
    var isWindows = false; 
    try { isWindows = ($.os && $.os.toString().indexOf('Windows') !== -1); } catch(_){ isWindows = false; }

    try {
      var logFile = _pproDebugLogFile();
      if (logFile && logFile.fsName) {
        logFile.open('a');
        logFile.writeln('[' + new Date().toString() + '] PPRO_startBackend called');
        logFile.close();
      }
    } catch(e) {}

    // Check if server is already running
    try {
      var url = "http://127.0.0.1:3000/health";
      var cmd;
      if (isWindows) {
        cmd = 'cmd.exe /c curl -s -m 1 "' + url + '" >NUL 2>&1';
      } else {
        cmd = "/bin/bash -lc 'curl -s -m 1 \"" + url + "\" >/dev/null 2>&1'";
      }
      var result = _callSystem(cmd);
      // If curl succeeds, server is already running
      if (result === 0) {
        try {
          var logFile = _pproDebugLogFile();
          if (logFile && logFile.fsName) {
            logFile.open('a');
            logFile.writeln('[' + new Date().toString() + '] Server already running on port 3000');
            logFile.close();
          }
        } catch(e) {}
        return _respond({ ok: true, message: "Backend already running on port 3000" });
      }
    } catch(e) {
      try {
        var logFile = _pproDebugLogFile();
        if (logFile && logFile.fsName) {
          logFile.open('a');
          logFile.writeln('[' + new Date().toString() + '] Health check error: ' + String(e));
          logFile.close();
        }
      } catch(_) {}
    }

    // Server not running - spawn it
    try {
      var extPath = _extensionRoot();
      if (!extPath) {
        var errorMsg = "Could not determine extension path";
        try {
          var logFile = _pproDebugLogFile();
          if (logFile && logFile.fsName) {
            logFile.open('a');
            logFile.writeln('[' + new Date().toString() + '] ERROR: ' + errorMsg);
            logFile.close();
          }
        } catch(e) {}
        return _respond({ ok: false, error: errorMsg });
      }
      
      try {
        var logFile = _pproDebugLogFile();
        if (logFile && logFile.fsName) {
          logFile.open('a');
          logFile.writeln('[' + new Date().toString() + '] Extension path: ' + extPath);
          logFile.close();
        }
      } catch(e) {}
      
      var serverPath = extPath + (isWindows ? "\\server\\server.ts" : "/server/server.ts");
      var serverFile = new File(serverPath);
      if (!serverFile.exists) {
        // Try dist/server path
        serverPath = extPath + (isWindows ? "\\dist\\server\\server.ts" : "/dist/server/server.ts");
        serverFile = new File(serverPath);
        if (!serverFile.exists) {
          var errorMsg = "Server file not found. Tried: " + extPath + (isWindows ? "\\server\\server.ts" : "/server/server.ts") + " and " + serverPath;
          try {
            var logFile = _pproDebugLogFile();
            if (logFile && logFile.fsName) {
              logFile.open('a');
              logFile.writeln('[' + new Date().toString() + '] ERROR: ' + errorMsg);
              logFile.close();
            }
          } catch(e) {}
          return _respond({ ok: false, error: errorMsg });
        }
      }
      
      try {
        var logFile = _pproDebugLogFile();
        if (logFile && logFile.fsName) {
          logFile.open('a');
          logFile.writeln('[' + new Date().toString() + '] Server file found: ' + serverPath);
          logFile.close();
        }
      } catch(e) {}
      
      // Determine bundled Node binary path
      var nodeBin = "";
      if (isWindows) {
        nodeBin = extPath + "\\bin\\win32-x64\\node.exe";
      } else {
        // macOS: detect architecture (arm64 or x64)
        try {
          var archFile = new File(extPath + "/bin/darwin-arm64/node");
          var isArm64 = archFile.exists;
          if (isArm64) {
            nodeBin = extPath + "/bin/darwin-arm64/node";
          } else {
            nodeBin = extPath + "/bin/darwin-x64/node";
          }
        } catch(e) {
          // Fallback to x64 if detection fails
          nodeBin = extPath + "/bin/darwin-x64/node";
        }
      }
      
      var nodeBinFile = new File(nodeBin);
      if (!nodeBinFile.exists) {
        var errorMsg = "Node binary not found at: " + nodeBin;
        try {
          var logFile = _pproDebugLogFile();
          if (logFile && logFile.fsName) {
            logFile.open('a');
            logFile.writeln('[' + new Date().toString() + '] ERROR: ' + errorMsg);
            logFile.close();
          }
        } catch(e) {}
        return _respond({ ok: false, error: errorMsg });
      }
      
      try {
        var logFile = _pproDebugLogFile();
        if (logFile && logFile.fsName) {
          logFile.open('a');
          logFile.writeln('[' + new Date().toString() + '] Node binary found: ' + nodeBin);
          logFile.close();
        }
      } catch(e) {}
      
      // Spawn server process in background using bundled Node binary
      // Redirect stderr to log file so we can see errors
      var serverErrLog = '';
      try {
        var logDir = SYNC_getLogDir();
        if (logDir) {
          serverErrLog = logDir + (isWindows ? '\\' : '/') + 'server_stderr.log';
        }
      } catch(_) {}
      
      var spawnCmd;
      if (isWindows) {
        // Windows: use start with /B to run in background, pass HOST_APP environment variable
        // Use tsx to run TypeScript directly
        var serverDir = serverPath.replace(/\\server\.ts$/, '').replace(/\/server\.ts$/, '');
        var tsxBin = serverDir + "\\node_modules\\.bin\\tsx.cmd";
        spawnCmd = 'cmd.exe /c "set HOST_APP=PPRO && start /B "' + tsxBin.replace(/\\/g, '\\\\') + '" "' + serverPath.replace(/\\/g, '\\\\') + '"';
      } else {
        // macOS: use nohup to run in background and redirect output
        // Determine server directory from serverPath
        var serverDir = serverPath;
        if (serverDir.indexOf("/server/server.ts") !== -1) {
          serverDir = serverDir.replace("/server/server.ts", "/server");
        } else if (serverDir.indexOf("/dist/server/server.ts") !== -1) {
          serverDir = serverDir.replace("/dist/server/server.ts", "/dist/server");
        } else {
          // Fallback: just use extPath + "/server"
          serverDir = extPath + "/server";
        }
        // Use tsx to run TypeScript directly - tsx is in dependencies
        var tsxBin = serverDir + (isWindows ? "\\node_modules\\.bin\\tsx.cmd" : "/node_modules/.bin/tsx");
        var serverFile = serverDir + (isWindows ? "\\server.ts" : "/server.ts");
        // Redirect stderr to log file instead of /dev/null
        var redirectErr = serverErrLog ? ' 2>>"' + serverErrLog.replace(/"/g, '\\"') + '"' : ' 2>/dev/null';
        // Pass HOST_APP environment variable for macOS, use tsx to run TypeScript
        spawnCmd = "/bin/bash -c 'cd \"" + serverDir.replace(/"/g, '\\"') + "\" && HOST_APP=PPRO nohup \"" + tsxBin.replace(/"/g, '\\"') + "\" server.ts >/dev/null" + redirectErr + " &'";
      }
      
      try {
        var logFile = _pproDebugLogFile();
        if (logFile && logFile.fsName) {
          logFile.open('a');
          logFile.writeln('[' + new Date().toString() + '] Server directory: ' + serverDir);
          if (serverErrLog) {
            logFile.writeln('[' + new Date().toString() + '] Server stderr log: ' + serverErrLog);
          }
          logFile.close();
        }
      } catch(e) {}
      
      try {
        var logFile = _pproDebugLogFile();
        if (logFile && logFile.fsName) {
          logFile.open('a');
          logFile.writeln('[' + new Date().toString() + '] Spawn command: ' + spawnCmd);
          logFile.writeln('[' + new Date().toString() + '] Server directory: ' + serverDir);
          logFile.close();
        }
      } catch(e) {}
      
      var spawnResult = _callSystem(spawnCmd);
      
      try {
        var logFile = _pproDebugLogFile();
        if (logFile && logFile.fsName) {
          logFile.open('a');
          logFile.writeln('[' + new Date().toString() + '] Spawn result: ' + spawnResult);
          logFile.close();
        }
      } catch(e) {}
      
      // Wait a moment for server to start
      var waitStart = new Date().getTime();
      var serverStarted = false;
      while (new Date().getTime() - waitStart < 2000) {
        try {
          var checkUrl = "http://127.0.0.1:3000/health";
          var checkCmd;
          if (isWindows) {
            checkCmd = 'cmd.exe /c curl -s -m 1 "' + checkUrl + '" >NUL 2>&1';
          } else {
            checkCmd = "/bin/bash -lc 'curl -s -m 1 \"" + checkUrl + "\" >/dev/null 2>&1'";
          }
          var checkResult = _callSystem(checkCmd);
          if (checkResult === 0) {
            serverStarted = true;
            try {
              var logFile = _pproDebugLogFile();
              if (logFile && logFile.fsName) {
                logFile.open('a');
                logFile.writeln('[' + new Date().toString() + '] Server started successfully');
                logFile.close();
              }
            } catch(e) {}
            return _respond({ ok: true, message: "Backend started successfully" });
          }
        } catch(e) {
          try {
            var logFile = _pproDebugLogFile();
            if (logFile && logFile.fsName) {
              logFile.open('a');
              logFile.writeln('[' + new Date().toString() + '] Health check error: ' + String(e));
              logFile.close();
            }
          } catch(_) {}
        }
        // Small delay before checking again
        var delayStart = new Date().getTime();
        while (new Date().getTime() - delayStart < 100) { /* wait 100ms */ }
      }
      
      if (!serverStarted) {
        try {
          var logFile = _pproDebugLogFile();
          if (logFile && logFile.fsName) {
            logFile.open('a');
            logFile.writeln('[' + new Date().toString() + '] WARNING: Server start command executed but server not responding after 2 seconds');
            if (serverErrLog) {
              logFile.writeln('[' + new Date().toString() + '] Check server errors in: ' + serverErrLog);
            }
            logFile.close();
          }
        } catch(e) {}
      }
      
      return _respond({ ok: true, message: "Backend start command executed (may still be starting)" });
    } catch(e) {
      var errorMsg = "Failed to start backend: " + String(e);
      try {
        var logFile = _pproDebugLogFile();
        if (logFile && logFile.fsName) {
          logFile.open('a');
          logFile.writeln('[' + new Date().toString() + '] ERROR: ' + errorMsg);
          logFile.close();
        }
      } catch(_) {}
      return _respond({ ok: false, error: errorMsg });
    }
  } catch(e) {
    var errorMsg = String(e);
    try {
      var logFile = _pproDebugLogFile();
      if (logFile && logFile.fsName) {
        logFile.open('a');
        logFile.writeln('[' + new Date().toString() + '] ERROR: ' + errorMsg);
        logFile.close();
      }
    } catch(_) {}
    return _respond({ ok: false, error: errorMsg });
  }
}

export function PPRO_stopBackend() {
  try {
    var isWindows = false; 
    try { isWindows = ($.os && $.os.toString().indexOf('Windows') !== -1); } catch(_){ isWindows = false; }

    if (isWindows) {
      // Windows: kill processes on port 3000
      try {
        _callSystem('cmd.exe /c "for /f \"tokens=5\" %a in (\'netstat -aon ^| findstr :3000\') do taskkill /f /pid %a"');
      } catch(e) {}
    } else {
      // macOS: kill processes on port 3000
      try {
        _callSystem("/bin/bash -lc 'lsof -tiTCP:3000 | xargs -r kill -9 || true'");
      } catch(e) {}
    }
    
    return _respond({ ok: true, message: "Backend stopped" });
  } catch(e) {
    return _respond({ ok: false, error: String(e) });
  }
}

// Diagnostic: confirm environment
export function PPRO_diag(){
  try{
    var info = {
      ok:true,
      systemType: String(typeof system),
      hasStart: false, // Auto-start is now handled by ui/nle.js
      fileName: String($.fileName||''),
      os: String($.os||'')
    };
    return _respond(info);
  }catch(e){ return _respond({ ok:false, error:String(e) }); }
}

// Thumbnail support functions
export function PPRO_ensureDir(dirPath) {
  try {
    var folder = new Folder(dirPath);
    if (!folder.exists) {
      // Create parent directories recursively
      // Use recursive approach: ensure parent exists, then create this directory
      function ensureDirRecursive(path) {
        var f = new Folder(path);
        if (f.exists) return true;
        var parent = f.parent;
        if (parent && !parent.exists) {
          ensureDirRecursive(parent.fsName);
        }
        try {
          f.create();
          return f.exists;
        } catch(e) {
          return false;
        }
      }
      ensureDirRecursive(dirPath);
    }
    return _respond({ ok: folder.exists });
  } catch(e) {
    return _respond({ ok: false, error: String(e) });
  }
}

export function PPRO_fileExists(filePath) {
  try {
    var file = new File(filePath);
    return _respond({ ok: true, exists: file.exists });
  } catch(e) {
    return _respond({ ok: false, error: String(e) });
  }
}

export function PPRO_readThumbnail(filePath) {
  try {
    var file = new File(filePath);
    if (!file.exists) {
      return _respond({ ok: false, error: 'File does not exist' });
    }
    
    file.open('r');
    var data = file.read();
    file.close();
    
    // Convert binary data to base64
    var base64 = '';
    for (var i = 0; i < data.length; i++) {
      base64 += String.fromCharCode(data.charCodeAt(i) & 0xFF);
    }
    
    var dataUrl = 'data:image/jpeg;base64,' + btoa(base64);
    return _respond({ ok: true, dataUrl: dataUrl });
  } catch(e) {
    return _respond({ ok: false, error: String(e) });
  }
}

export function PPRO_saveThumbnail(payload) {
  try {
    try {
      var log = _pproDebugLogFile();
      log.open('a');
      log.writeln('[PPRO_saveThumbnail] Payload type: ' + typeof payload);
      log.writeln('[PPRO_saveThumbnail] Payload length: ' + String(payload ? payload.length : 0));
      log.writeln('[PPRO_saveThumbnail] Payload first 200 chars: ' + String(payload || '').substring(0, 200));
      log.close();
    } catch(_) {}
    
    // Parse JSON - try native JSON.parse first, fallback to eval if polyfill fails
    var data;
    try {
      data = JSON.parse(payload);
    } catch(parseError) {
      // If JSON.parse fails, try eval() as fallback (works in ExtendScript)
      // This handles cases where the polyfill has bugs with large base64 strings
      try {
        // eval() can parse JSON in ExtendScript
        data = eval('(' + payload + ')');
      } catch(evalError) {
        // Both failed - return error
        try {
          var log = _pproDebugLogFile();
          log.open('a');
          log.writeln('[PPRO_saveThumbnail] JSON.parse failed: ' + String(parseError));
          log.writeln('[PPRO_saveThumbnail] eval() fallback also failed: ' + String(evalError));
          log.writeln('[PPRO_saveThumbnail] Payload sample (chars 0-500): ' + String(payload || '').substring(0, 500));
          log.close();
        } catch(_) {}
        return _respond({ ok: false, error: 'JSON parse failed: ' + String(parseError) });
      }
    }
    var path = data.path;
    var dataUrl = data.dataUrl;
    
    // Clean up path: remove file:// prefix and decode URL encoding
    if (path.indexOf('file://') === 0) {
      path = path.substring(7); // Remove 'file://'
    }
    // Decode URL encoding (e.g., %20 -> space)
    path = decodeURIComponent(path);
    
    // Ensure directory exists before writing
    var file = new File(path);
    var parentFolder = file.parent;
    if (parentFolder && !parentFolder.exists) {
      // Use recursive directory creation
      function ensureDirRecursive(dirPath) {
        var f = new Folder(dirPath);
        if (f.exists) return true;
        var p = f.parent;
        if (p && !p.exists) {
          ensureDirRecursive(p.fsName);
        }
        try {
          f.create();
          return f.exists;
        } catch(e) {
          return false;
        }
      }
      ensureDirRecursive(parentFolder.fsName);
    }
    
    // Extract base64 data from data URL
    var base64Data = dataUrl.split(',')[1];
    if (!base64Data) {
      return _respond({ ok: false, error: 'Invalid data URL format' });
    }
    
    // Decode base64 and write to file
    file.encoding = 'BINARY';
    file.open('w');
    file.write(base64Decode(base64Data));
    file.close();
    
    // Verify file was created
    if (!file.exists) {
      return _respond({ ok: false, error: 'File was not created' });
    }
    
    return _respond({ ok: true, path: path });
  } catch(e) {
    return _respond({ ok: false, error: String(e) });
  }
}

function base64Decode(input) {
  var keyStr = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
  var output = "";
  var chr1, chr2, chr3;
  var enc1, enc2, enc3, enc4;
  var i = 0;
  
  input = input.replace(/[^A-Za-z0-9\+\/\=]/g, "");
  
  while (i < input.length) {
    enc1 = keyStr.indexOf(input.charAt(i++));
    enc2 = keyStr.indexOf(input.charAt(i++));
    enc3 = keyStr.indexOf(input.charAt(i++));
    enc4 = keyStr.indexOf(input.charAt(i++));
    
    chr1 = (enc1 << 2) | (enc2 >> 4);
    chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
    chr3 = ((enc3 & 3) << 6) | enc4;
    
    output = output + String.fromCharCode(chr1);
    
    if (enc3 != 64) {
      output = output + String.fromCharCode(chr2);
    }
    if (enc4 != 64) {
      output = output + String.fromCharCode(chr3);
    }
  }
  
  return output;
}
