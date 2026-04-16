const { app, BrowserWindow, ipcMain, shell } = require('electron')
const path = require('path')
const fs = require('fs')
const { spawn } = require('child_process')

const TOOL_ROOT = path.join(__dirname, '..', 'Toolbelt')
const SPOOLER_APP_ROOT = path.join(TOOL_ROOT, 'Spooler')
const SPOOLER_VENV_PYTHON = path.join(SPOOLER_APP_ROOT, 'venv', 'bin', 'python')
const ALLOWED_TOOLS = new Set(['scrapetag', 'GHOSTstub', 'BlackBox', 'Spooler'])
const TOOL_README_URLS = Object.freeze({
  BlackBox: 'https://github.com/RosenthalMark/BuildGhost/blob/main/Toolbelt/BlackBox/README.md'
})
let activeToolProcess = null
let spoolerInstallProcess = null
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

function resolveSpoolerPython() {
  return fs.existsSync(SPOOLER_VENV_PYTHON) ? SPOOLER_VENV_PYTHON : 'python3'
}

function runCapture(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env || process.env,
      stdio: ['ignore', 'pipe', 'pipe']
    })

    let stdout = ''
    let stderr = ''
    let settled = false

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    child.on('error', (error) => {
      if (settled) return
      settled = true
      resolve({
        ok: false,
        code: -1,
        stdout,
        stderr,
        error: error.message
      })
    })

    child.on('close', (code) => {
      if (settled) return
      settled = true
      resolve({
        ok: code === 0,
        code: typeof code === 'number' ? code : 1,
        stdout,
        stderr,
        error: ''
      })
    })
  })
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
      // Side-effect entry so `node index.js` and GHOSTops launchTool both do visible work.
      const scaffold = [
        `'use strict'`,
        '',
        `console.log('[${toolName}] scaffold online — replace with module implementation.')`,
        `console.log('[${toolName}] entry: ${entryPath.replace(/'/g, "\\'")}')`,
        ''
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

ipcMain.handle('ghostops:open-tool-readme', async (_event, rawToolName) => {
  const toolName = sanitizeToolName(rawToolName)

  if (!toolName) {
    return {
      ok: false,
      error: 'invalid tool name'
    }
  }

  const readmeUrl = TOOL_README_URLS[toolName]
  if (!readmeUrl) {
    return {
      ok: false,
      error: `README URL not configured for tool: ${toolName}`
    }
  }

  const openError = await shell.openExternal(readmeUrl)
  if (openError) {
    return {
      ok: false,
      error: openError
    }
  }

  return {
    ok: true,
    url: readmeUrl
  }
})

ipcMain.handle('ghostops:spooler-health', async () => {
  if (!fs.existsSync(SPOOLER_APP_ROOT)) {
    return {
      ok: false,
      healthy: false,
      reason: 'spooler app folder missing',
      appRoot: SPOOLER_APP_ROOT
    }
  }

  const spoolerPython = resolveSpoolerPython()
  const probe = await runCapture(
    spoolerPython,
    ['-c', 'import streamlit, pandas; print("deps:ok")'],
    { cwd: SPOOLER_APP_ROOT, env: process.env }
  )

  if (probe.ok) {
    return {
      ok: true,
      healthy: true,
      reason: 'dependencies installed'
    }
  }

  const message = `${probe.stderr}\n${probe.stdout}`.trim()
  return {
    ok: false,
    healthy: false,
    reason: message || 'dependency check failed',
    installCommand: `cd ~/Desktop/REPOS/BuildGhost/Toolbelt/Spooler && ${spoolerPython} -m pip install -r requirements.txt`
  }
})

ipcMain.handle('ghostops:spooler-install-deps', async (event) => {
  if (!fs.existsSync(SPOOLER_APP_ROOT)) {
    return {
      ok: false,
      error: `missing app folder: ${SPOOLER_APP_ROOT}`
    }
  }

  const requirementsPath = path.join(SPOOLER_APP_ROOT, 'requirements.txt')
  if (!fs.existsSync(requirementsPath)) {
    return {
      ok: false,
      error: `requirements.txt missing: ${requirementsPath}`
    }
  }

  if (spoolerInstallProcess && !spoolerInstallProcess.killed) {
    return {
      ok: false,
      error: 'dependency install already running'
    }
  }

  const spoolerPython = resolveSpoolerPython()
  event.sender.send('tool-log', '[Spooler] installing dependencies from Toolbelt/Spooler/requirements.txt')

  return new Promise((resolve) => {
    spoolerInstallProcess = spawn(spoolerPython, ['-m', 'pip', 'install', '-r', 'requirements.txt'], {
      cwd: SPOOLER_APP_ROOT,
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1'
      },
      stdio: ['ignore', 'pipe', 'pipe']
    })

    const proc = spoolerInstallProcess

    proc.stdout.on('data', (chunk) => {
      event.sender.send('tool-log', `[Spooler] ${chunk.toString()}`)
    })

    proc.stderr.on('data', (chunk) => {
      event.sender.send('tool-log', `[Spooler] ${chunk.toString()}`)
    })

    proc.on('error', (error) => {
      event.sender.send('tool-log', `[Spooler] dependency install failed: ${error.message}`)
      if (spoolerInstallProcess === proc) {
        spoolerInstallProcess = null
      }
      resolve({
        ok: false,
        error: error.message
      })
    })

    proc.on('close', (code) => {
      event.sender.send('tool-log', `[Spooler] dependency install finished (code=${code})`)
      if (spoolerInstallProcess === proc) {
        spoolerInstallProcess = null
      }
      resolve({
        ok: code === 0,
        code: typeof code === 'number' ? code : 1,
        error: code === 0 ? '' : 'pip install failed'
      })
    })
  })
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
  const toolName = typeof data?.toolName === 'string' && data.toolName.trim() ? data.toolName.trim() : 'scrapetag'
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
