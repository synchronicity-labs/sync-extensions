(function(){
  const BASE = 'http://127.0.0.1:45790';
  async function jsonPost(path, body){
    try {
      const res = await fetch(BASE + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {})
      });
      return res.json();
    } catch (error) {
      console.error('Fetch error:', error);
      return { ok: false, error: error.message };
    }
  }
  async function jsonGet(path){
    try {
      const res = await fetch(BASE + path);
      return res.json();
    } catch (error) {
      console.error('Fetch error:', error);
      return { ok: false, error: error.message };
    }
  }

  // Electron dialog for file picker using preload API
  async function showFileDialog(options) {
    if (window.electronAPI && window.electronAPI.showOpenDialog) {
      try {
        const result = await window.electronAPI.showOpenDialog(options);
        return result.canceled ? null : result.filePaths[0];
      } catch (error) {
        console.error('Error opening file dialog:', error);
        return null;
      }
    }
    
    // Fallback to HTML5 file input
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.style.display = 'none';
      
      if (options.filters && options.filters.length > 0) {
        const extensions = options.filters[0].extensions;
        input.accept = extensions.map(ext => `.${ext}`).join(',');
      }
      
      input.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
          resolve(file.path || file.name);
        } else {
          resolve(null);
        }
        document.body.removeChild(input);
      };
      
      input.oncancel = () => {
        resolve(null);
        document.body.removeChild(input);
      };
      
      document.body.appendChild(input);
      input.click();
    });
  }

  window.nle = {
    getHostId: function(){ return 'RESOLVE'; },
    loadHostScript: async function(){ return { ok: true }; },
    startBackend: function(){ return jsonPost('/nle/startBackend', {}); },
    getProjectDir: function(){ return jsonGet('/nle/getProjectDir'); },
    exportInOutVideo: function(opts){ return jsonPost('/nle/exportInOutVideo', opts || {}); },
    exportInOutAudio: function(opts){ return jsonPost('/nle/exportInOutAudio', opts || {}); },
    importFileToBin: function(path, binName){ return jsonPost('/nle/importFileToBin', { path, binName }); },
    insertFileAtPlayhead: function(path){ return jsonPost('/nle/insertFileAtPlayhead', { path }); },
    revealFile: function(path){ return jsonPost('/nle/revealFile', { path }); },
    diagInOut: function(){ return jsonGet('/nle/diagInOut'); }
  };

  // File picker functions for upload buttons
  window.selectVideo = async function() {
    try {
      const filePath = await showFileDialog({
        properties: ['openFile'],
        filters: [
          { name: 'Video Files', extensions: ['mp4', 'mov', 'mxf', 'mkv', 'avi', 'm4v', 'mpg', 'mpeg'] }
        ]
      });
      if (filePath) {
        window.selectedVideo = filePath;
        console.log('Video selected:', filePath);
        
        // Update UI status
        if (typeof window.updateInputStatus === 'function') {
          window.updateInputStatus('video', filePath);
        } else {
          // Fallback: manually update UI elements
          const videoStatusEl = document.querySelector('.video-status');
          if (videoStatusEl) {
            videoStatusEl.textContent = `Selected: ${filePath.split('/').pop()}`;
          }
          
          // Update upload text
          const videoUploadText = document.querySelector('.video-upload .upload-text');
          if (videoUploadText) {
            videoUploadText.textContent = `Selected: ${filePath.split('/').pop()}`;
          }
        }
        
        // Trigger any video processing
        if (typeof window.loadVideoFile === 'function') {
          window.loadVideoFile(filePath);
        }
        
        return filePath;
      }
    } catch (error) {
      console.error('Error selecting video:', error);
    }
    return null;
  };

  window.selectAudio = async function() {
    try {
      const filePath = await showFileDialog({
        properties: ['openFile'],
        filters: [
          { name: 'Audio Files', extensions: ['wav', 'mp3', 'aac', 'aif', 'aiff', 'm4a'] }
        ]
      });
      if (filePath) {
        window.selectedAudio = filePath;
        console.log('Audio selected:', filePath);
        
        // Update UI status
        if (typeof window.updateInputStatus === 'function') {
          window.updateInputStatus('audio', filePath);
        } else {
          // Fallback: manually update UI elements
          const audioStatusEl = document.querySelector('.audio-status');
          if (audioStatusEl) {
            audioStatusEl.textContent = `Selected: ${filePath.split('/').pop()}`;
          }
          
          // Update upload text
          const audioUploadText = document.querySelector('.audio-upload .upload-text');
          if (audioUploadText) {
            audioUploadText.textContent = `Selected: ${filePath.split('/').pop()}`;
          }
        }
        
        // Trigger any audio processing
        if (typeof window.loadAudioFile === 'function') {
          window.loadAudioFile(filePath);
        }
        
        return filePath;
      }
    } catch (error) {
      console.error('Error selecting audio:', error);
    }
    return null;
  };

  // Debug logging for Resolve
  function debugLog(message, data = {}) {
    try {
      const fs = require('fs');
      const path = require('path');
      const debugDir = path.join(require('os').homedir(), 'Library/Application Support/sync. extensions/logs');
      const debugFile = path.join(debugDir, 'sync_resolve_debug.log');
      
      // Ensure debug directory exists
      if (!fs.existsSync(debugDir)) {
        fs.mkdirSync(debugDir, { recursive: true });
      }
      
      // Enable debug logging
      const debugEnabledFile = path.join(debugDir, 'debug.enabled');
      if (!fs.existsSync(debugEnabledFile)) {
        fs.writeFileSync(debugEnabledFile, '');
      }
      
      const logEntry = `[${new Date().toISOString()}] ${message} ${JSON.stringify(data)}\n`;
      fs.appendFileSync(debugFile, logEntry);
    } catch (error) {
      console.error('Debug logging error:', error);
    }
  }

  // Expose debug logging globally
  window.debugLog = debugLog;

  // API key persistence using Electron's storage
  window.getApiKey = function() {
    try {
      if (window.electronAPI && window.electronAPI.getApiKey) {
        return window.electronAPI.getApiKey();
      }
      // Fallback to localStorage
      return localStorage.getItem('apiKey') || '';
    } catch (error) {
      console.error('Error getting API key:', error);
      return '';
    }
  };

  window.setApiKey = function(key) {
    try {
      if (window.electronAPI && window.electronAPI.setApiKey) {
        window.electronAPI.setApiKey(key);
      } else {
        // Fallback to localStorage
        localStorage.setItem('apiKey', key);
      }
      console.log('API key saved');
    } catch (error) {
      console.error('Error saving API key:', error);
    }
  };

  // Override localStorage to use Electron storage for API keys
  const originalSetItem = localStorage.setItem;
  const originalGetItem = localStorage.getItem;
  
  localStorage.setItem = function(key, value) {
    if (key === 'syncSettings') {
      try {
        const settings = JSON.parse(value);
        if (settings.syncApiKey && window.electronAPI && window.electronAPI.setApiKey) {
          window.electronAPI.setApiKey(settings.syncApiKey);
        }
      } catch (e) {
        console.error('Error parsing syncSettings:', e);
      }
    }
    return originalSetItem.call(this, key, value);
  };
  
  localStorage.getItem = function(key) {
    if (key === 'syncSettings') {
      try {
        const settings = JSON.parse(originalGetItem.call(this, key) || '{}');
        if (window.electronAPI && window.electronAPI.getApiKey) {
          const electronApiKey = window.electronAPI.getApiKey();
          if (electronApiKey) {
            settings.syncApiKey = electronApiKey;
            return JSON.stringify(settings);
          }
        }
      } catch (e) {
        console.error('Error handling syncSettings:', e);
      }
    }
    return originalGetItem.call(this, key);
  };

  // Initialize API key on load
  document.addEventListener('DOMContentLoaded', function() {
    // Wait a bit for the UI to load
    setTimeout(() => {
      if (window.electronAPI && window.electronAPI.getApiKey) {
        const apiKey = window.electronAPI.getApiKey();
        if (apiKey) {
          const syncApiKeyInput = document.getElementById('syncApiKey');
          if (syncApiKeyInput && !syncApiKeyInput.value) {
            syncApiKeyInput.value = apiKey;
            // Trigger the input event to save it
            syncApiKeyInput.dispatchEvent(new Event('input'));
          }
        }
      }
    }, 1000);
  });
})();
