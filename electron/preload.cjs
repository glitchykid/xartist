const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktop', {
  open: () => ipcRenderer.invoke('open-project'),
  save: (payload) => ipcRenderer.invoke('save-file', payload),
  state: (payload) => ipcRenderer.invoke('state', payload),
  closeSaved: () => ipcRenderer.invoke('close-saved'),
  onSaveClose: (callback) => ipcRenderer.on('save-before-close', () => callback()),
});
