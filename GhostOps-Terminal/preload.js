const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('ghostOps', {
  checkTool: (toolName) => ipcRenderer.invoke('ghostops:check-tool', toolName),
  initializeTool: (toolName) => ipcRenderer.invoke('ghostops:initialize-tool', toolName),
  openToolReadme: (toolName) => ipcRenderer.invoke('ghostops:open-tool-readme', toolName),
  checkSpoolerHealth: () => ipcRenderer.invoke('ghostops:spooler-health'),
  installSpoolerDeps: () => ipcRenderer.invoke('ghostops:spooler-install-deps'),
  launchTool: (toolName) => ipcRenderer.send('launch-tool', toolName),
  captureSelector: (data) => ipcRenderer.send('scrape:capture-selector', data),
  onToolLog: (callback) => {
    const handler = (_event, line) => callback(line)
    ipcRenderer.on('tool-log', handler)
    return () => ipcRenderer.removeListener('tool-log', handler)
  }
})
