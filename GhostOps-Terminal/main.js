const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')
const { spawn } = require('child_process')

const TOOL_ROOT = path.join(__dirname, '..', 'Toolbelt')
const ALLOWED_TOOLS = new Set(['SCRAPEtag', 'GHOSTstub'])
let activeToolProcess = null
const currentSessionLogs = []

function renderLogStamp(rawIso) {
  const date = new Date(rawIso || Date.now())
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date
  return safeDate.toISOString().replace('T', ' ').slice(0, 19)
}

function stopActiveToolProcess(sender) {
  if (activeToolProcess && !activeToolProcess.killed) {
    if (sender) {
      sender.send('tool-log', `[system] stopping previous process (pid=${activeToolProcess.pid})`)
    }
    activeToolProcess.kill()
  }
  activeToolProcess = null
}

function sanitizeToolName(toolName) {
  return typeof toolName === 'string' && ALLOWED_TOOLS.has(toolName) ? toolName : null
}

function toolEntryPath(toolName) {
  return path.join(TOOL_ROOT, toolName, 'index.js')
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 1080,
    minHeight: 700,
    backgroundColor: '#0a0a0a',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      preload: path.join(__dirname, 'preload.js')
    }
  })

  win.loadFile(path.join(__dirname, 'index.html'))
}

ipcMain.handle('ghostops:check-tool', async (_event, rawToolName) => {
  const toolName = sanitizeToolName(rawToolName)

  if (!toolName) {
    return {
      found: false,
      expectedPath: '',
      entryPath: '',
      error: 'invalid tool name'
    }
  }

  const entryPath = toolEntryPath(toolName)
  return {
    found: fs.existsSync(entryPath),
    expectedPath: path.relative(__dirname, entryPath),
    entryPath
  }
})

ipcMain.handle('ghostops:initialize-tool', async (_event, rawToolName) => {
  const toolName = sanitizeToolName(rawToolName)

  if (!toolName) {
    return {
      ok: false,
      error: 'invalid tool name'
    }
  }

  const toolDir = path.join(TOOL_ROOT, toolName)
  const entryPath = toolEntryPath(toolName)

  try {
    if (!fs.existsSync(toolDir)) {
      fs.mkdirSync(toolDir, { recursive: true })
    }

    if (!fs.existsSync(entryPath)) {
      const scaffold = [
        `'use strict'`,
        '',
        'module.exports = {',
        `  id: '${toolName}',`,
        '  run: async () => {',
        `    return '${toolName} initialized'`,
        '  }',
        '}'
      ].join('\n')
      fs.writeFileSync(entryPath, `${scaffold}\n`, 'utf8')
    }

    return {
      ok: true,
      entryPath
    }
  } catch (error) {
    return {
      ok: false,
      error: error.message
    }
  }
})

ipcMain.on('launch-tool', (event, rawToolName) => {
  const toolName = sanitizeToolName(rawToolName)

  if (!toolName) {
    event.sender.send('tool-log', '[system] invalid tool name')
    return
  }

  const entryPath = toolEntryPath(toolName)
  if (!fs.existsSync(entryPath)) {
    event.sender.send('tool-log', `[system] entrypoint missing: ${entryPath}`)
    return
  }

  stopActiveToolProcess(event.sender)
  event.sender.send('tool-log', `[system] launching ${toolName} at ${entryPath}`)

  activeToolProcess = spawn(process.execPath, [entryPath], {
    cwd: path.dirname(entryPath),
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1'
    }
  })
  const launchedProcess = activeToolProcess
  event.sender.send('tool-log', `[system] process started (pid=${launchedProcess.pid})`)

  launchedProcess.stdout.on('data', (chunk) => {
    event.sender.send('tool-log', chunk.toString())
  })

  launchedProcess.stderr.on('data', (chunk) => {
    event.sender.send('tool-log', chunk.toString())
  })

  launchedProcess.on('close', (code, signal) => {
    event.sender.send('tool-log', `[system] process closed (code=${code}, signal=${signal || 'none'})`)
    if (activeToolProcess === launchedProcess) {
      activeToolProcess = null
    }
  })

  launchedProcess.on('error', (error) => {
    event.sender.send('tool-log', `[system] failed to launch: ${error.message}`)
  })
})

ipcMain.on('scrape:capture-selector', (event, data) => {
  const alias = typeof data?.alias === 'string' ? data.alias.trim() : ''
  const selector = typeof data?.selector === 'string' ? data.selector.trim() : ''
  const toolName = typeof data?.toolName === 'string' && data.toolName.trim() ? data.toolName.trim() : 'SCRAPEtag'
  const timestamp = typeof data?.timestamp === 'string' && data.timestamp.trim() ? data.timestamp.trim() : new Date().toISOString()

  if (!alias || !selector) {
    return
  }

  currentSessionLogs.push({
    timestamp,
    tool: toolName,
    type: 'selector',
    alias,
    selector
  })

  event.sender.send('tool-log', `[${renderLogStamp(timestamp)}] [CAPTURED] ${alias} -> ${selector}`)
})

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  stopActiveToolProcess()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
