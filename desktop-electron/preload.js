const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('chidoDesktop', {
  isDesktopShell: true,
  setActiveProject: (ctx) => ipcRenderer.invoke('chido:set-active-project', ctx),
  openBrowserTab: (payload) => ipcRenderer.invoke('chido:open-browser-tab', payload),
  toggleDevTools: (tabId) => ipcRenderer.invoke('chido:toggle-devtools', tabId),
  captureRegion: (payload) => ipcRenderer.invoke('chido:capture-region', payload),
  launchBlender: (payload) => ipcRenderer.invoke('chido:launch-blender', payload),
  onDownloadProgress: (cb) => ipcRenderer.on('chido:download-progress', (_, data) => cb(data)),
  onDownloadComplete: (cb) => ipcRenderer.on('chido:download-complete', (_, data) => cb(data)),
  onScriptError: (cb) => ipcRenderer.on('chido:script-error', (_, data) => cb(data)),
});
