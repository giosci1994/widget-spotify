// Preload della card: comandi di riproduzione, login e notifiche dal main.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('spotify', {
  control: (action, payload) => ipcRenderer.invoke('control', action, payload),
  onPlayback: (cb) => ipcRenderer.on('playback', (_e, data) => cb(data)),
  onAuthState: (cb) => ipcRenderer.on('auth-state', (_e, data) => cb(data)),
  onAuthUrl: (cb) => ipcRenderer.on('auth-url', (_e, data) => cb(data)),
  onError: (cb) => ipcRenderer.on('error', (_e, data) => cb(data)),
  setClientId: (clientId) => ipcRenderer.invoke('set-client-id', clientId),
  onSettings: (cb) => ipcRenderer.on('settings', (_e, data) => cb(data)),
});
