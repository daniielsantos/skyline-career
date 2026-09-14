/**
 * Preload bridge for Career UI ↔ Electron main (auto-update + version + play mode).
 * CommonJS so Electron can load it regardless of package "type": "module".
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('skylineDesktop', {
  isDesktop: true,
  getVersion: () => ipcRenderer.invoke('skyline:get-version'),
  getPlayConfig: () => ipcRenderer.invoke('skyline:get-play-config'),
  setPlayMode: (payload) => ipcRenderer.invoke('skyline:set-play-mode', payload),
  openExternal: (url) => ipcRenderer.invoke('skyline:open-external', url),
  checkForUpdates: () => ipcRenderer.invoke('skyline:check-updates'),
  downloadUpdate: () => ipcRenderer.invoke('skyline:download-update'),
  quitAndInstall: () => ipcRenderer.invoke('skyline:quit-and-install'),
  onUpdateEvent: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const handler = (_event, payload) => {
      callback(payload);
    };
    ipcRenderer.on('skyline:update', handler);
    return () => {
      ipcRenderer.removeListener('skyline:update', handler);
    };
  },
});
