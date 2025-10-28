// DaVinci Resolve Workflow Integration Plugin
// Minimal Electron app that works with Resolve's runtime

console.log('sync. Resolve plugin starting...');

// Debug logging
function debugLog(message, data = {}) {
  try {
    const fs = require('fs');
    const path = require('path');
    const debugDir = path.join(require('os').homedir(), 'Library/Application Support/sync. extensions/logs');
    const debugFile = path.join(debugDir, 'sync_resolve_debug.log');
    
    if (!fs.existsSync(debugDir)) {
      fs.mkdirSync(debugDir, { recursive: true });
    }
    
    const logEntry = `[${new Date().toISOString()}] ${message} ${JSON.stringify(data)}\n`;
    fs.appendFileSync(debugFile, logEntry);
    console.log(`[DEBUG] ${message}`, data);
  } catch (error) {
    console.error('Debug logging error:', error);
  }
}

debugLog('backend.js started', { 
  electronVersion: process.versions.electron,
  nodeVersion: process.version,
  platform: process.platform,
  argv: process.argv
});

// Check if we're running in Electron context
if (process.versions.electron) {
  debugLog('Running in Electron context', { electronVersion: process.versions.electron });
  
  // Electron modules should be available
  const { app, BrowserWindow, ipcMain, dialog } = require('electron');
  const path = require('path');
  const { spawn } = require('child_process');
  const fs = require('fs');

  debugLog('Electron modules loaded successfully');

  const NODE_HEALTH_URL = 'http://127.0.0.1:3000/health';
  let nodeProcess = null;
  let nodeLock = false;

  function checkNodeHealth() {
    return new Promise((resolve) => {
      const req = require('http').get(NODE_HEALTH_URL, { timeout: 1000 }, (res) => {
        resolve(res.statusCode === 200);
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
    });
  }

  function spawnNodeServer() {
    if (nodeLock) return Promise.resolve({ ok: true, alreadyRunning: true });
    
    return checkNodeHealth().then(isHealthy => {
      if (isHealthy) return { ok: true, alreadyRunning: true };
      
      nodeLock = true;
      const nodeBin = process.platform === 'darwin' 
        ? path.join(__dirname, 'static', 'bin', 'darwin-arm64', 'node')
        : path.join(__dirname, 'static', 'bin', 'win32-x64', 'node.exe');
      
      const serverJs = path.join(__dirname, 'static', 'server', 'src', 'server.js');
      
      if (!fs.existsSync(nodeBin) || !fs.existsSync(serverJs)) {
        nodeLock = false;
        return { ok: false, error: 'Node binary or server file missing' };
      }
      
      const cwd = path.join(__dirname, 'static', 'server');
      nodeProcess = spawn(nodeBin, [serverJs], { cwd, detached: true });
      
      nodeProcess.stdout.on('data', data => console.log(`[node] ${data}`));
      nodeProcess.stderr.on('data', data => console.error(`[node] ${data}`));
      
      nodeProcess.on('exit', () => {
        nodeProcess = null;
        nodeLock = false;
      });
      
      return { ok: true, spawned: true };
    });
  }

  function createWindow() {
    debugLog('Creating Electron window');
    
    const mainWindow = new BrowserWindow({
      width: 400,
      height: 600,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js')
      }
    });

    // Load the UI
    const indexPath = path.join(__dirname, 'static', 'index.html');
    debugLog('Loading index.html', { indexPath });
    
    mainWindow.loadFile(indexPath);
    
    // Inject Resolve-specific scripts after page loads
    mainWindow.webContents.once('dom-ready', () => {
      debugLog('DOM ready, injecting scripts');
      mainWindow.webContents.executeJavaScript(`
        const script1 = document.createElement('script');
        script1.src = 'file://${path.join(__dirname, 'static', 'host-detection.resolve.js')}';
        document.head.appendChild(script1);
        
        const script2 = document.createElement('script');
        script2.src = 'file://${path.join(__dirname, 'static', 'nle-resolve.js')}';
        document.head.appendChild(script2);
      `);
    });
  }

  // IPC handlers for file dialogs
  ipcMain.handle('show-open-dialog', async (event, options) => {
    debugLog('File dialog requested', options);
    const result = await dialog.showOpenDialog(options);
    debugLog('File dialog result', result);
    return result;
  });

  // IPC handlers for API key storage
  ipcMain.handle('get-api-key', async () => {
    try {
      const fs = require('fs');
      const path = require('path');
      const apiKeyFile = path.join(require('os').homedir(), 'Library/Application Support/sync. extensions/api-key.txt');
      if (fs.existsSync(apiKeyFile)) {
        return fs.readFileSync(apiKeyFile, 'utf8').trim();
      }
      return '';
    } catch (error) {
      debugLog('Error getting API key', { error: error.message });
      return '';
    }
  });

  ipcMain.handle('set-api-key', async (event, key) => {
    try {
      const fs = require('fs');
      const path = require('path');
      const debugDir = path.join(require('os').homedir(), 'Library/Application Support/sync. extensions');
      const apiKeyFile = path.join(debugDir, 'api-key.txt');
      
      if (!fs.existsSync(debugDir)) {
        fs.mkdirSync(debugDir, { recursive: true });
      }
      
      fs.writeFileSync(apiKeyFile, key);
      debugLog('API key saved');
      return true;
    } catch (error) {
      debugLog('Error saving API key', { error: error.message });
      return false;
    }
  });

  // HTTP server for /nle/* endpoints
  const http = require('http');
  const url = require('url');
  
  const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true);
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
          res.writeHead(500);
          res.end(JSON.stringify({ ok: false, error: error.message }));
        }
        return;
      }
      
      if (pathname === '/nle/getProjectDir' && req.method === 'GET') {
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true, outputDir: path.join(require('os').homedir(), 'Documents', 'sync. outputs') }));
        return;
      }
      
      if (pathname === '/nle/exportInOutVideo' && req.method === 'POST') {
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true, outputPath: '/tmp/sync_output.mp4' }));
        return;
      }
      
      if (pathname === '/nle/exportInOutAudio' && req.method === 'POST') {
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true, outputPath: '/tmp/sync_output.wav' }));
        return;
      }
      
      if (pathname === '/nle/importFileToBin' && req.method === 'POST') {
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true }));
        return;
      }
      
      if (pathname === '/nle/insertFileAtPlayhead' && req.method === 'POST') {
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true }));
        return;
      }
      
      if (pathname === '/nle/revealFile' && req.method === 'POST') {
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true }));
        return;
      }
      
      if (pathname === '/nle/diagInOut' && req.method === 'GET') {
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true, projectName: 'Resolve Project' }));
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
  debugLog('Not running in Electron context - this is expected when launched by DaVinci Resolve');
}
