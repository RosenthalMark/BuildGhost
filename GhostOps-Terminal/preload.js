const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('ghostOps', {
  checkTool: (toolName) => ipcRenderer.invoke('ghostops:check-tool', toolName),
  initializeTool: (toolName) => ipcRenderer.invoke('ghostops:initialize-tool', toolName),
  launchTool: (toolName) => ipcRenderer.send('launch-tool', toolName),
  captureSelector: (data) => ipcRenderer.send('scrape:capture-selector', data),
  onToolLog: (callback) => {
    const handler = (_event, line) => callback(line)
    ipcRenderer.on('tool-log', handler)
    return () => ipcRenderer.removeListener('tool-log', handler)
  }
})
