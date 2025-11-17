// Preload script for Electron
// Exposes safe APIs to the renderer process

import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  showOpenDialog: (options: Electron.OpenDialogOptions) => ipcRenderer.invoke('show-open-dialog', options),
  getApiKey: () => ipcRenderer.invoke('get-api-key'),
  setApiKey: (key: string) => ipcRenderer.invoke('set-api-key', key),
  getUserDataPath: () => ipcRenderer.invoke('get-user-data-path'),
  // File operations for thumbnails
  ensureDir: (dirPath: string) => ipcRenderer.invoke('ensure-dir', dirPath),
  fileExists: (filePath: string) => ipcRenderer.invoke('file-exists', filePath),
  readThumbnail: (filePath: string) => ipcRenderer.invoke('read-thumbnail', filePath),
  saveThumbnail: (filePath: string, dataUrl: string) => ipcRenderer.invoke('save-thumbnail', filePath, dataUrl)
});

