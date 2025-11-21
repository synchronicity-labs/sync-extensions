// Shared utilities for AEFT and PPRO
// Only host-specific implementations should differ

// Polyfill String.trim() for ExtendScript
if (typeof String.prototype.trim !== 'function') {
  String.prototype.trim = function() {
    return this.replace(/^\s+|\s+$/g, '');
  };
}

// Minimal JSON polyfill for ExtendScript environments lacking JSON
try {
  if (typeof JSON === 'undefined') { JSON = {}; }
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
  return -1;
}

function SYNC_getBaseDirs(){
  try{
    var isWindows = false; 
    try { isWindows = ($.os && $.os.toString().indexOf('Windows') !== -1); } catch(_){ isWindows = false; }
    var root = Folder.userData.fsName;
    var base = new Folder(root + (isWindows ? "\\sync. extensions" : "/sync. extensions"));
    if (!base.exists) { try{ base.create(); }catch(_){ } }
    function ensure(name){ 
      var f = new Folder(base.fsName + (isWindows ? ('\\' + name) : ('/' + name))); 
      if(!f.exists){ try{ f.create(); }catch(_){ } } 
      return f.fsName; 
    }
    return { 
      base: base.fsName, 
      logs: ensure('logs'), 
      cache: ensure('cache'), 
      state: ensure('state'), 
      uploads: ensure('uploads'), 
      updates: ensure('updates') 
    };
  }catch(e){ 
    try{ 
      return { 
        base: Folder.userData.fsName, 
        logs: Folder.userData.fsName, 
        cache: Folder.userData.fsName, 
        state: Folder.userData.fsName, 
        uploads: Folder.userData.fsName, 
        updates: Folder.userData.fsName 
      }; 
    }catch(_){ 
      return { base:'', logs:'', cache:'', state:'', uploads:'', updates:'' }; 
    } 
  }
}

function SYNC_getLogDir(){ try{ return SYNC_getBaseDirs().logs; }catch(_){ return ''; } }
function SYNC_getUploadsDir(){ try{ return SYNC_getBaseDirs().uploads; }catch(_){ return ''; } }

function _extensionRoot() {
  try {
    // Method 1: Derive from this script path: <ext>/jsx/index.jsxbin → <ext>
    var here = new File($.fileName);
    if (here && here.exists) {
      var jsxDir = here.parent; // /jsx
      if (jsxDir) {
        var extDir = jsxDir.parent; // extension root
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
    
    var userExt = new File(userPath);
    if (userExt && userExt.exists) return userPath;
    
    var systemExt = new File(systemPath);
    if (systemExt && systemExt.exists) return systemPath;
    
    return userPath;
  } catch(e2) {}
  return '';
}

function _respond(data) {
  try { return JSON.stringify(data); } catch (e) { return String(data); }
}

function _shq(s) {
  try { return "'" + String(s || '').replace(/'/g, "'\\''") + "'"; } catch (e) { return "''"; }
}

// Unified host logging function - takes host tag as parameter
function _hostLog(msg, hostTag, debugLogFileFn) {
  try{
    var s = String(msg||'');
    var timestamp = new Date().toISOString();
    var logLine = `[${timestamp}] [${hostTag}] ${s}\n`;
    
    try {
      if (debugLogFileFn && typeof debugLogFileFn === 'function') {
        var logFile = debugLogFileFn();
        if (logFile && logFile.fsName) {
          logFile.open('a');
          logFile.write(logLine);
          logFile.close();
        }
      }
    } catch(_){ }
    
    var isWindows = false; 
    try { isWindows = ($.os && $.os.toString().indexOf('Windows') !== -1); } catch(_){ isWindows = false; }
    if (isWindows) {
      var url = "http://127.0.0.1:3000/hostlog?msg=" + encodeURIComponent(s).replace(/\"/g,'\\"');
      var wcmd = 'cmd.exe /c curl -s -m 1 ' + '"' + url.replace(/"/g,'\"') + '"' + ' >NUL 2>&1';
      _callSystem(wcmd);
    } else {
      var payload = '{"msg": ' + JSON.stringify(s) + '}';
      var cmd = "/bin/bash -lc " + _shq("(curl -s -m 1 -X POST -H 'Content-Type: application/json' --data " + _shq(payload) + " http://127.0.0.1:3000/hostlog || true) >/dev/null 2>&1");
      _callSystem(cmd);
    }
  }catch(e){ }
}

// Unified startBackend function - takes hostApp and debugLogFileFn as parameters
function _startBackend(hostApp, debugLogFileFn) {
  try {
    var isWindows = false; 
    try { isWindows = ($.os && $.os.toString().indexOf('Windows') !== -1); } catch(_){ isWindows = false; }

    try {
      if (debugLogFileFn && typeof debugLogFileFn === 'function') {
        var logFile = debugLogFileFn();
        if (logFile && logFile.fsName) {
          logFile.open('a');
          logFile.writeln('[' + new Date().toString() + '] ' + hostApp + '_startBackend called');
          logFile.close();
        }
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
      if (result === 0) {
        try {
          if (debugLogFileFn && typeof debugLogFileFn === 'function') {
            var logFile = debugLogFileFn();
            if (logFile && logFile.fsName) {
              logFile.open('a');
              logFile.writeln('[' + new Date().toString() + '] Server already running on port 3000');
              logFile.close();
            }
          }
        } catch(e) {}
        return _respond({ ok: true, message: "Backend already running on port 3000" });
      }
    } catch(e) {
      try {
        if (debugLogFileFn && typeof debugLogFileFn === 'function') {
          var logFile = debugLogFileFn();
          if (logFile && logFile.fsName) {
            logFile.open('a');
            logFile.writeln('[' + new Date().toString() + '] Health check error: ' + String(e));
            logFile.close();
          }
        }
      } catch(_) {}
    }

    // Server not running - spawn it
    try {
      var extPath = _extensionRoot();
      if (!extPath) {
        var errorMsg = "Could not determine extension path";
        try {
          if (debugLogFileFn && typeof debugLogFileFn === 'function') {
            var logFile = debugLogFileFn();
            if (logFile && logFile.fsName) {
              logFile.open('a');
              logFile.writeln('[' + new Date().toString() + '] ERROR: ' + errorMsg);
              logFile.close();
            }
          }
        } catch(e) {}
        return _respond({ ok: false, error: errorMsg });
      }
      
      try {
        if (debugLogFileFn && typeof debugLogFileFn === 'function') {
          var logFile = debugLogFileFn();
          if (logFile && logFile.fsName) {
            logFile.open('a');
            logFile.writeln('[' + new Date().toString() + '] Extension path: ' + extPath);
            logFile.close();
          }
        }
      } catch(e) {}
      
      var serverPath = extPath + (isWindows ? "\\server\\server.ts" : "/server/server.ts");
      var serverFile = new File(serverPath);
      if (!serverFile.exists) {
        var errorMsg = "Server file not found at: " + serverPath;
        try {
          if (debugLogFileFn && typeof debugLogFileFn === 'function') {
            var logFile = debugLogFileFn();
            if (logFile && logFile.fsName) {
              logFile.open('a');
              logFile.writeln('[' + new Date().toString() + '] ERROR: ' + errorMsg);
              logFile.writeln('[' + new Date().toString() + '] Extension path: ' + extPath);
              logFile.close();
            }
          }
        } catch(e) {}
        return _respond({ ok: false, error: errorMsg });
      }
      
      try {
        if (debugLogFileFn && typeof debugLogFileFn === 'function') {
          var logFile = debugLogFileFn();
          if (logFile && logFile.fsName) {
            logFile.open('a');
            logFile.writeln('[' + new Date().toString() + '] Server file found: ' + serverPath);
            logFile.close();
          }
        }
      } catch(e) {}
      
      var nodeBin = "";
      if (isWindows) {
        nodeBin = extPath + "\\bin\\win32-x64\\node.exe";
      } else {
        var arm64Path = extPath + "/bin/darwin-arm64/node";
        var x64Path = extPath + "/bin/darwin-x64/node";
        var arm64File = new File(arm64Path);
        var x64File = new File(x64Path);
        
        try {
          if (debugLogFileFn && typeof debugLogFileFn === 'function') {
            var logFile = debugLogFileFn();
            if (logFile && logFile.fsName) {
              logFile.open('a');
              logFile.writeln('[' + new Date().toString() + '] Checking Node binaries:');
              logFile.writeln('[' + new Date().toString() + '] ARM64 exists: ' + arm64File.exists + ' at ' + arm64Path);
              logFile.writeln('[' + new Date().toString() + '] x64 exists: ' + x64File.exists + ' at ' + x64Path);
              logFile.close();
            }
          }
        } catch(e) {}
        
        if (arm64File.exists) {
          nodeBin = arm64Path;
        } else if (x64File.exists) {
          nodeBin = x64Path;
        } else {
          nodeBin = x64Path;
        }
      }
      
      var nodeBinFile = new File(nodeBin);
      if (!nodeBinFile.exists) {
        var errorMsg = "Node binary not found. Checked: " + (isWindows ? nodeBin : extPath + "/bin/darwin-arm64/node and " + extPath + "/bin/darwin-x64/node");
        try {
          if (debugLogFileFn && typeof debugLogFileFn === 'function') {
            var logFile = debugLogFileFn();
            if (logFile && logFile.fsName) {
              logFile.open('a');
              logFile.writeln('[' + new Date().toString() + '] ERROR: ' + errorMsg);
              logFile.writeln('[' + new Date().toString() + '] Extension path: ' + extPath);
              logFile.close();
            }
          }
        } catch(e) {}
        return _respond({ ok: false, error: errorMsg });
      }
      
      try {
        if (debugLogFileFn && typeof debugLogFileFn === 'function') {
          var logFile = debugLogFileFn();
          if (logFile && logFile.fsName) {
            logFile.open('a');
            logFile.writeln('[' + new Date().toString() + '] Using Node binary: ' + nodeBin);
            logFile.close();
          }
        }
      } catch(e) {}
      
      var serverErrLog = '';
      try {
        var logDir = SYNC_getLogDir();
        if (logDir) {
          serverErrLog = logDir + (isWindows ? '\\' : '/') + 'server_stderr.log';
        }
      } catch(_) {}
      
      var serverDir = extPath + (isWindows ? "\\server" : "/server");
      
      // Create a shell script to avoid quote escaping issues
      var scriptPath = serverDir + (isWindows ? '\\start_server.bat' : '/.start_server.sh');
      var scriptFile = new File(scriptPath);
      
      try {
        scriptFile.open('w');
        if (isWindows) {
          scriptFile.write('@echo off\r\n');
          scriptFile.write('set HOST_APP=' + hostApp + '\r\n');
          scriptFile.write('cd /d "' + serverDir.replace(/"/g, '""') + '"\r\n');
          scriptFile.write('start /B "" "' + nodeBin.replace(/"/g, '""') + '" -r tsx/cjs server.ts\r\n');
        } else {
          scriptFile.write('#!/bin/bash\n');
          scriptFile.write('cd "' + serverDir.replace(/"/g, '\\"') + '"\n');
          scriptFile.write('export HOST_APP=' + hostApp + '\n');
          if (serverErrLog) {
            scriptFile.write('nohup "' + nodeBin.replace(/"/g, '\\"') + '" -r tsx/cjs server.ts >>"' + serverErrLog.replace(/"/g, '\\"') + '" 2>>"' + serverErrLog.replace(/"/g, '\\"') + '" &\n');
          } else {
            scriptFile.write('nohup "' + nodeBin.replace(/"/g, '\\"') + '" -r tsx/cjs server.ts >/dev/null 2>/dev/null &\n');
          }
        }
        scriptFile.close();
        
        // Make executable on Unix
        if (!isWindows) {
          scriptFile.permissions = 'rwxrwxrwx';
        }
        
        try {
          if (debugLogFileFn && typeof debugLogFileFn === 'function') {
            var logFile = debugLogFileFn();
            if (logFile && logFile.fsName) {
              logFile.open('a');
              logFile.writeln('[' + new Date().toString() + '] Created startup script: ' + scriptPath);
              logFile.close();
            }
          }
        } catch(e) {}
      } catch(scriptError) {
        try {
          if (debugLogFileFn && typeof debugLogFileFn === 'function') {
            var logFile = debugLogFileFn();
            if (logFile && logFile.fsName) {
              logFile.open('a');
              logFile.writeln('[' + new Date().toString() + '] Failed to create script: ' + String(scriptError));
              logFile.close();
            }
          }
        } catch(e) {}
        return _respond({ ok: false, error: "Failed to create startup script: " + String(scriptError) });
      }
      
      // Execute script using System.callSystem
      var spawnCmd;
      if (isWindows) {
        spawnCmd = 'cmd.exe /c "' + scriptPath.replace(/\\/g, '\\\\') + '"';
      } else {
        spawnCmd = '/bin/bash "' + scriptPath + '"';
      }
      
      try {
        if (debugLogFileFn && typeof debugLogFileFn === 'function') {
          var logFile = debugLogFileFn();
          if (logFile && logFile.fsName) {
            logFile.open('a');
            logFile.writeln('[' + new Date().toString() + '] Executing: ' + spawnCmd);
            logFile.close();
          }
        }
      } catch(e) {}
      
      var spawnResult = _callSystem(spawnCmd);
      
      if (spawnResult === -1) {
        try {
          if (debugLogFileFn && typeof debugLogFileFn === 'function') {
            var logFile = debugLogFileFn();
            if (logFile && logFile.fsName) {
              logFile.open('a');
              logFile.writeln('[' + new Date().toString() + '] ERROR: System.callSystem not available - cannot start server');
              logFile.close();
            }
          }
        } catch(e) {}
        return _respond({ ok: false, error: "System.callSystem API not available - cannot start server process" });
      }
      
      try {
        if (debugLogFileFn && typeof debugLogFileFn === 'function') {
          var logFile = debugLogFileFn();
          if (logFile && logFile.fsName) {
            logFile.open('a');
            logFile.writeln('[' + new Date().toString() + '] Spawn result: ' + spawnResult);
            if (serverErrLog) {
              logFile.writeln('[' + new Date().toString() + '] Server stderr log: ' + serverErrLog);
            }
            logFile.close();
          }
        }
      } catch(e) {}
      
      // Wait for server to start
      var waitStart = new Date().getTime();
      var serverStarted = false;
      while (new Date().getTime() - waitStart < 3000) {
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
              if (debugLogFileFn && typeof debugLogFileFn === 'function') {
                var logFile = debugLogFileFn();
                if (logFile && logFile.fsName) {
                  logFile.open('a');
                  logFile.writeln('[' + new Date().toString() + '] Server started successfully');
                  logFile.close();
                }
              }
            } catch(e) {}
            return _respond({ ok: true, message: "Backend started successfully" });
          }
        } catch(e) {}
        var delayStart = new Date().getTime();
        while (new Date().getTime() - delayStart < 200) {}
      }
      
      if (!serverStarted) {
        var errorMsg = "Server start command executed but server not responding after 3 seconds";
        if (serverErrLog) {
          errorMsg += ". Check errors in: " + serverErrLog;
        }
        try {
          if (debugLogFileFn && typeof debugLogFileFn === 'function') {
            var logFile = debugLogFileFn();
            if (logFile && logFile.fsName) {
              logFile.open('a');
              logFile.writeln('[' + new Date().toString() + '] WARNING: ' + errorMsg);
              logFile.close();
            }
          }
        } catch(e) {}
        return _respond({ ok: false, error: errorMsg });
      }
      
      return _respond({ ok: true, message: "Backend started successfully" });
    } catch(e) {
      var errorMsg = "Failed to start backend: " + String(e);
      try {
        if (debugLogFileFn && typeof debugLogFileFn === 'function') {
          var logFile = debugLogFileFn();
          if (logFile && logFile.fsName) {
            logFile.open('a');
            logFile.writeln('[' + new Date().toString() + '] ERROR: ' + errorMsg);
            logFile.close();
          }
        }
      } catch(_) {}
      return _respond({ ok: false, error: errorMsg });
    }
  } catch(e) {
    var errorMsg = String(e);
    try {
      if (debugLogFileFn && typeof debugLogFileFn === 'function') {
        var logFile = debugLogFileFn();
        if (logFile && logFile.fsName) {
          logFile.open('a');
          logFile.writeln('[' + new Date().toString() + '] ERROR: ' + errorMsg);
          logFile.close();
        }
      }
    } catch(_) {}
    return _respond({ ok: false, error: errorMsg });
  }
}

// Unified stopBackend function
function _stopBackend() {
  try {
    var isWindows = false; 
    try { isWindows = ($.os && $.os.toString().indexOf('Windows') !== -1); } catch(_){ isWindows = false; }

    if (isWindows) {
      try {
        _callSystem('cmd.exe /c "for /f \"tokens=5\" %a in (\'netstat -aon ^| findstr :3000\') do taskkill /f /pid %a"');
      } catch(e) {}
    } else {
      try {
        _callSystem("/bin/bash -lc 'lsof -tiTCP:3000 | xargs -r kill -9 || true'");
      } catch(e) {}
    }
    
    return _respond({ ok: true, message: "Backend stopped" });
  } catch(e) {
    return _respond({ ok: false, error: String(e) });
  }
}

// Export all shared utilities
// Note: In ExtendScript, we can't use ES6 exports, so we'll use a namespace object
var SHARED = {
  _callSystem: _callSystem,
  SYNC_getBaseDirs: SYNC_getBaseDirs,
  SYNC_getLogDir: SYNC_getLogDir,
  SYNC_getUploadsDir: SYNC_getUploadsDir,
  _extensionRoot: _extensionRoot,
  _respond: _respond,
  _shq: _shq,
  _hostLog: _hostLog,
  _startBackend: _startBackend,
  _stopBackend: _stopBackend
};

