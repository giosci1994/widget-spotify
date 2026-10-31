// Preload della finestra Impostazioni: espone solo lettura/salvataggio delle
// impostazioni, non i comandi di riproduzione o di login.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('settingsApi', {
  get: () => ipcRenderer.invoke('get-settings'),
  save: (patch) => ipcRenderer.invoke('save-settings', patch),
  close: () => ipcRenderer.invoke('close-settings'),
});
