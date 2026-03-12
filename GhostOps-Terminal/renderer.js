import { playBootSequence } from './src/services/bootManager.js'

const stageTitle = document.getElementById('stage-title')
const stageChip = document.getElementById('stage-chip')
const stageContent = document.getElementById('stage-content')
const pollingStatus = document.getElementById('polling-status')
const selectedStatus = document.getElementById('selected-status')
const toolHealth = document.getElementById('tool-health')
const navItems = Array.from(document.querySelectorAll('.nav-item'))
const introVid = document.getElementById('intro-vid')
const staticLogo = document.getElementById('static-logo')

if (introVid && staticLogo) {
  const showStaticLogo = () => {
    introVid.style.display = 'none'
    staticLogo.style.display = 'block'
  }

  introVid.addEventListener('ended', () => {
    showStaticLogo()
  })

  introVid.addEventListener('error', () => {
    showStaticLogo()
  })

  introVid.addEventListener('abort', () => {
    showStaticLogo()
  })
}

const POLL_INTERVAL_MS = 2500
let activeRoute = 'tool'
let activeTool = 'SCRAPEtag'
let lastCapturedAlias = ''
let pollTimer = null
let terminalLogNode = null
let unsubscribeToolLog = null
let currentStageSignature = ''
const terminalLogBuffer = []
const MAX_TERMINAL_LINES = 500
const toolCache = new Map()
let selectorCaptureBridgeBound = false
let lastCaptureFingerprint = ''
let lastCaptureAt = 0

const toolConfig = {
  SCRAPEtag: {
    preview: 'assets/previews/scrapetag.gif',
    description: 'SCRAPEtag module was not discovered in Toolbelt. Initialize to scaffold runtime files and bridge contracts.',
    expectedPath: '../Toolbelt/SCRAPEtag/index.js'
  },
  GHOSTstub: {
    preview: 'assets/previews/mockops.gif',
    description: 'GHOSTstub payload engine is not present. Initialize to install synthetic data adapters and scenario mappers.',
    expectedPath: '../Toolbelt/GHOSTstub/index.js'
  }
}

function isoStamp() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19)
}

function setNavSelection() {
  navItems.forEach((item) => {
    const match = item.dataset.route === activeRoute && item.dataset.tool === activeTool
    item.classList.toggle('active', match)
  })
}

function setStageIdentity() {
  const isScrapeHud = activeRoute === 'tool' && activeTool === 'SCRAPEtag'
  if (activeRoute === 'docs') {
    stageTitle.textContent = 'SYSTEM DOCS'
  } else if (isScrapeHud && lastCapturedAlias) {
    stageTitle.textContent = `SCRAPEtag :: ${lastCapturedAlias}`
  } else {
    stageTitle.textContent = activeTool
  }
  selectedStatus.textContent = activeRoute === 'docs' ? 'system' : activeTool.toLowerCase()
}

function setChip(text) {
  stageChip.textContent = text
}

function setPollingStatus(text, isHealthy) {
  pollingStatus.textContent = text
  toolHealth.textContent = text
  toolHealth.classList.toggle('status-good', Boolean(isHealthy))
  toolHealth.classList.toggle('status-bad', !isHealthy)
}

function cloneTemplate(id) {
  return document.getElementById(id).content.cloneNode(true)
}

function mountContent(node) {
  stageContent.classList.remove('fade-swap')
  stageContent.innerHTML = ''
  stageContent.appendChild(node)
  requestAnimationFrame(() => stageContent.classList.add('fade-swap'))
}

function appendTerminalLine(text) {
  const normalized = String(text || '')
    .split('\n')
    .filter((line) => line.length > 0)

  normalized.forEach((line) => {
    const safeLine = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    let formattedLine = safeLine
    if (safeLine.includes('[CAPTURED]')) {
      formattedLine = `<span style="color: var(--line-hot);">${safeLine}</span>`
    } else {
      formattedLine = safeLine.replace(/^(\[[0-9\- :]+\])/, '<span style="color: var(--line-hot);">$1</span>')
    }
    terminalLogBuffer.push(formattedLine)
  })

  if (terminalLogBuffer.length > MAX_TERMINAL_LINES) {
    terminalLogBuffer.splice(0, terminalLogBuffer.length - MAX_TERMINAL_LINES)
  }

  if (!terminalLogNode) {
    return
  }

  terminalLogNode.innerHTML = terminalLogBuffer.join('\n')
  terminalLogNode.scrollTop = terminalLogNode.scrollHeight
}

function parseScrapeCaptureMessage(message) {
  if (typeof message !== 'string') {
    return null
  }

  const marker = '[SCRAPEtag:capture]'
  if (!message.startsWith(marker)) {
    return null
  }

  try {
    const payload = JSON.parse(message.slice(marker.length))
    return normalizeScrapeCapture(payload)
  } catch {
    return null
  }
}

function normalizeScrapeCapture(payload) {
  const alias = typeof payload?.alias === 'string' ? payload.alias.trim() : ''
  const selector = typeof payload?.selector === 'string' ? payload.selector.trim() : ''
  const toolName = typeof payload?.toolName === 'string' && payload.toolName.trim() ? payload.toolName.trim() : 'SCRAPEtag'
  const timestamp = typeof payload?.timestamp === 'string' && payload.timestamp.trim() ? payload.timestamp.trim() : new Date().toISOString()

  if (!alias || !selector) {
    return null
  }

  return { alias, selector, toolName, timestamp }
}

function bindSelectorCaptureBridge() {
  if (selectorCaptureBridgeBound) {
    return
  }

  selectorCaptureBridgeBound = true
  window.addEventListener('message', (event) => {
    const message = event?.data
    if (!message || message.type !== 'selector-captured') {
      return
    }

    const capture = normalizeScrapeCapture(message.payload)
    if (!capture) {
      return
    }

    handleScrapeCapture(capture)
  })
}

function handleScrapeCapture(capture) {
  const normalizedCapture = normalizeScrapeCapture(capture)
  if (!normalizedCapture) {
    return
  }

  const fingerprint = `${normalizedCapture.alias}|${normalizedCapture.selector}|${normalizedCapture.timestamp}`
  const now = Date.now()
  if (fingerprint === lastCaptureFingerprint && now - lastCaptureAt < 800) {
    return
  }

  lastCaptureFingerprint = fingerprint
  lastCaptureAt = now
  lastCapturedAlias = normalizedCapture.alias
  setStageIdentity()
  window.ghostOps.captureSelector?.(normalizedCapture)
}

async function armScrapeTagger(webview) {
  const injectionResult = await webview.executeJavaScript(
    `
      (() => {
        const styleId = 'ghost-tag-style'
        if (!document.getElementById(styleId)) {
          const style = document.createElement('style')
          style.id = styleId
          style.textContent = [
            '.ghost-tag {',
            'position: absolute;',
            'z-index: 2147483647;',
            'background: #fff;',
            'color: #000;',
            'border: 4px solid var(--accent-primary, rgb(184, 255, 90));',
            'border-radius: 8px;',
            'font-family: monospace;',
            'font-size: 12px;',
            'line-height: 1.2;',
            'box-shadow: 0 0 10px rgba(184, 255, 90, 0.65);',
            'padding: 8px 28px 8px 8px;',
            '}',
            '.ghost-tag button {',
            'position: absolute;',
            'top: 3px;',
            'right: 3px;',
            'border: 0;',
            'border-radius: 3px;',
            'background: #d90429;',
            'color: #fff;',
            'width: 16px;',
            'height: 16px;',
            'line-height: 16px;',
            'padding: 0;',
            'font-size: 10px;',
            'cursor: pointer;',
            '}'
          ].join('')
          document.head.appendChild(style)
        }

        if (window.__ghostTaggerClickHandler) {
          document.removeEventListener('click', window.__ghostTaggerClickHandler, true)
          window.__ghostTaggerClickHandler = null
        }

        const staleOverlay = document.getElementById('ghost-prompt-overlay')
        if (staleOverlay) {
          staleOverlay.remove()
        }

        const staleModal = document.getElementById('ghost-prompt-modal')
        if (staleModal) {
          staleModal.remove()
        }

        if (document.body) {
          document.body.style.cursor = 'crosshair'
        }

        const computeSelector = (node) => {
          if (!node || node.nodeType !== 1) {
            return ''
          }
          if (node.id) {
            return '#' + node.id
          }

          const parts = []
          let current = node
          while (current && current.nodeType === 1 && current !== document.body) {
            let part = current.tagName.toLowerCase()
            const classes = Array.from(current.classList).filter(Boolean)
            if (classes.length > 0) {
              part += '.' + classes[0]
            } else if (current.parentElement) {
              const siblings = Array.from(current.parentElement.children).filter((el) => el.tagName === current.tagName)
              if (siblings.length > 1) {
                part += ':nth-of-type(' + (siblings.indexOf(current) + 1) + ')'
              }
            }
            parts.unshift(part)
            current = current.parentElement
          }
          return parts.join(' > ')
        }

        const clickHandler = (event) => {
          const target = event.target
          if (!(target instanceof Element)) return

          if (
            target.closest &&
            (target.closest('.ghost-tag') || target.closest('#ghost-prompt-modal') || target.closest('#ghost-prompt-overlay'))
          ) {
            return
          }

          if (document.getElementById('ghost-prompt-modal')) return

          event.preventDefault()
          event.stopPropagation()
          event.stopImmediatePropagation()

          // ── RELEASE VALVE: cleanup function ──────────────────────────────
          const releaseNavigation = () => {
            if (window.__ghostTaggerClickHandler) {
              document.removeEventListener('click', window.__ghostTaggerClickHandler, true)
              window.__ghostTaggerClickHandler = null
            }
            if (document.body) {
              document.body.style.cursor = ''
            }
          }

          const cleanup = () => {
            const m = document.getElementById('ghost-prompt-modal')
            const o = document.getElementById('ghost-prompt-overlay')
            if (m) m.remove()
            if (o) o.remove()
            releaseNavigation()
          }
          // ─────────────────────────────────────────────────────────────────

          const overlay = document.createElement('div')
          overlay.id = 'ghost-prompt-overlay'
          // NOTE: NO pointer-events:none here — overlay is clickable as escape hatch
          overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px);z-index:2147483646;'

          const modal = document.createElement('div')
          modal.id = 'ghost-prompt-modal'
          modal.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#050606;border:1px solid var(--accent-primary, rgb(184, 255, 90));padding:20px;z-index:2147483647;border-radius:8px;box-shadow:0 0 20px rgba(184, 255, 90, 0.4), inset 0 0 10px rgba(184, 255, 90, 0.2);color:var(--accent-primary, rgb(184, 255, 90));font-family:monospace;display:flex;flex-direction:column;gap:12px;min-width:300px;'

          const label = document.createElement('label')
          label.textContent = '> INPUT TARGET SELECTOR ALIAS:'
          label.style.fontSize = '12px'
          label.style.letterSpacing = '0.08em'

          const input = document.createElement('input')
          input.type = 'text'
          input.style.cssText = 'background:#000;border:1px solid var(--accent-primary, rgb(184, 255, 90));color:var(--accent-primary, rgb(184, 255, 90));padding:10px;font-family:monospace;outline:none;font-size:14px;border-radius:4px;'

          const btnWrap = document.createElement('div')
          btnWrap.style.cssText = 'display:flex;justify-content:flex-end;gap:10px;margin-top:8px;'

          const cancelBtn = document.createElement('button')
          cancelBtn.textContent = 'CANCEL'
          cancelBtn.style.cssText = 'background:transparent;border:1px solid #555;color:#aaa;padding:8px 16px;cursor:pointer;font-family:monospace;border-radius:4px;font-weight:bold;'

          const saveBtn = document.createElement('button')
          saveBtn.textContent = 'TAG TARGET'
          saveBtn.style.cssText = 'background:rgba(184,255,90,0.1);border:1px solid var(--accent-primary, rgb(184, 255, 90));color:var(--accent-primary, rgb(184, 255, 90));padding:8px 16px;cursor:pointer;font-family:monospace;border-radius:4px;font-weight:bold;'

          btnWrap.appendChild(cancelBtn)
          btnWrap.appendChild(saveBtn)
          modal.appendChild(label)
          modal.appendChild(input)
          modal.appendChild(btnWrap)
          document.body.appendChild(overlay)
          document.body.appendChild(modal)

          input.focus()

          // CANCEL button — full cleanup
          cancelBtn.onclick = (cancelEvent) => {
            cancelEvent.preventDefault()
            cancelEvent.stopPropagation()
            cleanup()
            console.log('[SCRAPEtag] tagger cancelled')
          }

          const finishTagging = () => {
            const name = input.value.trim()

            if (!name) {
              cleanup()
              console.log('[SCRAPEtag] tagger aborted')
              return
            }

            const rect = target.getBoundingClientRect()
            const tag = document.createElement('div')
            tag.className = 'ghost-tag'
            tag.textContent = name
            tag.style.left = (rect.left + window.scrollX) + 'px'
            tag.style.top = (rect.top + window.scrollY) + 'px'

            const close = document.createElement('button')
            close.type = 'button'
            close.textContent = 'X'
            close.addEventListener('click', (closeEvent) => {
              closeEvent.preventDefault()
              closeEvent.stopPropagation()
              tag.remove()
            })

            tag.appendChild(close)
            document.body.appendChild(tag)

            const selector = computeSelector(target)
            cleanup()

            const payload = {
              alias: name,
              selector,
              toolName: 'SCRAPEtag',
              timestamp: new Date().toISOString()
            }

            try {
              window.parent.postMessage({ type: 'selector-captured', payload }, '*')
            } catch {}

            try {
              window.postMessage({ type: 'selector-captured', payload }, '*')
            } catch {}

            console.log('[SCRAPEtag:capture]' + JSON.stringify(payload))
          }

          // TAG TARGET button
          saveBtn.onclick = (saveEvent) => {
            saveEvent.preventDefault()
            saveEvent.stopPropagation()
            finishTagging()
          }

          // Keyboard: Enter to confirm, Escape to cancel
          input.onkeydown = (e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              finishTagging()
            }
            if (e.key === 'Escape') {
              e.preventDefault()
              cleanup()
            }
          }

          // ── CRITICAL: clicking the overlay backdrop dismisses the modal ──
          overlay.addEventListener('click', (overlayEvent) => {
            // Only dismiss if click is directly on overlay, not bubbling from modal
            if (overlayEvent.target === overlay) {
              overlayEvent.preventDefault()
              overlayEvent.stopPropagation()
              cleanup()
              console.log('[SCRAPEtag] tagger dismissed via backdrop')
            }
          })
          // ─────────────────────────────────────────────────────────────────

          // Stop modal clicks from bubbling to overlay
          modal.addEventListener('click', (modalEvent) => {
            modalEvent.stopPropagation()
          })
        }

        window.__ghostTaggerClickHandler = clickHandler
        document.addEventListener('click', clickHandler, true)
        console.log('[SCRAPEtag] in-app tagger armed')
        return 'armed'
      })()
    `,
    true
  )

  return injectionResult
}

function bindScrapeWebview(webview) {
  if (!webview || webview.dataset.bound === '1') {
    return
  }

  webview.dataset.bound = '1'

  webview.addEventListener('did-start-loading', () => {
    appendTerminalLine(`[${isoStamp()}] [SCRAPEtag] webview loading started`)
  })

  webview.addEventListener('did-stop-loading', () => {
    appendTerminalLine(`[${isoStamp()}] [SCRAPEtag] webview loading complete`)
  })

  webview.addEventListener('did-fail-load', (event) => {
    appendTerminalLine(`[${isoStamp()}] [SCRAPEtag] webview load failed: ${event.errorDescription}`)
  })

  webview.addEventListener('console-message', (event) => {
    const capture = parseScrapeCaptureMessage(event.message)
    if (capture) {
      handleScrapeCapture(capture)
      return
    }
    appendTerminalLine(`[${isoStamp()}] ${event.message}`)
  })

  webview.addEventListener('dom-ready', async () => {
    bindSelectorCaptureBridge()
    appendTerminalLine(`[${isoStamp()}] [SCRAPEtag] webview ready`)
    try {
      await armScrapeTagger(webview)
      appendTerminalLine(`[${isoStamp()}] [SCRAPEtag] click an element to tag`)
    } catch (error) {
      appendTerminalLine(`[${isoStamp()}] [SCRAPEtag] injector failed: ${error.message}`)
    }
  })
}

function launchScrapeSession() {
  const scrapeShell = document.getElementById('scrape-shell')
  const webview = document.getElementById('scrape-webview')
  const rearmBtn = document.getElementById('rearm-tagger')

  if (!scrapeShell || !webview) {
    appendTerminalLine(`[${isoStamp()}] [SCRAPEtag] in-app webview container unavailable`)
    return
  }

  scrapeShell.hidden = false
  bindScrapeWebview(webview)
  appendTerminalLine(`[${isoStamp()}] [SCRAPEtag] launching in-app session: https://testghost.com`)

  if (webview.getURL && !webview.getURL()) {
    webview.src = 'https://testghost.com'
  } else {
    appendTerminalLine(`[${isoStamp()}] [SCRAPEtag] session already loaded`)
  }

  if (rearmBtn && rearmBtn.dataset.bound !== '1') {
    rearmBtn.dataset.bound = '1'
    rearmBtn.addEventListener('click', async () => {
      try {
        await armScrapeTagger(webview)
        appendTerminalLine(`[${isoStamp()}] [SCRAPEtag] tagger rearmed`)
      } catch (error) {
        appendTerminalLine(`[${isoStamp()}] [SCRAPEtag] rearm failed: ${error.message}`)
      }
    })
  }
}

function attachPreviewFallback(img) {
  img.addEventListener('error', () => {
    img.alt = 'Preview GIF unavailable on disk'
    img.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 640 360'%3E%3Crect width='640' height='360' fill='%23080909'/%3E%3Ctext x='50%25' y='50%25' fill='%2339FF14' font-size='26' font-family='monospace' dominant-baseline='middle' text-anchor='middle'%3EPREVIEW OFFLINE%3C/text%3E%3C/svg%3E"
  })
}

async function renderMissingState(toolName, toolInfo) {
  const cfg = toolConfig[toolName]
  const view = cloneTemplate('module-missing-template')
  const description = view.querySelector('#missing-description')
  const missingPath = view.querySelector('#missing-path')
  const preview = view.querySelector('#preview-gif')
  const initializeBtn = view.querySelector('#initialize-module')

  description.textContent = cfg.description
  missingPath.textContent = toolInfo.expectedPath || cfg.expectedPath
  preview.src = cfg.preview
  attachPreviewFallback(preview)

  initializeBtn.addEventListener('click', async () => {
    initializeBtn.disabled = true
    initializeBtn.textContent = 'INITIALIZING MODULE'
    const result = await window.ghostOps.initializeTool(toolName)
    if (result.ok) {
      setPollingStatus('module initialized', true)
    } else {
      setPollingStatus('init failed', false)
      initializeBtn.disabled = false
      initializeBtn.textContent = 'INITIALIZE MODULE'
    }
    await refreshActiveStage()
  })

  setChip('state-a')
  mountContent(view)
  terminalLogNode = null
}

function renderRunnerState(toolName, toolInfo) {
  const view = cloneTemplate('tactical-runner-template')
  const launchBtn = view.querySelector('#launch-engine')
  const scrapeShell = view.querySelector('#scrape-shell')
  const runnerChip = view.querySelector('.runner-chip')
  const domOverrideBtn = view.querySelector('#dom-override-trigger')

  if (terminalLogBuffer.length === 0) {
    appendTerminalLine(`[${isoStamp()}] ${toolName} entrypoint discovered`)
    appendTerminalLine(`[${isoStamp()}] runner idle`)
    appendTerminalLine(`[${isoStamp()}] note: SCRAPEtag now runs inside the app window`)
  }

  if (toolName === 'SCRAPEtag') {
    launchBtn.textContent = 'LAUNCH IN-APP SCRAPE'
    runnerChip.textContent = 'in-app-ready'
  } else {
    launchBtn.textContent = 'LAUNCH HEADFUL ENGINE'
    runnerChip.textContent = 'headful-ready'
    if (scrapeShell) scrapeShell.remove()
    if (domOverrideBtn) domOverrideBtn.closest('.dom-override-wrap')?.remove()
  }

  launchBtn.addEventListener('click', async () => {
    appendTerminalLine(`[${isoStamp()}] launch requested for ${toolName} at ${toolInfo.entryPath}`)
    if (toolName === 'SCRAPEtag') {
      launchScrapeSession()
    } else {
      window.ghostOps.launchTool(toolName)
    }
  })

  // Wire up DOM Override trigger video button
  if (domOverrideBtn) {
    domOverrideBtn.addEventListener('click', async () => {
      const webview = document.getElementById('scrape-webview')
      if (!webview) {
        appendTerminalLine(`[${isoStamp()}] [SCRAPEtag] webview not active — launch session first`)
        return
      }
      try {
        await armScrapeTagger(webview)
        appendTerminalLine(`[${isoStamp()}] [SCRAPEtag] DOM Override armed — click any element`)
      } catch (error) {
        appendTerminalLine(`[${isoStamp()}] [SCRAPEtag] DOM Override failed: ${error.message}`)
      }
    })
  }

  setChip('state-b')
  mountContent(view)
  terminalLogNode = document.getElementById('terminal-log')
  terminalLogNode.innerHTML = terminalLogBuffer.join('\n')
  terminalLogNode.scrollTop = terminalLogNode.scrollHeight
}

function renderDocsState() {
  const view = cloneTemplate('docs-template')
  setChip('state-c')
  setPollingStatus('documentation mode', true)
  mountContent(view)
  terminalLogNode = null
}

async function pollTool(toolName) {
  const result = await window.ghostOps.checkTool(toolName)
  toolCache.set(toolName, result)
  return result
}

async function refreshActiveStage() {
  setStageIdentity()

  if (activeRoute === 'docs') {
    if (currentStageSignature !== 'docs') {
      renderDocsState()
      currentStageSignature = 'docs'
    }
    return
  }

  setPollingStatus('polling filesystem', true)

  try {
    const toolInfo = await pollTool(activeTool)
    const isFound = Boolean(toolInfo.found)
    setPollingStatus(isFound ? 'module online' : 'module missing', isFound)

    if (isFound) {
      const signature = `runner:${activeTool}`
      if (currentStageSignature !== signature) {
        renderRunnerState(activeTool, toolInfo)
        currentStageSignature = signature
      }
    } else {
      const signature = `missing:${activeTool}`
      if (currentStageSignature !== signature) {
        await renderMissingState(activeTool, toolInfo)
        currentStageSignature = signature
      }
    }
  } catch (error) {
    setChip('error')
    setPollingStatus('bridge error', false)
    stageContent.textContent = `IPC failure while checking ${activeTool}: ${error.message}`
    currentStageSignature = 'error'
  }
}

function startPollingLoop() {
  if (pollTimer) {
    clearInterval(pollTimer)
  }

  if (activeRoute === 'docs') {
    return
  }

  pollTimer = setInterval(() => {
    refreshActiveStage()
  }, POLL_INTERVAL_MS)
}

function bindNavigation() {
  navItems.forEach((item) => {
    item.addEventListener('click', () => {
      const nextRoute = item.dataset.route
      const nextTool = item.dataset.tool

      if (!nextRoute || (nextRoute !== 'tool' && nextRoute !== 'docs')) {
        return
      }

      const continueNav = () => {
        activeRoute = nextRoute
        activeTool = nextTool
        currentStageSignature = ''
        appendTerminalLine(`[${isoStamp()}] route changed: ${activeRoute}/${activeTool}`)
        setNavSelection()
        refreshActiveStage()
        startPollingLoop()
      }

      if (nextRoute === 'tool') {
        playBootSequence(nextTool, stageContent, continueNav)
        return
      }

      continueNav()
    })
  })
}

function bindToolLogs() {
  if (unsubscribeToolLog || !window.ghostOps.onToolLog) {
    return
  }

  unsubscribeToolLog = window.ghostOps.onToolLog((line) => {
    appendTerminalLine(line)
  })
}

async function boot() {
  bindToolLogs()
  bindNavigation()
  setNavSelection()
  await refreshActiveStage()
  startPollingLoop()
}

boot()
