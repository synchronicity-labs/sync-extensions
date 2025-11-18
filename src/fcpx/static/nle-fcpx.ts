// NLE adapter for Final Cut Pro
// HTTP-based adapter that mirrors useNLE.ts interface but uses fetch instead of CSInterface
// FCPX Workflow Extensions run in a web view and can use JavaScript APIs

declare global {
  interface Window {
    nle: {
      getHostId: () => string;
      loadHostScript: () => Promise<{ ok: boolean }>;
      startBackend: () => Promise<any>;
      stopBackend: () => Promise<any>;
      getProjectDir: () => Promise<any>;
      exportInOutVideo: (opts?: any) => Promise<any>;
      exportInOutAudio: (opts?: any) => Promise<any>;
      importFileToBin: (fsPath: string, binName?: string) => Promise<any>;
      importIntoBin: (jobId: string) => Promise<any>;
      insertFileAtPlayhead: (fsPath: string) => Promise<any>;
      insertAtPlayhead: (jobId: string) => Promise<any>;
      revealFile: (fsPath: string) => Promise<any>;
      diagInOut: () => Promise<any>;
      diag: () => Promise<any>;
      showFileDialog: (options: any) => Promise<any>;
      ensureDir: (dirPath: string) => Promise<any>;
      fileExists: (filePath: string) => Promise<any>;
      readThumbnail: (filePath: string) => Promise<any>;
      saveThumbnail: (filePath: string, dataUrl: string) => Promise<any>;
    };
    fcpxAPI?: {
      showOpenDialog: (options: any) => Promise<any>;
      getApiKey: () => Promise<string>;
      setApiKey: (key: string) => Promise<void>;
    };
    selectedVideo?: string;
    selectedAudio?: string;
    updateInputStatus?: (type: string, path: string) => void;
    loadVideoFile?: (path: string) => void;
    loadAudioFile?: (path: string) => void;
    selectVideo: () => Promise<string | null>;
    selectAudio: () => Promise<string | null>;
    getApiKey: () => string;
    setApiKey: (key: string) => void;
  }
}

(function(){
  const BASE = 'http://127.0.0.1:45791'; // Different port from Resolve to avoid conflicts
  const DEBUG_BASE = 'http://127.0.0.1:3000'; // Server debug endpoint
  
  // Debug logging helper - per debug.md: only writes when logs/.debug flag exists
  function debugLog(message: string, data?: any): void {
    try {
      // Also output to console
      console.log(`[fcpx] ${message}`, data || '');
      
      fetch(`${DEBUG_BASE}/debug`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `[fcpx] ${message}`,
          data,
          timestamp: new Date().toISOString(),
          hostConfig: { hostId: 'FCPX' }
        })
      }).catch(() => {});
    } catch (_) {}
  }
  
  function debugError(message: string, error?: any): void {
    try {
      // Also output to console
      console.error(`[fcpx] ERROR: ${message}`, error || '');
      
      fetch(`${DEBUG_BASE}/debug`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `[fcpx] ERROR: ${message}`,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          timestamp: new Date().toISOString(),
          hostConfig: { hostId: 'FCPX' }
        })
      }).catch(() => {});
    } catch (_) {}
  }
  
  async function jsonPost(path: string, body?: any): Promise<any> {
    try {
      const res = await fetch(BASE + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {})
      });
      
      if (!res.ok) {
        const text = await res.text();
        debugError('HTTP error', { status: res.status, statusText: res.statusText, text });
        try {
          const json = JSON.parse(text);
          return json;
        } catch {
          return { ok: false, error: `HTTP ${res.status}: ${text || res.statusText}` };
        }
      }
      
      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await res.text();
        debugError('Non-JSON response', { contentType, text: text.substring(0, 200) });
        return { ok: false, error: `Invalid response format: ${contentType}` };
      }
      
      const json = await res.json();
      if (!json || typeof json !== 'object') {
        debugError('Invalid JSON response', { json });
        return { ok: false, error: 'Invalid response format' };
      }
      
      return json;
    } catch (error) {
      const err = error as Error;
      debugError('Fetch error', err);
      return { ok: false, error: err.message };
    }
  }
  
  async function jsonGet(path: string): Promise<any> {
    try {
      const res = await fetch(BASE + path);
      
      if (!res.ok) {
        const text = await res.text();
        debugError('HTTP error', { status: res.status, statusText: res.statusText, text });
        try {
          const json = JSON.parse(text);
          return json;
        } catch {
          return { ok: false, error: `HTTP ${res.status}: ${text || res.statusText}` };
        }
      }
      
      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await res.text();
        debugError('Non-JSON response', { contentType, text: text.substring(0, 200) });
        return { ok: false, error: `Invalid response format: ${contentType}` };
      }
      
      const json = await res.json();
      if (!json || typeof json !== 'object') {
        debugError('Invalid JSON response', { json });
        return { ok: false, error: 'Invalid response format' };
      }
      
      return json;
    } catch (error) {
      const err = error as Error;
      debugError('Fetch error', err);
      return { ok: false, error: err.message };
    }
  }

  // File dialog for FCPX - uses native HTML5 input or FCPX API if available
  async function showFileDialog(options: any): Promise<string | null> {
    console.log('[fcpx] showFileDialog called', { hasFcpxAPI: !!window.fcpxAPI });
    debugLog('showFileDialog called', { hasFcpxAPI: !!window.fcpxAPI });
    
    // Try FCPX API first if available
    if (window.fcpxAPI && window.fcpxAPI.showOpenDialog) {
      try {
        const result = await window.fcpxAPI.showOpenDialog(options);
        if (result && !result.canceled && result.filePaths && result.filePaths.length > 0) {
          return result.filePaths[0];
        }
        return null;
      } catch (error) {
        debugError('Error using FCPX API for file dialog', error);
      }
    }
    
    // Fallback: Use HTTP endpoint
    try {
      const result = await jsonPost('/nle/showFileDialog', options);
      if (result && result.ok && result.filePaths && result.filePaths.length > 0) {
        return result.filePaths[0];
      }
      return null;
    } catch (error) {
      const err = error as Error;
      debugError('Error opening file dialog', { error: err.message, stack: err.stack });
      return null;
    }
  }

  // NLE methods matching useNLE.ts interface
  window.nle = {
    getHostId: function(): string { return 'FCPX'; },
    loadHostScript: async function(): Promise<{ ok: boolean }> { return { ok: true }; },
    startBackend: function(): Promise<any> { return jsonPost('/nle/startBackend', {}); },
    stopBackend: function(): Promise<any> { return jsonPost('/nle/stopBackend', {}); },
    getProjectDir: function(): Promise<any> { return jsonGet('/nle/getProjectDir'); },
    exportInOutVideo: function(opts?: any): Promise<any> { return jsonPost('/nle/exportInOutVideo', opts || {}); },
    exportInOutAudio: function(opts?: any): Promise<any> { return jsonPost('/nle/exportInOutAudio', opts || {}); },
    importFileToBin: function(fsPath: string, binName?: string): Promise<any> { return jsonPost('/nle/importFileToBin', { path: fsPath, binName: binName || '' }); },
    importIntoBin: function(jobId: string): Promise<any> { return jsonPost('/nle/importIntoBin', { jobId }); },
    insertFileAtPlayhead: function(fsPath: string): Promise<any> { return jsonPost('/nle/insertFileAtPlayhead', { path: fsPath }); },
    insertAtPlayhead: function(jobId: string): Promise<any> { return jsonPost('/nle/insertAtPlayhead', { jobId }); },
    revealFile: function(fsPath: string): Promise<any> { return jsonPost('/nle/revealFile', { path: fsPath }); },
    diagInOut: function(): Promise<any> { return jsonGet('/nle/diagInOut'); },
    diag: function(): Promise<any> { return jsonGet('/nle/diag'); },
    showFileDialog: function(options: any): Promise<any> { return jsonPost('/nle/showFileDialog', options); },
    ensureDir: function(dirPath: string): Promise<any> { return jsonPost('/nle/ensureDir', { path: dirPath }); },
    fileExists: function(filePath: string): Promise<any> { return jsonPost('/nle/fileExists', { path: filePath }); },
    readThumbnail: function(filePath: string): Promise<any> { return jsonPost('/nle/readThumbnail', { path: filePath }); },
    saveThumbnail: function(filePath: string, dataUrl: string): Promise<any> { return jsonPost('/nle/saveThumbnail', { path: filePath, dataUrl }); }
  };

  // File picker functions for upload buttons
  window.selectVideo = async function(): Promise<string | null> {
    try {
      console.log('[fcpx] selectVideo called');
      debugLog('selectVideo called');
      
      const filePath = await showFileDialog({
        properties: ['openFile'],
        filters: [
          { name: 'Video Files', extensions: ['mp4', 'mov', 'mxf', 'mkv', 'avi', 'm4v', 'mpg', 'mpeg'] }
        ]
      });
      
      console.log('[fcpx] selectVideo got result:', filePath);
      debugLog('selectVideo got result', { filePath: filePath ? 'path provided' : 'null' });
      
      // Ensure we always return a string or null, never an error object
      if (filePath && typeof filePath === 'string' && filePath.trim() !== '') {
        window.selectedVideo = filePath;
        debugLog('Video selected', { filePath });
        
        if (typeof window.updateInputStatus === 'function') {
          window.updateInputStatus('video', filePath);
        }
        
        if (typeof window.loadVideoFile === 'function') {
          window.loadVideoFile(filePath);
        }
        
        return filePath;
      }
      debugLog('No video file selected or path is empty', { filePath });
      return null;
    } catch (error) {
      const err = error as Error;
      console.error('[fcpx] Error selecting video:', err);
      debugError('Error selecting video', err);
      return null;
    }
  };

  window.selectAudio = async function(): Promise<string | null> {
    try {
      const filePath = await showFileDialog({
        properties: ['openFile'],
        filters: [
          { name: 'Audio Files', extensions: ['wav', 'mp3', 'aac', 'aif', 'aiff', 'm4a'] }
        ]
      });
      // Ensure we always return a string or null, never an error object
      if (filePath && typeof filePath === 'string' && filePath.trim() !== '') {
        window.selectedAudio = filePath;
        debugLog('Audio selected', { filePath });
        
        if (typeof window.updateInputStatus === 'function') {
          window.updateInputStatus('audio', filePath);
        }
        
        if (typeof window.loadAudioFile === 'function') {
          window.loadAudioFile(filePath);
        }
        
        return filePath;
      }
      debugLog('No audio file selected or path is empty', { filePath });
      return null;
    } catch (error) {
      const err = error as Error;
      debugError('Error selecting audio', err);
      return null;
    }
  };

  // API key persistence using localStorage (FCPX extensions can use localStorage)
  window.getApiKey = function(): string {
    try {
      if (window.fcpxAPI && window.fcpxAPI.getApiKey) {
        return window.fcpxAPI.getApiKey() as any;
      }
      return localStorage.getItem('apiKey') || '';
    } catch (error) {
      const err = error as Error;
      debugError('Error getting API key', err);
      return '';
    }
  };

  window.setApiKey = function(key: string): void {
    try {
      if (window.fcpxAPI && window.fcpxAPI.setApiKey) {
        window.fcpxAPI.setApiKey(key);
      } else {
        localStorage.setItem('apiKey', key);
      }
      debugLog('API key saved');
    } catch (error) {
      const err = error as Error;
      debugError('Error saving API key', err);
    }
  };
})();

