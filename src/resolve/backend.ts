#!/usr/bin/env node
// DaVinci Resolve Workflow Integration Plugin
// Electron main process that works with Resolve's runtime

import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as http from 'http';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

debugLog('sync. Resolve plugin starting...');

function debugLog(message: string, data: Record<string, unknown> = {}): void {
  try {
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

  const NODE_HEALTH_URL = 'http://127.0.0.1:3000/health';
  let nodeProcess: ChildProcess | null = null;
  let nodeLock = false;

  // Get Python script path
  function getPythonScriptPath(): string {
    return path.join(__dirname, 'python', 'resolve_api.py');
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
        if (code !== 0) {
          debugLog('Python API error', { code, stderr });
          reject(new Error(`Python script exited with code ${code}: ${stderr}`));
          return;
        }

        try {
          const result = JSON.parse(stdout.trim());
          resolve(result);
        } catch (e) {
          const err = e as Error;
          debugLog('Python API parse error', { stdout, error: err.message });
          reject(new Error(`Failed to parse Python output: ${stdout}`));
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
      ? path.join(__dirname, 'static', 'bin', 'darwin-arm64', 'node')
      : process.platform === 'win32'
        ? path.join(__dirname, 'static', 'bin', 'win32-x64', 'node.exe')
        : path.join(__dirname, 'static', 'bin', 'darwin-x64', 'node');

    const serverTs = path.join(__dirname, 'static', 'server', 'server.ts');
    const tsxBin = path.join(__dirname, 'static', 'server', 'node_modules', '.bin', process.platform === 'win32' ? 'tsx.cmd' : 'tsx');

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

    const cwd = path.join(__dirname, 'static', 'server');
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
        preload: path.join(__dirname, 'preload.js') // Will be compiled from preload.ts
      }
    });

    // Load the UI - use Vite dev server in development, static file in production
    const isDev = process.env.NODE_ENV === 'development' || !fs.existsSync(path.join(__dirname, 'static', 'index.html'));
    const devServerUrl = 'http://localhost:3001/main/';
    
    if (isDev) {
      debugLog('Loading from Vite dev server (hot reload enabled)', { url: devServerUrl });
      mainWindow.loadURL(devServerUrl);
      
      // Enable dev tools in development
      mainWindow.webContents.openDevTools();
    } else {
      // Load from static file in production
      const indexPath = path.join(__dirname, 'static', 'index.html');
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
                const settings = JSON.parse(localStorage.getItem('syncSettings') || '{}');
                settings.syncApiKey = ${apiKeyJson};
                localStorage.setItem('syncSettings', JSON.stringify(settings));
                // Note: This runs in browser context via executeJavaScript
                // Logging is handled by the injected script's error handler
              } catch (e) {
                debugLog('[Resolve] Error syncing API key', { error: e });
              }
            })();
          `);
        }
      } catch (error) {
        const err = error as Error;
        debugLog('Error syncing API key on DOM ready', { error: err.message });
      }

      mainWindow.webContents.executeJavaScript(`
        (function() {
          const script1 = document.createElement('script');
          script1.src = 'file://${path.join(__dirname, 'static', 'host-detection.resolve.js').replace(/\\/g, '/')}';
          document.head.appendChild(script1);
          
          const script2 = document.createElement('script');
          script2.src = 'file://${path.join(__dirname, 'static', 'nle-resolve.js').replace(/\\/g, '/')}';
          document.head.appendChild(script2);
        })();
      `);
    });
  }

  // IPC handlers for file dialogs
  ipcMain.handle('show-open-dialog', async (event, options: Electron.OpenDialogOptions) => {
    debugLog('File dialog requested', options);
    const result = await dialog.showOpenDialog(options);
    debugLog('File dialog result', result);
    return result;
  });

  // IPC handlers for API key storage
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
              // Note: This runs in browser context, debugLog is defined above
              // debugLog('[Resolve] Synced API key to localStorage');
            } catch (e) {
              debugLog('[Resolve] Error syncing API key to localStorage', { error: e });
            }
          })();
        `);
      });

      return true;
    } catch (error) {
      const err = error as Error;
      debugLog('Error saving API key', { error: err.message });
      return false;
    }
  });

  // HTTP server for /nle/* endpoints
  const server = http.createServer(async (req, res) => {
    if (!req.url) {
      res.writeHead(400);
      res.end('Bad request');
      return;
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
    const pathname = parsedUrl.pathname;

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

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
          res.writeHead(200);
          res.end(JSON.stringify(result));
        } catch (error) {
          const err = error as Error;
          res.writeHead(500);
          res.end(JSON.stringify({ ok: false, error: err.message }));
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
          res.writeHead(200);
          res.end(JSON.stringify(result));
        } catch (error) {
          const err = error as Error;
          res.writeHead(500);
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
    const pluginDir = __dirname;
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

    // Spawn Electron with backend.ts (will be compiled to .js in build)
    const electronProcess = spawn(electronExecutable, [__filename], {
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

