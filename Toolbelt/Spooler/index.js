'use strict'

const path = require('path')
const fs = require('fs')
const { spawn } = require('child_process')

const REPO_ROOT = path.resolve(__dirname, '..', '..')
const SPOOLER_APP_DIR = path.join(REPO_ROOT, 'Toolbelt', 'Spooler')
const SPOOLER_VENV_PYTHON = path.join(SPOOLER_APP_DIR, 'venv', 'bin', 'python')
const SPOOLER_PORT = process.env.SPOOLER_PORT || '8512'
const SPOOLER_URL = `http://127.0.0.1:${SPOOLER_PORT}`

function resolveSpoolerPython() {
  return fs.existsSync(SPOOLER_VENV_PYTHON) ? SPOOLER_VENV_PYTHON : 'python3'
}

function run() {
  const spoolerPython = resolveSpoolerPython()
  console.log(`[Spooler] bootstrapping streamlit harness from ${SPOOLER_APP_DIR}`)
  console.log(`[Spooler] using interpreter ${spoolerPython}`)
  console.log(`[Spooler] tactical stage target URL: ${SPOOLER_URL}`)

  const child = spawn(
    spoolerPython,
    [
      '-m',
      'streamlit',
      'run',
      'app.py',
      '--server.port',
      String(SPOOLER_PORT),
      '--server.headless',
      'true',
      '--browser.gatherUsageStats',
      'false'
    ],
    {
      cwd: SPOOLER_APP_DIR,
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1'
      },
      stdio: ['ignore', 'pipe', 'pipe']
    }
  )

  child.stdout.on('data', (chunk) => {
    process.stdout.write(`[Spooler] ${chunk.toString()}`)
  })

  child.stderr.on('data', (chunk) => {
    process.stderr.write(`[Spooler] ${chunk.toString()}`)
  })

  child.on('error', (error) => {
    console.error(`[Spooler] failed to launch streamlit: ${error.message}`)
    process.exit(1)
  })

  child.on('close', (code, signal) => {
    console.log(`[Spooler] streamlit exited (code=${code}, signal=${signal || 'none'})`)
    process.exit(code || 0)
  })

  const shutdown = () => {
    if (!child.killed) {
      child.kill('SIGTERM')
    }
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

run()
