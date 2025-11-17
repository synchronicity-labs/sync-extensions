#!/usr/bin/env node
// DaVinci Resolve Workflow Integration Plugin
// Electron main process that works with Resolve's runtime

import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as http from 'http';
// Get __dirname equivalent
// Since we compile to CommonJS format, __dirname will be available at runtime
// Declare it so TypeScript knows it exists, but don't derive it (esbuild will handle it)
declare const __dirname: string;
declare const __filename: string;

// Use __dirname directly - it will be available in CommonJS compiled output
const pluginDir = __dirname;

debugLog('sync. Resolve plugin starting...');

function debugLog(message: string, data: Record<string, unknown> = {}): void {
  try {
    // Also output to console (single source of truth pattern)
    console.log(`[resolve] ${message}`, data);
    
    // Also try to send to server debug endpoint (matching shared utility pattern)
    // This may fail if server isn't running yet, which is fine
    try {
      const logData = JSON.stringify({
        message: `[resolve] ${message}`,
        data,
        timestamp: new Date().toISOString(),
        hostConfig: { hostId: 'RESOLVE' }
      });
      
      const req = http.request({
        hostname: '127.0.0.1',
        port: 3000,
        path: '/debug',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        timeout: 100
      }, () => {});
      req.on('error', () => {}); // Ignore errors - server might not be running
      req.on('timeout', () => req.destroy());
      req.write(logData);
      req.end();
    } catch (_) {
      // Ignore - server might not be available
    }
    
    // Determine base directory per platform (same as server/config.ts)
    const home = os.homedir();
    let baseDir: string;
    if (process.platform === 'win32') {
      baseDir = process.env.SYNC_EXTENSIONS_DIR || path.join(home, 'AppData', 'Roaming', 'sync. extensions');
    } else if (process.platform === 'darwin') {
      baseDir = process.env.SYNC_EXTENSIONS_DIR || path.join(home, 'Library', 'Application Support', 'sync. extensions');
    } else {
      baseDir = process.env.SYNC_EXTENSIONS_DIR || path.join(home, '.config', 'sync. extensions');
    }

    const logsDir = path.join(baseDir, 'logs');
    const debugFlag = path.join(logsDir, '.debug');

    if (!fs.existsSync(debugFlag)) {
      return; // Don't log if flag doesn't exist
    }

    // Ensure logs directory exists
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    const debugFile = path.join(logsDir, 'sync_resolve_debug.log');
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [resolve] ${message} ${JSON.stringify(data)}\n`;
    fs.appendFileSync(debugFile, logEntry);
  } catch (error) {
    // Ignore logging errors
  }
}

debugLog('backend.ts started', {
  electronVersion: process.versions.electron,
  nodeVersion: process.version,
  platform: process.platform,
  argv: process.argv
});

// Check if we're running in Electron context
if (process.versions.electron) {
  debugLog('Running in Electron context', { electronVersion: process.versions.electron });

  debugLog('Electron modules loaded successfully');

  // Register IPC handlers EARLY, before app.whenReady()
  // This ensures they're available when the renderer tries to use them
  ipcMain.handle('get-api-key', async () => {
    try {
      const apiKeyFile = path.join(os.homedir(), 'Library', 'Application Support', 'sync. extensions', 'api-key.txt');
      if (fs.existsSync(apiKeyFile)) {
        return fs.readFileSync(apiKeyFile, 'utf8').trim();
      }
      return '';
    } catch (error) {
      const err = error as Error;
      debugLog('Error getting API key', { error: err.message });
      return '';
    }
  });

  ipcMain.handle('get-user-data-path', async () => {
    try {
      const userDataPath = app.getPath('userData');
      debugLog('User data path requested', { path: userDataPath });
      return userDataPath;
    } catch (error) {
      const err = error as Error;
      debugLog('Error getting user data path', { error: err.message });
      return path.join(os.homedir(), 'Library', 'Application Support', 'sync. extensions');
    }
  });

  // File operations for thumbnails - register early
  ipcMain.handle('ensure-dir', async (event, dirPath: string) => {
    try {
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        debugLog('Created directory', { path: dirPath });
      }
      return { ok: true };
    } catch (error) {
      const err = error as Error;
      debugLog('Error ensuring directory', { path: dirPath, error: err.message });
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('file-exists', async (event, filePath: string) => {
    try {
      const exists = fs.existsSync(filePath);
      return { ok: true, exists };
    } catch (error) {
      const err = error as Error;
      debugLog('Error checking file existence', { path: filePath, error: err.message });
      return { ok: false, exists: false, error: err.message };
    }
  });

  ipcMain.handle('read-thumbnail', async (event, filePath: string) => {
    try {
      if (!fs.existsSync(filePath)) {
        return { ok: false, error: 'File not found' };
      }
      const fileBuffer = fs.readFileSync(filePath);
      const base64 = fileBuffer.toString('base64');
      const mimeType = filePath.endsWith('.png') ? 'image/png' : 'image/jpeg';
      const dataUrl = `data:${mimeType};base64,${base64}`;
      return { ok: true, dataUrl };
    } catch (error) {
      const err = error as Error;
      debugLog('Error reading thumbnail', { path: filePath, error: err.message });
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('save-thumbnail', async (event, filePath: string, dataUrl: string) => {
    try {
      const base64Match = dataUrl.match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/);
      if (!base64Match) {
        return { ok: false, error: 'Invalid data URL format' };
      }
      const base64Data = base64Match[2];
      const buffer = Buffer.from(base64Data, 'base64');
      
      const dirPath = path.dirname(filePath);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
      
      fs.writeFileSync(filePath, buffer);
      debugLog('Saved thumbnail', { path: filePath, size: buffer.length });
      return { ok: true };
    } catch (error) {
      const err = error as Error;
      debugLog('Error saving thumbnail', { path: filePath, error: err.message });
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('set-api-key', async (event, key: string) => {
    try {
      const debugDir = path.join(os.homedir(), 'Library', 'Application Support', 'sync. extensions');
      const apiKeyFile = path.join(debugDir, 'api-key.txt');

      if (!fs.existsSync(debugDir)) {
        fs.mkdirSync(debugDir, { recursive: true });
      }

      fs.writeFileSync(apiKeyFile, key);
      debugLog('API key saved');

      // Also sync to localStorage in the renderer
      const windows = BrowserWindow.getAllWindows();
      const keyJson = JSON.stringify(key);
      windows.forEach(win => {
        win.webContents.executeJavaScript(`
          (function() {
            try {
              const settings = JSON.parse(localStorage.getItem('syncSettings') || '{}');
              settings.syncApiKey = ${keyJson};
              localStorage.setItem('syncSettings', JSON.stringify(settings));
              window.dispatchEvent(new StorageEvent('storage', {
                key: 'syncSettings',
                newValue: JSON.stringify(settings),
                oldValue: localStorage.getItem('syncSettings'),
                storageArea: localStorage
              }));
            } catch (e) {
              console.error('[Resolve] Error syncing API key', e);
            }
          })();
        `).catch((err: Error) => {
          debugLog('Error executing API key sync script', { error: err.message });
        });
      });

      return { ok: true };
    } catch (error) {
      const err = error as Error;
      debugLog('Error setting API key', { error: err.message });
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('show-open-dialog', async (event, options: Electron.OpenDialogOptions) => {
    try {
      // Get the main window - dialogs need a parent window to show properly
      const mainWindow = BrowserWindow.getAllWindows()[0];
      if (!mainWindow) {
        debugLog('Error showing open dialog: No browser window available');
        return { canceled: true, filePaths: [] };
      }
      
      debugLog('Showing file dialog', { options });
      const result = await dialog.showOpenDialog(mainWindow, options);
      debugLog('File dialog result', { canceled: result.canceled, fileCount: result.filePaths?.length || 0 });
      return result;
    } catch (error) {
      const err = error as Error;
      debugLog('Error showing open dialog', { error: err.message, stack: err.stack });
      return { canceled: true, filePaths: [] };
    }
  });

  debugLog('IPC handlers registered');

  const NODE_HEALTH_URL = 'http://127.0.0.1:3000/health';
  let nodeProcess: ChildProcess | null = null;
  let nodeLock = false;

  // Get Python script path
  function getPythonScriptPath(): string {
    return path.join(pluginDir, 'python', 'resolve_api.py');
  }

  // Call Python API function
  function callPythonAPI(functionName: string, payload: Record<string, unknown> | string = {}): Promise<any> {
    return new Promise((resolve, reject) => {
      const pythonScript = getPythonScriptPath();
      if (!fs.existsSync(pythonScript)) {
        reject(new Error('Python API script not found'));
        return;
      }

      // Determine Python executable
      let pythonCmd = 'python3';
      if (process.platform === 'win32') {
        pythonCmd = 'python';
      }

      const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
      const args = [pythonScript, functionName, payloadStr];

      debugLog('Calling Python API', { functionName, payload: payloadStr });

      const pythonProcess = spawn(pythonCmd, args, {
        cwd: path.dirname(pythonScript),
        env: { ...process.env }
      });

      let stdout = '';
      let stderr = '';

      pythonProcess.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      pythonProcess.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      pythonProcess.on('close', (code: number | null) => {
        const trimmedStdout = stdout.trim();
        const trimmedStderr = stderr.trim();
        
        if (code !== 0) {
          debugLog('Python API error', { code, stderr: trimmedStderr, stdout: trimmedStdout });
          // Try to parse error response as JSON from stdout first
          if (trimmedStdout) {
            try {
              const errorResult = JSON.parse(trimmedStdout);
              reject(new Error(errorResult.error || trimmedStderr || `Python script exited with code ${code}`));
              return;
            } catch (_) {
              // Not JSON, try stderr
              if (trimmedStderr) {
                try {
                  const errorResult = JSON.parse(trimmedStderr);
                  reject(new Error(errorResult.error || `Python script exited with code ${code}`));
                  return;
                } catch (_) {
                  // Not JSON in stderr either
                }
              }
            }
          }
          // If no JSON found, use raw error messages
          const errorMsg = trimmedStderr || trimmedStdout || 'Unknown error';
          reject(new Error(`Python script exited with code ${code}: ${errorMsg}`));
          return;
        }

        // Success case - check for empty output
        if (!trimmedStdout) {
          debugLog('Python API empty output', { stderr: trimmedStderr });
          // Even on success, if stdout is empty, treat as error
          // But first check if there's a valid JSON error in stderr
          if (trimmedStderr) {
            try {
              const errorResult = JSON.parse(trimmedStderr);
              reject(new Error(errorResult.error || 'Python script returned empty output'));
              return;
            } catch (_) {
              // stderr is not JSON, use it as error message
            }
          }
          reject(new Error(`Python script returned empty output${trimmedStderr ? `: ${trimmedStderr}` : ''}`));
          return;
        }

        // Try to parse JSON response
        try {
          // Remove any leading/trailing whitespace and check for valid JSON structure
          const jsonStr = trimmedStdout.trim();
          if (!jsonStr || jsonStr.length === 0) {
            reject(new Error('Python script returned empty JSON output'));
            return;
          }
          
          // Check if JSON appears incomplete (doesn't end with } or ])
          if (!jsonStr.endsWith('}') && !jsonStr.endsWith(']')) {
            debugLog('Python API output appears incomplete', { 
              lastChars: jsonStr.substring(Math.max(0, jsonStr.length - 50)),
              length: jsonStr.length,
              stderr: trimmedStderr
            });
            reject(new Error(`Python script returned incomplete JSON output. This may indicate a Python error.${trimmedStderr ? ` Stderr: ${trimmedStderr.substring(0, 200)}` : ''}`));
            return;
          }
          
          const result = JSON.parse(jsonStr);
          // Validate result has expected structure
          if (!result || typeof result !== 'object') {
            debugLog('Python API invalid result structure', { result, stdout: jsonStr.substring(0, 200) });
            reject(new Error(`Python script returned invalid result: ${jsonStr.substring(0, 100)}`));
            return;
          }
          resolve(result);
        } catch (e) {
          const err = e as Error;
          const preview = trimmedStdout.substring(0, 200);
          debugLog('Python API parse error', { 
            stdout: preview, 
            stderr: trimmedStderr, 
            error: err.message,
            stdoutLength: trimmedStdout.length,
            firstChars: trimmedStdout.substring(0, 50),
            lastChars: trimmedStdout.substring(Math.max(0, trimmedStdout.length - 50))
          });
          
          // If JSON parsing failed, check if stderr has useful info
          const errorMsg = trimmedStderr 
            ? `Failed to parse Python output: ${preview}... (stderr: ${trimmedStderr.substring(0, 200)})`
            : `Failed to parse Python output: ${preview}...`;
          reject(new Error(errorMsg));
        }
      });

      pythonProcess.on('error', (error: Error) => {
        debugLog('Python API spawn error', { error: error.message });
        reject(error);
      });
    });
  }

  function checkNodeHealth(): Promise<boolean> {
    return new Promise((resolve) => {
      const req = http.get(NODE_HEALTH_URL, { timeout: 1000 }, (res) => {
        resolve(res.statusCode === 200);
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
    });
  }

  async function spawnNodeServer(): Promise<{ ok: boolean; alreadyRunning?: boolean; spawned?: boolean; healthy?: boolean; error?: string }> {
    if (nodeLock) return { ok: true, alreadyRunning: true };

    const isHealthy = await checkNodeHealth();
    if (isHealthy) return { ok: true, alreadyRunning: true };

    nodeLock = true;
    const nodeBin = process.platform === 'darwin'
      ? path.join(pluginDir, 'static', 'bin', 'darwin-arm64', 'node')
      : process.platform === 'win32'
        ? path.join(pluginDir, 'static', 'bin', 'win32-x64', 'node.exe')
        : path.join(pluginDir, 'static', 'bin', 'darwin-x64', 'node');

    const serverTs = path.join(pluginDir, 'static', 'server', 'server.ts');
    const tsxBin = path.join(pluginDir, 'static', 'server', 'node_modules', '.bin', process.platform === 'win32' ? 'tsx.cmd' : 'tsx');

    if (!fs.existsSync(nodeBin) || !fs.existsSync(serverTs)) {
      nodeLock = false;
      debugLog('Server spawn failed - missing files', {
        nodeBin: fs.existsSync(nodeBin),
        serverTs: fs.existsSync(serverTs),
        tsxBin: fs.existsSync(tsxBin),
        nodeBinPath: nodeBin,
        serverTsPath: serverTs
      });
      return { ok: false, error: 'Node binary or server file missing' };
    }

    const cwd = path.join(pluginDir, 'static', 'server');
    // Use tsx to run TypeScript directly - tsx is in dependencies
    // If tsx is not available, fall back to node (though it won't work without compilation)
    const executable = fs.existsSync(tsxBin) ? tsxBin : nodeBin;
    const args = fs.existsSync(tsxBin) ? [serverTs] : ['-r', 'tsx/cjs', serverTs]; // Try to use tsx as a module if binary not found
    debugLog('Spawning Node server with tsx', { executable, serverTs, cwd, usingTsx: fs.existsSync(tsxBin) });
    nodeProcess = spawn(executable, args, {
      cwd,
      detached: false, // Keep attached so we can see output
      stdio: ['ignore', 'pipe', 'pipe'], // Capture stdout/stderr
      env: { ...process.env, HOST_APP: 'RESOLVE', NODE_ENV: 'production' }
    });

    nodeProcess.stdout.on('data', (data: Buffer) => {
      const output = data.toString();
      debugLog('Node server stdout', { output });
    });

    nodeProcess.stderr.on('data', (data: Buffer) => {
      const output = data.toString();
      debugLog('Node server stderr', { output });
    });

    nodeProcess.on('error', (err: Error) => {
      debugLog('Node server spawn error', { error: err.message });
      nodeLock = false;
      nodeProcess = null;
    });

    nodeProcess.on('exit', (code: number | null, signal: string | null) => {
      debugLog('Node server exited', { code, signal });
      nodeProcess = null;
      nodeLock = false;
    });

    // Wait a bit for server to start
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Check if server started successfully
    const isHealthyAfterSpawn = await checkNodeHealth();
    if (!isHealthyAfterSpawn) {
      debugLog('Node server health check failed after spawn');
    }

    return { ok: true, spawned: true, healthy: isHealthyAfterSpawn };
  }

  function createWindow(): void {
    debugLog('Creating Electron window');

    const mainWindow = new BrowserWindow({
      width: 480,
      height: 700,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(pluginDir, 'preload.js') // Will be compiled from preload.ts
      }
    });

    // Clear cache before loading to ensure fresh content
    mainWindow.webContents.session.clearCache().catch((err: Error) => {
      debugLog('Error clearing cache', { error: err.message });
    });

    // Set HOST_CONFIG immediately when window is created (before page loads)
    mainWindow.webContents.executeJavaScript(`
      (function() {
        window.HOST_CONFIG = {
          hostId: 'RESOLVE',
          hostName: 'DaVinci Resolve',
          isAE: false
        };
        console.log('[Resolve] HOST_CONFIG set early:', window.HOST_CONFIG);
      })();
    `).catch(() => {});

    // Load the UI - use Vite dev server in development, static file in production
    const isDev = process.env.NODE_ENV === 'development' || !fs.existsSync(path.join(pluginDir, 'static', 'index.html'));
    const devServerUrl = 'http://localhost:3001/main/';
    
    if (isDev) {
      debugLog('Loading from Vite dev server (hot reload enabled)', { url: devServerUrl });
      mainWindow.loadURL(devServerUrl);
      
      // Enable dev tools in development
      mainWindow.webContents.openDevTools();
    } else {
      // Load from static file in production
      const indexPath = path.join(pluginDir, 'static', 'index.html');
      debugLog('Loading from static file', { indexPath });
      
      if (!fs.existsSync(indexPath)) {
        debugLog('ERROR: index.html not found, falling back to dev server', { indexPath });
        mainWindow.loadURL(devServerUrl);
        return;
      }
      
      mainWindow.loadFile(indexPath);
    }

    // Inject Resolve-specific scripts after page loads
    mainWindow.webContents.once('dom-ready', () => {
      debugLog('DOM ready, injecting scripts');

      // Sync API key from Electron storage to localStorage
      const syncApiKey = () => {
      try {
        const apiKeyFile = path.join(os.homedir(), 'Library', 'Application Support', 'sync. extensions', 'api-key.txt');
        let apiKey = '';
        if (fs.existsSync(apiKeyFile)) {
          apiKey = fs.readFileSync(apiKeyFile, 'utf8').trim();
        }

        if (apiKey) {
          const apiKeyJson = JSON.stringify(apiKey);
          mainWindow.webContents.executeJavaScript(`
            (function() {
              try {
                  const oldValue = localStorage.getItem('syncSettings');
                  const settings = JSON.parse(oldValue || '{}');
                settings.syncApiKey = ${apiKeyJson};
                localStorage.setItem('syncSettings', JSON.stringify(settings));
                  // Dispatch proper StorageEvent to notify listeners (like useHistory)
                  window.dispatchEvent(new StorageEvent('storage', {
                    key: 'syncSettings',
                    newValue: JSON.stringify(settings),
                    oldValue: oldValue,
                    storageArea: localStorage
                  }));
                  // Also trigger a custom event for React components
                  window.dispatchEvent(new CustomEvent('syncSettingsChanged', {
                    detail: { syncApiKey: ${apiKeyJson} }
                  }));
              } catch (e) {
                  console.error('[Resolve] Error syncing API key', e);
              }
            })();
            `).catch((err: Error) => {
              debugLog('Error executing API key sync script', { error: err.message });
            });
        }
      } catch (error) {
        const err = error as Error;
        debugLog('Error syncing API key on DOM ready', { error: err.message });
      }
      };
      
      // Sync immediately
      syncApiKey();

      // Also sync after a short delay to ensure localStorage is ready
      setTimeout(syncApiKey, 500);

      // Load scripts - disable cache and ensure fresh load
      mainWindow.webContents.executeJavaScript(`
        (function() {
          // Remove old scripts if they exist (to prevent duplicates)
          const oldScripts = document.querySelectorAll('script[data-resolve-plugin]');
          oldScripts.forEach(s => s.remove());
          
          // Clear any module cache if it exists
          if (window.require && window.require.cache) {
            Object.keys(window.require.cache).forEach(key => {
              if (key.includes('nle-resolve') || key.includes('host-detection')) {
                delete window.require.cache[key];
              }
            });
          }
          
          // Set HOST_CONFIG immediately before loading scripts
          window.HOST_CONFIG = {
            hostId: 'RESOLVE',
            hostName: 'DaVinci Resolve',
            isAE: false
          };
          console.log('[Resolve] HOST_CONFIG set:', window.HOST_CONFIG);
          
          const script1 = document.createElement('script');
          script1.setAttribute('data-resolve-plugin', 'host-detection');
          script1.src = 'file://${path.join(pluginDir, 'static', 'host-detection.resolve.js').replace(/\\/g, '/')}';
          script1.onerror = function(e) {
            console.error('[Resolve] Failed to load host-detection script', e);
            // Ensure HOST_CONFIG is set even if script fails
            if (!window.HOST_CONFIG) {
              window.HOST_CONFIG = {
                hostId: 'RESOLVE',
                hostName: 'DaVinci Resolve',
                isAE: false
              };
            }
          };
          script1.onload = function() {
            console.log('[Resolve] host-detection script loaded');
            // Ensure HOST_CONFIG is set after script loads
            if (!window.HOST_CONFIG) {
              window.HOST_CONFIG = {
                hostId: 'RESOLVE',
                hostName: 'DaVinci Resolve',
                isAE: false
              };
            }
          };
          document.head.appendChild(script1);
          
          const script2 = document.createElement('script');
          script2.setAttribute('data-resolve-plugin', 'nle-resolve');
          script2.src = 'file://${path.join(pluginDir, 'static', 'nle-resolve.js').replace(/\\/g, '/')}';
          script2.onerror = function(e) {
            console.error('[Resolve] Failed to load nle-resolve script', e);
          };
          script2.onload = function() {
            console.log('[Resolve] nle-resolve script loaded');
          };
          document.head.appendChild(script2);
        })();
      `);
    });
  }

  // IPC handlers are registered early (above, before app.whenReady())
  // All handlers are already registered at the top of the Electron block

  // HTTP server for /nle/* endpoints
  const server = http.createServer(async (req, res) => {
    if (!req.url) {
      res.writeHead(400);
      res.end('Bad request');
      return;
    }

    // CORS headers for all requests
    const origin = req.headers.origin;
    if (origin && (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:'))) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key, Authorization, X-CEP-Panel, x-auth-token');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    } else {
      // Allow all origins for file:// protocol
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key, Authorization, X-CEP-Panel, x-auth-token');
    }

    // Handle OPTIONS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
    const pathname = parsedUrl.pathname;

    // Handle /nle/* endpoints
    if (pathname.startsWith('/nle/')) {
      res.setHeader('Content-Type', 'application/json');

      if (pathname === '/nle/startBackend' && req.method === 'POST') {
        try {
          const result = await spawnNodeServer();
          res.writeHead(200);
          res.end(JSON.stringify(result));
        } catch (error) {
          const err = error as Error;
          res.writeHead(500);
          res.end(JSON.stringify({ ok: false, error: err.message }));
        }
        return;
      }

      if (pathname === '/nle/getProjectDir' && req.method === 'GET') {
        try {
          const result = await callPythonAPI('getProjectDir', {});
          // Ensure result has expected structure
          if (!result || typeof result !== 'object') {
            debugLog('getProjectDir invalid result', { result, resultType: typeof result });
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'Invalid response from Python API' }));
            return;
          }
          // Ensure ok property exists
          if (result.ok === undefined) {
            debugLog('getProjectDir missing ok property', { result });
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: result.error || 'Invalid response format' }));
            return;
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } catch (error) {
          const err = error as Error;
          debugLog('getProjectDir error', { error: err.message, stack: err.stack });
          // Ensure we always return valid JSON, even on error
          try {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: err.message || 'Unknown error occurred' }));
          } catch (writeError) {
            // If we can't write response, log it but don't crash
            debugLog('getProjectDir failed to write error response', { writeError });
          }
        }
        return;
      }

      if (pathname === '/nle/exportInOutVideo' && req.method === 'POST') {
        try {
          let body = '';
          req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
          req.on('end', async () => {
            try {
              const opts = JSON.parse(body || '{}');
              const result = await callPythonAPI('exportInOutVideo', opts);
              res.writeHead(200);
              res.end(JSON.stringify(result));
            } catch (error) {
              const err = error as Error;
              res.writeHead(500);
              res.end(JSON.stringify({ ok: false, error: err.message }));
            }
          });
        } catch (error) {
          const err = error as Error;
          res.writeHead(500);
          res.end(JSON.stringify({ ok: false, error: err.message }));
        }
        return;
      }

      if (pathname === '/nle/exportInOutAudio' && req.method === 'POST') {
        try {
          let body = '';
          req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
          req.on('end', async () => {
            try {
              const opts = JSON.parse(body || '{}');
              const result = await callPythonAPI('exportInOutAudio', opts);
              res.writeHead(200);
              res.end(JSON.stringify(result));
            } catch (error) {
              const err = error as Error;
              res.writeHead(500);
              res.end(JSON.stringify({ ok: false, error: err.message }));
            }
          });
        } catch (error) {
          const err = error as Error;
          res.writeHead(500);
          res.end(JSON.stringify({ ok: false, error: err.message }));
        }
        return;
      }

      if (pathname === '/nle/importFileToBin' && req.method === 'POST') {
        try {
          let body = '';
          req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
          req.on('end', async () => {
            try {
              const payload = JSON.parse(body || '{}');
              const result = await callPythonAPI('importFileToBin', payload);
              res.writeHead(200);
              res.end(JSON.stringify(result));
            } catch (error) {
              const err = error as Error;
              res.writeHead(500);
              res.end(JSON.stringify({ ok: false, error: err.message }));
            }
          });
        } catch (error) {
          const err = error as Error;
          res.writeHead(500);
          res.end(JSON.stringify({ ok: false, error: err.message }));
        }
        return;
      }

      if (pathname === '/nle/insertFileAtPlayhead' && req.method === 'POST') {
        try {
          let body = '';
          req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
          req.on('end', async () => {
            try {
              const payload = JSON.parse(body || '{}');
              const result = await callPythonAPI('insertFileAtPlayhead', payload);
              res.writeHead(200);
              res.end(JSON.stringify(result));
            } catch (error) {
              const err = error as Error;
              res.writeHead(500);
              res.end(JSON.stringify({ ok: false, error: err.message }));
            }
          });
        } catch (error) {
          const err = error as Error;
          res.writeHead(500);
          res.end(JSON.stringify({ ok: false, error: err.message }));
        }
        return;
      }

      if (pathname === '/nle/revealFile' && req.method === 'POST') {
        try {
          let body = '';
          req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
          req.on('end', async () => {
            try {
              const payload = JSON.parse(body || '{}');
              const result = await callPythonAPI('revealFile', payload);
              res.writeHead(200);
              res.end(JSON.stringify(result));
            } catch (error) {
              const err = error as Error;
              res.writeHead(500);
              res.end(JSON.stringify({ ok: false, error: err.message }));
            }
          });
        } catch (error) {
          const err = error as Error;
          res.writeHead(500);
          res.end(JSON.stringify({ ok: false, error: err.message }));
        }
        return;
      }

      if (pathname === '/nle/diagInOut' && req.method === 'GET') {
        try {
          const result = await callPythonAPI('diagInOut', {});
          // Ensure result has expected structure
          if (!result || typeof result !== 'object') {
            debugLog('diagInOut invalid result', { result });
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'Invalid response from Python API' }));
            return;
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } catch (error) {
          const err = error as Error;
          debugLog('diagInOut error', { error: err.message });
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: err.message }));
        }
        return;
      }

      res.writeHead(404);
      res.end(JSON.stringify({ ok: false, error: 'Not found' }));
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  });

  server.listen(45790, '127.0.0.1', () => {
    debugLog('HTTP server started on port 45790');
  });

  app.whenReady().then(() => {
    debugLog('Electron app ready');
    spawnNodeServer();
    createWindow();
  });

  app.on('window-all-closed', () => {
    debugLog('All windows closed');
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('activate', () => {
    debugLog('App activated');
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

} else {
  // Running in Node.js (not Electron) - spawn Electron
  // This happens when Resolve executes backend.js directly via manifest.xml FilePath
  import('child_process').then(({ spawn }) => {
    // Find Electron executable
    const electronPath = path.join(pluginDir, 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron');
    const electronBinSymlink = path.join(pluginDir, 'node_modules', '.bin', 'electron');

    let electronExecutable: string;
    if (fs.existsSync(electronPath)) {
      electronExecutable = electronPath;
    } else if (fs.existsSync(electronBinSymlink)) {
      // Resolve symlink to actual path
      electronExecutable = fs.realpathSync(electronBinSymlink);
    } else {
      debugLog('ERROR: Electron not found in node_modules', { electronPath, electronBinSymlink });
      process.exit(1);
    }

    // Get current file path for spawning Electron
    // __filename will be available in CommonJS compiled output
    const currentFile = __filename;

    // Spawn Electron with backend.js
    const electronProcess = spawn(electronExecutable, [currentFile], {
      cwd: pluginDir,
      stdio: 'inherit',
      detached: false
    });

    electronProcess.on('error', (err: Error) => {
      debugLog('Failed to spawn Electron', { error: err });
      process.exit(1);
    });

    // Don't exit - let Electron process run
    process.on('exit', () => {
      if (electronProcess && !electronProcess.killed) {
        electronProcess.kill();
      }
    });
  }).catch((err) => {
    debugLog('Failed to import child_process', { error: err });
    process.exit(1);
  });
}

