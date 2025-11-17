// NLE adapter for DaVinci Resolve
// HTTP-based adapter that mirrors useNLE.ts interface but uses fetch instead of CSInterface

declare global {
  interface Window {
    nle: {
      getHostId: () => string;
      loadHostScript: () => Promise<{ ok: boolean }>;
      startBackend: () => Promise<any>;
      getProjectDir: () => Promise<any>;
      exportInOutVideo: (opts?: any) => Promise<any>;
      exportInOutAudio: (opts?: any) => Promise<any>;
      importFileToBin: (fsPath: string, binName?: string) => Promise<any>;
      insertFileAtPlayhead: (fsPath: string) => Promise<any>;
      revealFile: (fsPath: string) => Promise<any>;
      diagInOut: () => Promise<any>;
    };
    electronAPI?: {
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
  const BASE = 'http://127.0.0.1:45790';
  const DEBUG_BASE = 'http://127.0.0.1:3000'; // Server debug endpoint
  
  // Debug logging helper - per debug.md: only writes when logs/.debug flag exists
  function debugLog(message: string, data?: any): void {
    try {
      // Also output to console
      console.log(`[resolve] ${message}`, data || '');
      
      fetch(`${DEBUG_BASE}/debug`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `[resolve] ${message}`,
          data,
          timestamp: new Date().toISOString(),
          hostConfig: { hostId: 'RESOLVE' }
        })
      }).catch(() => {});
    } catch (_) {}
  }
  
  function debugError(message: string, error?: any): void {
    try {
      // Also output to console
      console.error(`[resolve] ERROR: ${message}`, error || '');
      
      fetch(`${DEBUG_BASE}/debug`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `[resolve] ERROR: ${message}`,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          timestamp: new Date().toISOString(),
          hostConfig: { hostId: 'RESOLVE' }
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

  // Electron dialog for file picker using preload API
  async function showFileDialog(options: any): Promise<string | null> {
    console.log('[resolve] showFileDialog called', { hasElectronAPI: !!window.electronAPI });
    debugLog('showFileDialog called', { hasElectronAPI: !!window.electronAPI });
    
    // Wait for electronAPI to be available (might load after this script)
    let retries = 10;
    while (!window.electronAPI && retries > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
      retries--;
    }
    
    console.log('[resolve] After waiting for electronAPI:', { hasElectronAPI: !!window.electronAPI, retries });
    
    if (!window.electronAPI) {
      console.error('[resolve] electronAPI not available after retries');
      debugError('File dialog not available - electronAPI not loaded after retries');
      return null;
    }
    
    if (!window.electronAPI.showOpenDialog) {
      console.error('[resolve] showOpenDialog method missing', { 
        electronAPI: !!window.electronAPI,
        methods: Object.keys(window.electronAPI || {})
      });
      debugError('File dialog not available - showOpenDialog method missing', { 
        electronAPI: !!window.electronAPI,
        methods: Object.keys(window.electronAPI || {})
      });
      return null;
    }
    
    try {
      console.log('[resolve] Calling showOpenDialog', { options });
      debugLog('Calling showOpenDialog', { options });
      const result = await window.electronAPI.showOpenDialog(options);
      console.log('[resolve] showOpenDialog result', { canceled: result?.canceled, fileCount: result?.filePaths?.length || 0 });
      debugLog('showOpenDialog result', { result, canceled: result?.canceled, fileCount: result?.filePaths?.length || 0 });
      
      // Validate result structure
      if (!result || typeof result !== 'object') {
        debugError('Invalid file dialog response format', { result, resultType: typeof result });
        return null;
      }
      if (result.canceled === true) {
        debugLog('User cancelled file dialog');
        return null; // User cancelled
      }
      if (result.filePaths && Array.isArray(result.filePaths) && result.filePaths.length > 0) {
        const filePath = result.filePaths[0];
        if (typeof filePath === 'string' && filePath.trim() !== '') {
          debugLog('File selected', { filePath });
          return filePath;
        }
        debugError('Invalid file path in result', { filePath, filePathType: typeof filePath });
      } else {
        debugError('No file paths in result', { result });
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
    getHostId: function(): string { return 'RESOLVE'; },
    loadHostScript: async function(): Promise<{ ok: boolean }> { return { ok: true }; },
    startBackend: function(): Promise<any> { return jsonPost('/nle/startBackend', {}); },
    getProjectDir: function(): Promise<any> { return jsonGet('/nle/getProjectDir'); },
    exportInOutVideo: function(opts?: any): Promise<any> { return jsonPost('/nle/exportInOutVideo', opts || {}); },
    exportInOutAudio: function(opts?: any): Promise<any> { return jsonPost('/nle/exportInOutAudio', opts || {}); },
    importFileToBin: function(fsPath: string, binName?: string): Promise<any> { return jsonPost('/nle/importFileToBin', { path: fsPath, binName: binName || '' }); },
    insertFileAtPlayhead: function(fsPath: string): Promise<any> { return jsonPost('/nle/insertFileAtPlayhead', { path: fsPath }); },
    revealFile: function(fsPath: string): Promise<any> { return jsonPost('/nle/revealFile', { path: fsPath }); },
    diagInOut: function(): Promise<any> { return jsonGet('/nle/diagInOut'); }
  };

  // File picker functions for upload buttons
  window.selectVideo = async function(): Promise<string | null> {
    try {
      console.log('[resolve] selectVideo called');
      debugLog('selectVideo called');
      
      const filePath = await showFileDialog({
        properties: ['openFile'],
        filters: [
          { name: 'Video Files', extensions: ['mp4', 'mov', 'mxf', 'mkv', 'avi', 'm4v', 'mpg', 'mpeg'] }
        ]
      });
      
      console.log('[resolve] selectVideo got result:', filePath);
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
      console.error('[resolve] Error selecting video:', err);
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

  // API key persistence using Electron's storage
  window.getApiKey = function(): string {
    try {
      if (window.electronAPI && window.electronAPI.getApiKey) {
        return window.electronAPI.getApiKey() as any;
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
      if (window.electronAPI && window.electronAPI.setApiKey) {
        window.electronAPI.setApiKey(key);
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

