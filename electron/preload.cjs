// electron/preload.cjs

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  savePdf: (payload) => ipcRenderer.invoke('pdf:save', payload),
  saveTemplate: (data) => ipcRenderer.invoke('template:save', data),
  loadTemplate: () => ipcRenderer.invoke('template:load'),
  loadCatalogFile: () => ipcRenderer.invoke('catalog:load'),
  
  db: {
      new: () => ipcRenderer.invoke('db:new'),
      open: () => ipcRenderer.invoke('db:open'),
      saveAs: () => ipcRenderer.invoke('db:saveAs'),
      getData: (cufe) => ipcRenderer.invoke('db:getData', cufe),
      saveData: (payload) => ipcRenderer.invoke('db:saveData', payload),
  },
  
});