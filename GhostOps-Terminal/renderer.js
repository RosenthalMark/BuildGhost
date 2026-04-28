import { playBootSequence } from './src/services/bootManager.js'

const stageTitle = document.getElementById('stage-title')
const stageChip = document.getElementById('stage-chip')
const stageContent = document.getElementById('stage-content')
const hudShell = document.getElementById('hud-shell')
const moduleDock = document.getElementById('module-dock')
const moduleDockToggle = document.getElementById('module-dock-toggle')
const pollingStatus = document.getElementById('polling-status')
const selectedStatus = document.getElementById('selected-status')
const toolHealth = document.getElementById('tool-health')
const navItems = Array.from(document.querySelectorAll('.nav-item'))
const introVid = document.getElementById('intro-vid')
const staticLogo = document.getElementById('static-logo')

const NixieTicker = (function () {
  const SPIN = ['◢', '◣', '◤', '◥']
  const SEP = '   •   '
  const MARQUEE_GAP_PX = 360
  const MARQUEE_GAP_TEXT = '\u00a0'.repeat(28)
  const IDLE_MSGS = [
    'GHOSTOPS TERMINAL · SCRAPETAG ONLINE · AWAITING HARVEST COMMAND',
    'PRO TIP: DATA-TEST ATTRIBUTES DECOUPLE YOUR SUITE FROM UI CHURN',
    'TOTAL RECALL MODE: CAPTURES ALL INTERACTIVE + STRUCTURAL NODES',
    'CONFIDENCE ENGINE: GREEN = UNIQUE ANCHOR · ORANGE = FRAGILE SELECTOR',
    'BUILDGHOST · THE STABILITY BUTTON FOR VP-LEVEL ENGINEERING ORGS',
    'PATTERN RECOGNIZER: IDENTICAL ELEMENTS GROUPED INTO COLLECTIONS',
    'ZERO FLAKY TESTS · ZERO TOLERANCE POLICY · ENGAGE HARVEST NOW',
    'SCRAPETAG STANDS GUARD · YOUR SELECTORS WILL NEVER BREAK AGAIN',
  ]
  let spinFrame = 0
  let spinTimer = null
  let isActive = false
  let bootTimers = []
  let lastRenderedBaseMessage = ''
  let postDoneTimer = null

  function clearBootTimers() {
    bootTimers.forEach((id) => clearTimeout(id))
    bootTimers = []
  }

  function clearPostDoneTimer() {
    if (postDoneTimer) {
      clearTimeout(postDoneTimer)
      postDoneTimer = null
    }
  }

  function textEl() { return document.querySelector('.nixie-text') }
  function spinnerEl() { return document.getElementById('nixie-spinner') }
  function scrollerEl() { return document.getElementById('nixie-scroller') }
  function laneEl() {
    const t = textEl()
    return t && t.parentElement ? t.parentElement : null
  }

  function setMode(cls) {
    const s = scrollerEl()
    if (!s) return
    s.classList.remove('nixie-scroller--scanning', 'nixie-scroller--done')
    if (cls) s.classList.add(cls)
  }

  function setText(msg, speedPxPerSec) {
    const t = textEl()
    if (!t) return
    const base = String(msg || '').trim()
    if (!base) return
    if (base === lastRenderedBaseMessage) return
    lastRenderedBaseMessage = base
    const px = speedPxPerSec || 76
    const single = `> ${base}_`
    const marquee = `${single}${MARQUEE_GAP_TEXT}${single}`
    t.textContent = marquee
    const laneW = t.parentElement ? t.parentElement.clientWidth : 420
    const textW = Math.max(t.scrollWidth, single.length * 7)
    const duration = Math.max(8, (laneW + textW + MARQUEE_GAP_PX) / px)
    t.style.setProperty('--nixie-marquee-duration', `${duration.toFixed(1)}s`)
    t.style.animation = 'none'
    void t.offsetWidth
    t.style.removeProperty('animation')
  }

  function startSpin() {
    if (spinTimer) return
    spinFrame = 0
    const sp = spinnerEl()
    if (sp) sp.textContent = SPIN[0]
    spinTimer = setInterval(() => {
      spinFrame = (spinFrame + 1) % SPIN.length
      const s = spinnerEl()
      if (s) s.textContent = SPIN[spinFrame]
    }, 110)
  }

  function stopSpin() {
    clearInterval(spinTimer)
    spinTimer = null
    const sp = spinnerEl()
    if (sp) sp.textContent = ''
  }

  function idle() {
    clearPostDoneTimer()
    if (isActive) return
    stopSpin()
    setMode(null)
    setText(IDLE_MSGS.join(SEP), 72)
  }

  function boot(url) {
    clearPostDoneTimer()
    clearBootTimers()
    isActive = true
    setMode('nixie-scroller--scanning')
    startSpin()
    setText('HARVEST IN PROGRESS', 80)
  }

  function scan(_pass, _total) {
    if (!isActive) return
  }

  function querying() {
    clearPostDoneTimer()
    clearBootTimers()
    setText('HARVEST IN PROGRESS', 80)
  }

  function done(_stats, captureFeed = []) {
    clearPostDoneTimer()
    clearBootTimers()
    isActive = false
    stopSpin()
    setMode('nixie-scroller--done')
    setText('HARVEST COMPLETE', 76)
    const items = Array.isArray(captureFeed)
      ? captureFeed.map((s) => String(s || '').trim()).filter(Boolean)
      : []
    if (items.length > 0) {
      const laneW = laneEl() ? laneEl().clientWidth : 420
      // Wait until "HARVEST COMPLETE" has crossed the center of the nixie lane.
      const centerCrossMs = Math.round(((laneW * 0.5) / 76) * 1000)
      const handoffDelayMs = Math.max(2600, Math.min(6500, centerCrossMs + 950))
      postDoneTimer = setTimeout(() => {
        setMode(null)
        setText(items.join(SEP), 70)
      }, handoffDelayMs)
    }
  }

  function announce(msg, speedPxPerSec = 76) {
    clearPostDoneTimer()
    isActive = false
    stopSpin()
    setMode(null)
    lastRenderedBaseMessage = ''
    setText(msg, speedPxPerSec)
  }

  function isBusy() {
    return isActive
  }

  return { idle, boot, scan, querying, done, announce, isBusy }
})()

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
const MODULE_DOCK_STORAGE_KEY = 'ghostops_module_dock_collapsed'
const DEFAULT_SCRAPE_URL = 'https://testghost.com'
const SCRAPE_URL_STORAGE_KEY = 'ghostops_scrape_target_url'
const STRICT_HARVEST_STORAGE_KEY = 'ghostops_scrape_strict_mode'
const SPOOLER_UI_URL = 'http://127.0.0.1:8512'

function resolveScrapeTargetUrl(raw) {
  let s = String(raw || '').trim()
  if (!s) {
    return null
  }
  const lower = s.toLowerCase()
  if (lower.startsWith('javascript:') || lower.startsWith('data:')) {
    return null
  }
  if (!/^https?:\/\//i.test(s)) {
    s = `https://${s}`
  }
  try {
    const u = new URL(s)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      return null
    }
    if (!u.hostname) {
      return null
    }
    return u.href
  } catch {
    return null
  }
}

function isStrictHarvestEnabled() {
  try {
    return localStorage.getItem(STRICT_HARVEST_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function setStrictHarvestEnabled(enabled) {
  const next = enabled ? '1' : '0'
  try {
    localStorage.setItem(STRICT_HARVEST_STORAGE_KEY, next)
  } catch {
    /* ignore */
  }
  const toggle = document.getElementById('strict-harvest-toggle')
  if (toggle) toggle.checked = Boolean(enabled)
}

let activeRoute = 'tool'
let activeTool = 'scrapetag'
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
let strictSuggestModalEl = null
const strictSuggestionSeenForUrl = new Set()
const launchKeyAnimGenByButton = new WeakMap()

function bumpLaunchKeyGen(button) {
  const next = (launchKeyAnimGenByButton.get(button) || 0) + 1
  launchKeyAnimGenByButton.set(button, next)
  return next
}

function getLaunchKeyGen(button) {
  return launchKeyAnimGenByButton.get(button) || 0
}
const spoolerDependencyState = {
  checked: false,
  healthy: false,
  reason: '',
  installing: false
}
let spoolerWebviewRetryTimer = null
let spoolerWebviewRetryCount = 0
const SPOOLER_WEBVIEW_MAX_RETRIES = 20
const SPOOLER_WEBVIEW_RETRY_MS = 800
let spoolerHarnessActive = false
let spoolerHarnessLaunchPending = false
let moduleDockCollapsed = false

function setModuleDockState(nextCollapsed, options = {}) {
  const { persist = true } = options
  const collapsed = Boolean(nextCollapsed)
  moduleDockCollapsed = collapsed

  if (hudShell) hudShell.classList.toggle('module-dock-collapsed', collapsed)
  if (moduleDock) moduleDock.classList.toggle('module-dock-collapsed', collapsed)
  if (moduleDock) moduleDock.classList.toggle('collapsed', collapsed)
  if (moduleDockToggle) {
    moduleDockToggle.setAttribute('aria-expanded', String(!collapsed))
    moduleDockToggle.setAttribute('aria-label', collapsed ? 'Expand Module Dock' : 'Collapse Module Dock')
  }

  if (persist) {
    localStorage.setItem(MODULE_DOCK_STORAGE_KEY, collapsed ? '1' : '0')
  }
}

function bindModuleDockToggle() {
  if (!moduleDockToggle) return
  const stored = localStorage.getItem(MODULE_DOCK_STORAGE_KEY)
  const collapsed = stored === '1' || stored === 'true'
  setModuleDockState(collapsed, { persist: false })

  moduleDockToggle.addEventListener('click', () => {
    setModuleDockState(!moduleDockCollapsed)
  })
}

function setLaunchKeyStaticLabel(button, label) {
  bumpLaunchKeyGen(button)
  const root = button?.querySelector('.launch-key-label-root')
  if (!root) return
  root.textContent = label
  root.classList.remove('launch-key-label--neon')
}

function initLaunchSpacebarKey(button, options = {}) {
  const { label = 'LAUNCH IN-APP SCRAPE', enableCycle = true } = options
  const root = button?.querySelector('.launch-key-label-root')
  if (!root) return

  const gen = bumpLaunchKeyGen(button)
  root.textContent = ''
  root.classList.remove('launch-key-label--neon')

  const chars = []
  for (const ch of label) {
    const s = document.createElement('span')
    s.className = 'launch-ch'
    s.textContent = ch === ' ' ? '\u00a0' : ch
    root.appendChild(s)
    chars.push(s)
  }

  let hovered = false
  let greenTimer = null
  let cycleTimer = null

  const isStale = () => gen !== getLaunchKeyGen(button)

  function clearTimers() {
    if (greenTimer) {
      clearTimeout(greenTimer)
      greenTimer = null
    }
    if (cycleTimer) {
      clearTimeout(cycleTimer)
      cycleTimer = null
    }
  }

  function resetCharsNeutral() {
    chars.forEach((el) => {
      el.style.transition = 'none'
      el.style.transform = 'translateX(0)'
      el.style.opacity = '1'
      el.style.transitionDelay = '0s'
    })
  }

  function recoverFromHoverAnimated() {
    root.classList.remove('launch-key-label--neon')
    chars.forEach((el, i) => {
      el.style.transition = 'none'
      const pull = -38 - (i % 6) * 2.5
      el.style.transform = `translateX(${pull}%)`
      el.style.opacity = '0.62'
    })
    void root.offsetWidth
    chars.forEach((el, i) => {
      el.style.transition = 'transform 0.42s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.4s ease'
      el.style.transitionDelay = `${i * 0.034}s`
      el.style.transform = 'translateX(0)'
      el.style.opacity = '1'
    })
  }

  function runGreenScroll() {
    if (isStale() || hovered) return
    // Idle pulse: keep text centered, only apply neon emphasis.
    root.classList.add('launch-key-label--neon')
    chars.forEach((el, i) => {
      el.style.transition = 'opacity 0.35s ease'
      el.style.transitionDelay = `${i * 0.018}s`
      el.style.transform = 'translateX(0)'
      el.style.opacity = '1'
    })
  }

  function runExitThenEnter() {
    return new Promise((resolve) => {
      if (isStale() || hovered) {
        resolve()
        return
      }
      const n = chars.length
      // Keep neon during the whole cycle, but avoid lateral drift.
      root.classList.add('launch-key-label--neon')
      chars.forEach((el, i) => {
        el.style.transition = 'opacity 0.24s ease'
        el.style.transitionDelay = `${i * 0.044}s`
        el.style.transform = 'translateX(0)'
        el.style.opacity = '0'
      })
      const exitMs = Math.max(0, (n - 1) * 44 + 360)
      setTimeout(() => {
        if (isStale() || hovered) {
          resolve()
          return
        }
        chars.forEach((el) => {
          el.style.transition = 'none'
          el.style.transform = 'translateX(0)'
          el.style.opacity = '0'
        })
        void root.offsetWidth
        chars.forEach((el, i) => {
          const rev = n - 1 - i
          el.style.transition = 'opacity 0.34s ease'
          el.style.transitionDelay = `${rev * 0.05}s`
          el.style.transform = 'translateX(0)'
          el.style.opacity = '1'
        })
        const enterMs = Math.max(0, (n - 1) * 50 + 520)
        setTimeout(() => {
          if (!isStale() && !hovered) {
            root.classList.remove('launch-key-label--neon')
          }
          resolve()
        }, enterMs)
      }, exitMs)
    })
  }

  function scheduleTimers() {
    clearTimers()
    if (!enableCycle) return
    greenTimer = setTimeout(() => {
      if (isStale() || hovered) return
      runGreenScroll()
    }, 5000)

    const queueCycle = () => {
      if (isStale() || hovered || !enableCycle) return
      cycleTimer = setTimeout(async () => {
        if (isStale() || hovered || !enableCycle) return
        await runExitThenEnter()
        if (isStale() || hovered || !enableCycle) return
        queueCycle()
      }, 8000)
    }
    queueCycle()
  }

  function onPointerEnter() {
    if (hovered) return
    hovered = true
    clearTimers()
    recoverFromHoverAnimated()
    root.classList.add('launch-key-label--neon')
  }

  function onPointerLeave() {
    hovered = false
    if (isStale()) return
    scheduleTimers()
  }

  resetCharsNeutral()

  button.addEventListener('mouseenter', onPointerEnter)
  button.addEventListener('mouseleave', onPointerLeave)
  button.addEventListener('focus', onPointerEnter)
  button.addEventListener('blur', onPointerLeave)

  button.addEventListener(
    'click',
    () => {
      clearTimers()
      root.classList.remove('launch-key-label--neon')
      resetCharsNeutral()
      setTimeout(() => {
        if (isStale()) return
        if (!button.matches(':hover') && document.activeElement !== button) {
          scheduleTimers()
        }
      }, 450)
    },
    true
  )

  scheduleTimers()
}

const toolConfig = {
  scrapetag: {
    preview: 'assets/modules/scrapetag/scrapetag-selector-display.png',
    description: 'Scrapetag module was not discovered in Toolbelt. Initialize to scaffold runtime files and bridge contracts.',
    expectedPath: '../Toolbelt/scrapetag/index.js'
  },
  GHOSTstub: {
    preview: '../Toolbelt/GHOSTstub/assets/ghostStub-logo.png',
    description: 'GHOSTstub payload engine is not present. Initialize to install synthetic data adapters and scenario mappers.',
    expectedPath: '../Toolbelt/GHOSTstub/index.js'
  },
  BlackBox: {
    preview: '../Toolbelt/BlackBox/assets/Blackbox-logo.png',
    description: 'BLACKbox conversion runtime is not present. Initialize to scaffold migration adapters and compatibility checks.',
    expectedPath: '../Toolbelt/BlackBox/index.js'
  },
  Cypress: {
    preview: '../Toolbelt/Cypress/assets/Cypress.png',
    description: 'Cypress runtime is not present. Initialize to scaffold end-to-end browser automation entrypoints.',
    expectedPath: '../Toolbelt/Cypress/index.js'
  },
  Playwright: {
    preview: '../Toolbelt/Playwright/assets/Playwright.png',
    description: 'Playwright runtime is not present. Initialize to scaffold browser automation orchestration hooks.',
    expectedPath: '../Toolbelt/Playwright/index.js'
  },
  Spooler: {
    preview: 'assets/core/GHOSTops-terminal-logo-2.png',
    description: 'SPOOLER harness is not present. Initialize to scaffold the reproducible hostile-environment runtime bridge.',
    expectedPath: '../Toolbelt/Spooler/index.js'
  },
  Trace: {
    preview: '../Toolbelt/Trace/assets/trace_logo.png',
    description: 'Trace module was not discovered in Toolbelt. Initialize to scaffold deterministic state snapshots and replay contracts.',
    expectedPath: '../Toolbelt/Trace/index.js'
  }
}

function isoStamp() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19)
}

function setNavSelection() {
  navItems.forEach((item) => {
    const route = item.dataset.route
    const tool = item.dataset.tool
    let match = false
    if (activeRoute === 'tool') {
      match = route === 'tool' && tool === activeTool
    } else if (activeRoute === 'docs') {
      match = route === 'docs'
    } else if (activeRoute === 'config') {
      match = route === 'config'
    } else if (activeRoute === 'auth') {
      match = route === 'auth'
    }
    item.classList.toggle('active', match)
  })
}

function setStageIdentity() {
  const isScrapeHud = activeRoute === 'tool' && activeTool === 'scrapetag'
  const nixieShell = document.getElementById('nixie-scroller')

  if (nixieShell) {
    nixieShell.style.setProperty('--nixie-header-skin', 'url("assets/core/Nixie_led_scroller.png")')
  }

  if (activeRoute === 'docs') {
    if (stageTitle) stageTitle.textContent = 'SYSTEM DOCS'
  } else if (activeRoute === 'config') {
    if (stageTitle) stageTitle.textContent = 'SETTINGS'
  } else if (activeRoute === 'auth') {
    if (stageTitle) stageTitle.textContent = 'SIGN IN'
  } else if (isScrapeHud && lastCapturedAlias) {
    if (stageTitle) stageTitle.textContent = `Scrapetag :: ${lastCapturedAlias}`
  } else {
    if (stageTitle) stageTitle.textContent = activeTool
  }
  if (selectedStatus) {
    if (activeRoute === 'docs') selectedStatus.textContent = 'system'
    else if (activeRoute === 'config') selectedStatus.textContent = 'settings'
    else if (activeRoute === 'auth') selectedStatus.textContent = 'auth'
    else selectedStatus.textContent = activeTool.toLowerCase()
  }
}

function setChip(text) {
  if (stageChip) stageChip.textContent = text
}

function updateNixieReadout(plainText) {
  if (!plainText) return
  const max = 220
  let t = plainText.length > max ? `${plainText.slice(0, max - 3)}...` : plainText
  if (!t.startsWith('>')) {
    t = `> ${t}`
  }
  if (!t.endsWith('_')) {
    t += '_'
  }
  NixieTicker.announce(t.replace(/^>\s*/, '').replace(/_$/, ''), 76)
}

function updateSelectorHud(alias, selector) {
  const displayEl = document.getElementById('selector-display-text')
  if (displayEl) {
    displayEl.textContent = `> TARGET ACQUIRED: ${alias} → ${selector}_`
  }
  updateNixieReadout(`TARGET ACQUIRED :: ${alias} :: ${selector}`)
}

function setSpoolerSetupPanel(state) {
  const setup = document.getElementById('spooler-setup')
  const message = document.getElementById('spooler-setup-message')
  const pill = document.getElementById('spooler-health-pill')
  const installBtn = document.getElementById('spooler-install-deps')
  if (!setup || !message || !pill || !installBtn) return

  setup.hidden = false
  installBtn.disabled = Boolean(state.installing)

  if (state.installing) {
    message.textContent = 'Installing Python dependencies via requirements.txt...'
    pill.textContent = 'installing'
    return
  }

  if (!state.checked) {
    message.textContent = 'Checking Python dependencies...'
    pill.textContent = 'checking'
    installBtn.hidden = true
    return
  }

  if (state.healthy) {
    message.textContent = 'Runtime ready. Streamlit and pandas are available for launch.'
    pill.textContent = 'ready'
    installBtn.hidden = true
    return
  }

  message.textContent = `Dependencies missing: ${state.reason || 'streamlit not installed'}`
  pill.textContent = 'deps-missing'
  installBtn.hidden = false
}

async function refreshSpoolerDependencyStatus({ logMissing = false } = {}) {
  spoolerDependencyState.checked = false
  spoolerDependencyState.reason = ''
  setSpoolerSetupPanel(spoolerDependencyState)

  const response = await window.ghostOps.checkSpoolerHealth()
  spoolerDependencyState.checked = true
  spoolerDependencyState.healthy = Boolean(response?.healthy)
  spoolerDependencyState.reason = String(response?.reason || '').trim()
  setSpoolerSetupPanel(spoolerDependencyState)

  if (spoolerDependencyState.healthy) {
    setPollingStatus('spooler ready', true)
    updateNixieReadout('SPOOLER READY :: DEPENDENCIES VERIFIED')
  } else {
    setPollingStatus('spooler deps missing', false)
    updateNixieReadout('SPOOLER DEPENDENCY CHECK FAILED')
    if (logMissing) {
      appendTerminalLine(`[${isoStamp()}] [Spooler] dependencies missing: ${spoolerDependencyState.reason || 'streamlit not installed'}`)
    }
  }

  return { ...spoolerDependencyState }
}

function setPollingStatus(text, isHealthy) {
  if (pollingStatus) pollingStatus.textContent = text
  if (toolHealth) toolHealth.textContent = text
  if (toolHealth) toolHealth.classList.toggle('status-good', Boolean(isHealthy))
  if (toolHealth) toolHealth.classList.toggle('status-bad', !isHealthy)
}

function clearSpoolerWebviewRetry() {
  if (spoolerWebviewRetryTimer) {
    clearTimeout(spoolerWebviewRetryTimer)
    spoolerWebviewRetryTimer = null
  }
}

function scheduleSpoolerWebviewRetry(webview, reason = '') {
  if (!webview) return
  if (spoolerWebviewRetryCount >= SPOOLER_WEBVIEW_MAX_RETRIES) {
    appendTerminalLine(`[${isoStamp()}] [Spooler] UI attach timeout after ${SPOOLER_WEBVIEW_MAX_RETRIES} retries`)
    updateNixieReadout('SPOOLER UI TIMEOUT :: CHECK STREAMLIT PORT')
    return
  }
  spoolerWebviewRetryCount += 1
  clearSpoolerWebviewRetry()
  if (spoolerWebviewRetryCount === 1) {
    appendTerminalLine(`[${isoStamp()}] [Spooler] waiting for UI server to become ready${reason ? ` (${reason})` : ''}`)
  }
  spoolerWebviewRetryTimer = setTimeout(() => {
    webview.src = SPOOLER_UI_URL
    appendTerminalLine(`[${isoStamp()}] [Spooler] retrying UI attach (${spoolerWebviewRetryCount}/${SPOOLER_WEBVIEW_MAX_RETRIES})`)
  }, SPOOLER_WEBVIEW_RETRY_MS)
}

function cloneTemplate(id) {
  const template = document.getElementById(id)
  return template ? template.content.cloneNode(true) : document.createDocumentFragment()
}

function mountContent(node) {
  if (!stageContent) return
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
    if (line.includes('[CAPTURED]') && !NixieTicker.isBusy()) {
      const cap = line.match(/\[CAPTURED\]\s+(.+?)\s+->\s+(.+)/)
      if (cap) {
        updateNixieReadout(`CAPTURE :: ${cap[1].trim()} :: ${cap[2].trim()}`)
      }
    } else if (!NixieTicker.isBusy() && line.includes('[scrapetag]') && (line.includes('launching in-app') || line.includes('webview ready'))) {
      updateNixieReadout(line.replace(/^\[[^\]]+\]\s*/, '').trim())
    } else if (line.includes('[Spooler]') && line.toLowerCase().includes('streamlit exited')) {
      spoolerHarnessActive = false
    }

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

  const marker = '[scrapetag:capture]'
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
  const toolName = typeof payload?.toolName === 'string' && payload.toolName.trim() ? payload.toolName.trim() : 'scrapetag'
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
  updateSelectorHud(normalizedCapture.alias, normalizedCapture.selector)
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
            console.log('[scrapetag] tagger cancelled')
          }

          const finishTagging = () => {
            const name = input.value.trim()

            if (!name) {
              cleanup()
              console.log('[scrapetag] tagger aborted')
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
              toolName: 'scrapetag',
              timestamp: new Date().toISOString()
            }

            try {
              window.parent.postMessage({ type: 'selector-captured', payload }, '*')
            } catch {}

            try {
              window.postMessage({ type: 'selector-captured', payload }, '*')
            } catch {}

            console.log('[scrapetag:capture]' + JSON.stringify(payload))
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
              console.log('[scrapetag] tagger dismissed via backdrop')
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
        console.log('[scrapetag] in-app tagger armed')
        return 'armed'
      })()
    `,
    true
  )

  return injectionResult
}

async function applyWebviewWidthFit(webview) {
  if (!webview || typeof webview.getBoundingClientRect !== 'function') {
    return
  }
  try {
    const hostW = webview.getBoundingClientRect().width
    if (hostW < 64) {
      return
    }
    const contentW = await webview.executeJavaScript(
      `
      (function () {
        const de = document.documentElement
        const b = document.body
        return Math.max(
          de ? de.scrollWidth : 0,
          b ? b.scrollWidth : 0,
          de ? de.clientWidth : 0,
          1
        )
      })()
    `,
      true
    )
    if (!contentW || contentW <= 0) {
      webview.setZoomFactor(1)
      return
    }
    const factor = Math.min(1, Math.max(0.2, hostW / contentW))
    webview.setZoomFactor(factor)
  } catch {
    try {
      webview.setZoomFactor(1)
    } catch {
      /* ignore */
    }
  }
}

function bindScrapeWebview(webview) {
  if (!webview || webview.dataset.bound === '1') {
    return
  }

  webview.dataset.bound = '1'

  webview.addEventListener('did-start-loading', () => {
    try {
      webview.setZoomFactor(1)
    } catch {
      /* ignore */
    }
    appendTerminalLine(`[${isoStamp()}] [scrapetag] webview loading started`)
  })

  webview.addEventListener('did-stop-loading', () => {
    appendTerminalLine(`[${isoStamp()}] [scrapetag] webview loading complete`)
    const u = typeof webview.getURL === 'function' ? webview.getURL() : ''
    if (u && u !== 'about:blank') {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => applyWebviewWidthFit(webview))
      })
    }
  })

  webview.addEventListener('did-fail-load', (event) => {
    appendTerminalLine(`[${isoStamp()}] [scrapetag] webview load failed: ${event.errorDescription}`)
  })

  webview.addEventListener('console-message', (event) => {
    if (handleOverlayMessage(event.message)) return
    const capture = parseScrapeCaptureMessage(event.message)
    if (capture) {
      handleScrapeCapture(capture)
      return
    }
    appendTerminalLine(`[${isoStamp()}] ${event.message}`)
  })

  webview.addEventListener('dom-ready', () => {
    bindSelectorCaptureBridge()
    appendTerminalLine(`[${isoStamp()}] [scrapetag] webview ready`)
    appendTerminalLine(`[${isoStamp()}] [scrapetag] click "Start Harvest" to crawl interactive nodes`)
    const urlDisplay = document.getElementById('wv-current-url')
    if (urlDisplay) {
      try {
        urlDisplay.textContent = webview.getURL()
      } catch {
        urlDisplay.textContent = ''
      }
    }
    NixieTicker.idle()
  })
}

const ALL_NODE_SELECTORS = [
  'a[href]', 'button:not([disabled])',
  'input:not([type="hidden"]):not([disabled])', 'select:not([disabled])', 'textarea:not([disabled])',
  '[role="button"]', '[role="link"]', '[role="menuitem"]', '[role="tab"]',
  '[role="checkbox"]', '[role="radio"]', '[role="switch"]', '[role="combobox"]', '[role="option"]',
  '[onclick]', '[tabindex]:not([tabindex="-1"])',
  'img', 'video', 'canvas', 'svg', 'iframe',
  'h1', 'h2', 'h3', 'h4', 'p', 'li', 'figcaption', 'label', 'summary',
  'section[id]', 'article[id]', 'aside[id]', 'header[id]', 'footer[id]', 'main[id]', 'nav[id]',
  'div[id]', 'ul[id]', 'ol[id]', 'span[id]',
  '[class*="title" i]', '[class*="tag" i]', '[class*="badge" i]', '[class*="chip" i]', '[class*="label" i]', '[class*="heading" i]',
  '[class*="metric" i]', '[class*="kpi" i]', '[class*="stat" i]', '[class*="value" i]', '[class*="number" i]',
  '[class*="description" i]', '[class*="desc" i]', '[class*="summary" i]', '[class*="subtitle" i]', '[class*="caption" i]',
  '[data-testid]', '[data-test]', '[data-cy]', '[data-qa]',
].join(',')

const HARVEST_NODE_SCRIPT = `
(function () {
  var SELECTORS = ${JSON.stringify(ALL_NODE_SELECTORS)};

  var SKIP_TAGS = new Set(['script','style','meta','head','html','body','link','noscript','template','br','hr','wbr','path','g','defs','clippath','lineargradient','symbol']);

  function buildSelector(el) {
    if (el.id) return '#' + CSS.escape(el.id);
    var parts = [];
    var current = el;
    while (current && current !== document.documentElement && parts.length < 6) {
      var tag = current.tagName.toLowerCase();
      if (SKIP_TAGS.has(tag)) break;
      var part = tag;
      if (current.id) {
        part = '#' + CSS.escape(current.id);
        parts.unshift(part);
        break;
      }
      var cls = Array.from(current.classList).filter(function(c) { return /^[a-zA-Z_-]/.test(c) && c.length > 1; }).slice(0, 2);
      if (cls.length) part += '.' + cls.join('.');
      if (current.parentElement) {
        var siblings = Array.from(current.parentElement.children).filter(function(s) { return s.tagName === current.tagName; });
        if (siblings.length > 1) part += ':nth-of-type(' + (siblings.indexOf(current) + 1) + ')';
      }
      parts.unshift(part);
      current = current.parentElement;
    }
    return parts.join(' > ');
  }

  function buildPatternSignature(el) {
    var tag = el.tagName.toLowerCase();
    var cls = Array.from(el.classList)
      .map(function(c) { return c.toLowerCase(); })
      .filter(function(c) {
        if (c.length <= 2) return false;
        // Drop highly-unique generated classes that explode grouping.
        if (/[0-9]{3,}/.test(c)) return false;
        if (c.length > 28) return false;
        return true;
      })
      .slice(0, 4)
      .sort()
      .join('.');
    var pTag = el.parentElement ? el.parentElement.tagName.toLowerCase() : '';
    var pCls = el.parentElement
      ? Array.from(el.parentElement.classList)
          .map(function(c) { return c.toLowerCase(); })
          .filter(function(c) {
            if (c.length <= 2) return false;
            if (/[0-9]{3,}/.test(c)) return false;
            if (c.length > 28) return false;
            return true;
          })
          .slice(0, 4)
          .sort()
          .join('.')
      : '';
    var sibCount = el.parentElement
      ? Array.from(el.parentElement.children).filter(function(s) { return s.tagName === el.tagName; }).length
      : 1;
    // Structural signature only: one master per repeated UI pattern.
    return tag + '[' + cls + ']<' + pTag + '[' + pCls + ']|x' + sibCount;
  }

  function getLabel(el) {
    var tag = el.tagName.toLowerCase();
    if (tag === 'img') {
      var alt = el.getAttribute('alt') || '';
      var src = (el.getAttribute('src') || '').split('/').pop().split('?')[0].slice(0, 40);
      return alt || src || 'image';
    }
    var label = (
      el.getAttribute('aria-label') || el.getAttribute('title') ||
      el.getAttribute('alt') || el.getAttribute('placeholder') ||
      el.textContent || ''
    ).trim();
    return label.length > 80 ? label.slice(0, 80) + '...' : label;
  }

  function isRendered(el, style) {
    if (el.hidden) return false;
    if (style.display === 'none' || style.visibility === 'hidden' || style.contentVisibility === 'hidden') return false;
    if (el.getAttribute('aria-hidden') === 'true' && style.pointerEvents === 'none') return false;
    if (el.offsetWidth > 0 || el.offsetHeight > 0) return true;
    if (el.getClientRects && el.getClientRects().length > 0) return true;
    var rect = el.getBoundingClientRect();
    if (rect.width > 0 || rect.height > 0) return true;
    return false;
  }

  function buildIdentityTuple(el, label, rect) {
    var tag = (el.tagName || '').toLowerCase();
    var role = (el.getAttribute('role') || '').toLowerCase();
    var id = (el.id || '').trim();
    var stableData = (
      el.getAttribute('data-testid') ||
      el.getAttribute('data-test') ||
      el.getAttribute('data-cy') ||
      el.getAttribute('data-qa') ||
      ''
    ).trim();
    var href = (el.getAttribute('href') || '').trim().slice(0, 120);
    var src = (el.getAttribute('src') || '').trim().slice(0, 120);
    var action = (el.getAttribute('action') || '').trim().slice(0, 120);
    var name = (el.getAttribute('name') || '').trim().slice(0, 60);
    var type = (el.getAttribute('type') || '').trim().slice(0, 32);
    var normLabel = (label || '').trim().replace(/\\s+/g, ' ').slice(0, 80);
    var rectSig = [
      Math.round(rect.left),
      Math.round(rect.top),
      Math.round(rect.width),
      Math.round(rect.height),
    ].join(',');
    return [tag, role, id, stableData, href, src, action, name, type, normLabel, rectSig].join('|');
  }

  function buildClassTokens(el) {
    function tokenize(element) {
      return Array.from(element.classList || [])
        .map(function(c) { return c.toLowerCase(); })
        .flatMap(function(c) { return c.split(/[-_]+/); })
        .filter(function(t) { return t && t.length >= 2; });
    }
    var own = tokenize(el);
    var p1 = el.parentElement ? tokenize(el.parentElement) : [];
    var p2 = (el.parentElement && el.parentElement.parentElement)
      ? tokenize(el.parentElement.parentElement)
      : [];
    return Array.from(new Set(own.concat(p1).concat(p2))).slice(0, 30);
  }

  function nodeType(el) {
    var tag = el.tagName.toLowerCase();
    if (tag === 'a') return 'link';
    if (tag === 'button' || el.getAttribute('role') === 'button') return 'button';
    if (tag === 'input') return 'input[' + (el.type || 'text') + ']';
    if (tag === 'select') return 'select';
    if (tag === 'textarea') return 'textarea';
    if (tag === 'img' || tag === 'picture') return 'image';
    if (tag === 'video') return 'video';
    if (tag === 'canvas') return 'canvas';
    if (tag === 'svg') return 'svg';
    if (tag === 'iframe') return 'iframe';
    if (tag === 'form') return 'form';
    if (tag === 'label') return 'label';
    if (/^h[1-6]$/.test(tag)) return 'heading[' + tag + ']';
    if (tag === 'p') return 'paragraph';
    if (tag === 'figure') return 'figure';
    if (tag === 'blockquote') return 'blockquote';
    if (['header','footer','main','nav','section','article','aside'].indexOf(tag) !== -1) return 'landmark[' + tag + ']';
    var role = el.getAttribute('role');
    if (role) return 'role[' + role + ']';
    return tag;
  }

  var seen = new Set();
  var nodes = [];
  try {
    var matches = document.querySelectorAll(SELECTORS);
    matches.forEach(function(el) {
      var tag = el.tagName.toLowerCase();
      if (SKIP_TAGS.has(tag)) return;
      var style = window.getComputedStyle(el);
      if (!isRendered(el, style)) return;
      var sel = buildSelector(el);
      if (!sel) return;
      var rect = el.getBoundingClientRect();
      var label = getLabel(el);
      var identity = buildIdentityTuple(el, label, rect);
      var dedupKey = sel + '||' + identity;
      if (seen.has(dedupKey)) return;
      seen.add(dedupKey);
      var scrollTop = window.scrollY || document.documentElement.scrollTop || 0;
      var scrollLeft = window.scrollX || document.documentElement.scrollLeft || 0;
      nodes.push({
        index: nodes.length,
        type: nodeType(el),
        selector: sel,
        label: label,
        classTokens: buildClassTokens(el),
        patternSig: buildPatternSignature(el),
        rect: {
          x: Math.round(rect.x + scrollLeft),
          y: Math.round(rect.y + scrollTop),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        }
      });
    });
  } catch(e) {
    nodes.push({ error: e.message });
  }
  return nodes;
})()
`

let lastHarvestNodes = []

function scoreNodeConfidence(selector) {
  let score = 50
  if (/^#[a-zA-Z]/.test(selector)) score += 50
  if (/\[data-/.test(selector)) score += 30
  if (/aria-label|aria-labelledby/.test(selector)) score += 15
  if (/nth-of-type/.test(selector)) score -= 35
  const depth = (selector.match(/>/g) || []).length
  if (depth >= 4 && !/^#/.test(selector)) score -= 20
  if (/\b(btn|el|item|wrap|container|inner|outer|root|box)\b/.test(selector)) score -= 10
  return Math.max(0, Math.min(100, score))
}

function extractNamespace(selector) {
  if (!selector) return null
  const parts = selector.split(' > ')

  const GENERIC_TOKENS = new Set([
    'div', 'span', 'ul', 'li', 'section', 'article', 'wrapper',
    'container', 'inner', 'outer', 'row', 'col', 'grid', 'box',
    'wrap', 'item', 'list', 'content', 'body', 'root', 'el', 'block',
  ])

  // Prefer the direct parent segment's meaningful class to avoid
  // collapsing all descendants into a distant ancestor ID namespace.
  if (parts.length >= 2) {
    const parentPart = parts[parts.length - 2]
    const parentClasses = (parentPart.match(/\.[a-zA-Z0-9_-]+/g) || []).map((c) => c.slice(1))
    for (const cls of parentClasses) {
      const tokens = cls.toLowerCase().split(/[-_]+/)
      if (!tokens.every((t) => GENERIC_TOKENS.has(t) || t.length <= 2)) {
        return cls.toLowerCase()
      }
    }
  }

  for (let i = parts.length - 2; i >= 0; i--) {
    const m = parts[i].match(/#([a-zA-Z][\w-]*)/)
    if (m) {
      return m[1]
        .replace(/([a-z])([A-Z])/g, '$1-$2')
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
        .toLowerCase()
    }
  }
  const LANDMARK_TAGS = ['nav', 'header', 'footer', 'main', 'section', 'article', 'aside']
  for (let i = parts.length - 2; i >= 0; i--) {
    const tag = parts[i].split(/[.:#[\s]/)[0].toLowerCase()
    if (LANDMARK_TAGS.includes(tag)) return tag
  }
  return null
}

function extractSelectorClassTokens(selector) {
  if (!selector) return []
  const parts = selector.split(' > ')
  const allClassMatches = parts.flatMap((part) =>
    (part.match(/\.[a-zA-Z0-9_-]+/g) || []).map((c) => c.slice(1).toLowerCase())
  )
  return Array.from(
    new Set(
      allClassMatches
        .flatMap((c) => c.split(/[-_]+/))
        .map((t) => t.trim())
        .filter((t) => t.length >= 2)
    )
  )
}

function semanticSuffix(node, selector = '') {
  const type = node.type
  const label = (node.label || '').toLowerCase()
  const nodeTokens = Array.isArray(node.classTokens) ? node.classTokens : []
  const selectorTokens = extractSelectorClassTokens(selector)
  const tokens = Array.from(new Set([...nodeTokens, ...selectorTokens]))
  const has = (token) => tokens.includes(token)
  const hasAny = (arr) => arr.some((t) => has(t))
  if (hasAny(['title', 'heading', 'headline', 'name', 'header'])) return 'title'
  if (hasAny(['metric', 'kpi', 'stat', 'value', 'number', 'count', 'percent', 'score'])) return 'metric'
  if (hasAny(['caption', 'label'])) return 'label'
  if (hasAny(['subtitle', 'subhead', 'description', 'desc', 'excerpt', 'summary', 'body', 'text', 'copy'])) return 'subtitle'
  if (hasAny(['tag', 'tags', 'chip', 'badge', 'pill', 'category', 'skill', 'tech'])) return 'tag'
  if (hasAny(['img', 'image', 'photo', 'thumb', 'thumbnail', 'avatar', 'cover', 'poster'])) return 'img'
  if (hasAny(['cta', 'action', 'primary'])) return 'cta-btn'
  if (hasAny(['author', 'meta', 'byline', 'date', 'time', 'timestamp'])) return 'meta'
  if (/^\s*(\d+([.,]\d+)?\s*(%|x|yrs?|years?)?)\s*$/.test(label)) return 'metric'
  const isPlayLike = /(^|\b)(play|watch|video)(\b|$)/i.test(label)
  if (isPlayLike && (type === 'button' || type === 'link' || type === 'svg' || type.startsWith('role[button'))) return 'play-btn'
  if (type === 'link') return 'link'
  if (type === 'button' || type.startsWith('role[button')) {
    if (/play|launch|start|run/i.test(label)) return 'play-btn'
    if (/close|dismiss|cancel/i.test(label)) return 'close-btn'
    if (/submit|confirm|save/i.test(label)) return 'submit-btn'
    if (/next|›|more/i.test(label)) return 'next-btn'
    if (/prev|back|‹/i.test(label)) return 'prev-btn'
    if (/see all|view all/i.test(label)) return 'view-all-btn'
    return 'btn'
  }
  if (type.startsWith('input')) return type.replace('input[', 'input-').replace(']', '')
  if (type === 'select') return 'select'
  if (type === 'textarea') return 'textarea'
  if (type === 'image') return 'img'
  if (type === 'video') return 'video'
  if (type === 'canvas') return 'canvas'
  if (type === 'svg') return 'icon'
  if (type === 'iframe') return 'frame'
  if (type === 'heading[h1]') return 'header'
  if (type === 'heading[h2]') return 'sub-header'
  if (type === 'heading[h3]') return 'section-title'
  if (type === 'heading[h4]') return 'caption'
  if (type === 'landmark[nav]') return 'nav-container'
  if (type === 'landmark[header]') return 'header-bar'
  if (type === 'landmark[footer]') return 'footer-bar'
  if (type === 'landmark[main]') return 'main-container'
  if (type === 'landmark[section]') return 'section-container'
  if (type === 'landmark[article]') return 'article-container'
  if (type === 'landmark[aside]') return 'sidebar-container'
  return 'container'
}

function deriveActionLabelSlug(node) {
  const raw = (node.label || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!raw) return ''
  const STOP = new Set(['link', 'button', 'btn', 'click', 'tap', 'go', 'to'])
  const tokens = raw
    .split(' ')
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !STOP.has(t))
    .slice(0, 3)
  return tokens.join('-')
}

function deriveLogicalName(node, options = {}) {
  const strictMode = Boolean(options.strictMode)
  const sel = node.selector || ''
  let name

  // Only treat this as an element-level ID shortcut when the selector is
  // exactly an ID selector, not a descendant path rooted at an ancestor ID.
  if (/^#[a-zA-Z][\w-]*$/.test(sel)) {
    const idMatch = sel.match(/^#([a-zA-Z][\w-]*)/)
    if (idMatch) {
      const base = idMatch[1]
        .replace(/([a-z])([A-Z])/g, '$1-$2')
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
        .toLowerCase()
      const suffix = semanticSuffix(node, sel)
      if (suffix.endsWith('-container') || suffix === 'nav-container' || suffix === 'header-bar' || suffix === 'footer-bar' || suffix === 'main-container') {
        name = `${base}-container`
      } else if (/(^|-)btn$/.test(suffix) && !base.endsWith(`-${suffix}`)) {
        name = `${base}-${suffix}`
      } else {
        name = base
      }
    }
  }

  if (!name) {
    let namespace = extractNamespace(sel)
    if (strictMode && namespace) {
      if (/default-ltr|cache|[a-z0-9]{7,}/i.test(namespace) || /\d/.test(namespace)) {
        namespace = null
      }
    }
    const suffix = semanticSuffix(node, sel)
    const actionSlug = deriveActionLabelSlug(node)

    if (namespace) {
      if (suffix === 'link' && actionSlug) {
        name = `${namespace}-${actionSlug}-link`
      } else if (/(^|-)btn$/.test(suffix) && actionSlug) {
        name = `${namespace}-${actionSlug}-${suffix}`
      } else {
        name = `${namespace}-${suffix}`
      }
    } else {
      const raw = (node.label || node.type)
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .trim()
        .split(/\s+/)
        .slice(0, 3)
        .join('-')

      name = raw ? `${raw}-${suffix}` : `node-${node.index}-${suffix}`
    }
  }

  // Only append an index for non-first siblings; masters stay clean.
  if (node.groupSize > 1 && node.groupPosition != null && node.groupPosition > 0) {
    name = `${name}-${node.groupPosition + 1}`
  }

  return name
}

function deriveGroupKey(node, options = {}) {
  const strictMode = Boolean(options.strictMode)
  const selector = node.selector || ''
  let namespace = extractNamespace(selector) || 'global'
  if (strictMode && namespace !== 'global') {
    if (/default-ltr|cache|[a-z0-9]{7,}/i.test(namespace) || /\d/.test(namespace)) {
      namespace = 'global'
    }
  }
  const suffix = semanticSuffix(node, selector)
  const baseType = (node.type || '')
    .replace(/\[.*?\]/g, '')
    .toLowerCase()
    .trim()
  const rect = node.rect || {}
  const w = Math.max(1, Number(rect.width) || 1)
  const h = Math.max(1, Number(rect.height) || 1)
  const sizeBucket = `${Math.max(1, Math.round(w / 120))}x${Math.max(1, Math.round(h / 48))}`
  const normalizedLabel = (node.label || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  // Keep anti-flood grouping, but preserve short CTA siblings like EMAIL/LINKEDIN/GITHUB.
  const shortActionLabel =
    normalizedLabel &&
    normalizedLabel.length <= 18 &&
    normalizedLabel.split(' ').length <= 3
      ? normalizedLabel
      : ''
  const actionBucket =
    (baseType === 'link' || baseType === 'button') && shortActionLabel
      ? `action:${shortActionLabel}`
      : 'action:*'
  return [namespace, suffix, baseType, sizeBucket, actionBucket].join('|')
}

function applyPatternGroups(nodes, options = {}) {
  const groups = new Map()
  nodes.forEach((node) => {
    const sig = deriveGroupKey(node, options)
    if (!groups.has(sig)) groups.set(sig, [])
    groups.get(sig).push(node)
  })

  nodes.forEach((node) => {
    const group = groups.get(deriveGroupKey(node, options))
    const isMaster = group[0].index === node.index
    node.isMaster = isMaster
    node.isGhost = !isMaster
    node.collectionCount = group.length
    node.groupPosition = group.indexOf(node)
    node.groupSize = group.length
  })

  return nodes
}

async function deepScrollPage(webview) {
  const pageInfo = await webview.executeJavaScript(`({
    pageHeight: Math.max(document.body.scrollHeight, document.documentElement.scrollHeight, 1),
    viewHeight: window.innerHeight || 800
  })`, true)

  const { pageHeight, viewHeight } = pageInfo
  const steps = Math.max(1, Math.ceil(pageHeight / viewHeight))

  appendTerminalLine(`[${isoStamp()}] [scrapetag:scan] page: ${pageHeight}px — ${steps} scroll pass${steps === 1 ? '' : 'es'} required`)

  for (let i = 0; i < steps; i++) {
    const targetY = i * viewHeight
    await webview.executeJavaScript(`window.scrollTo({ top: ${targetY}, behavior: 'instant' })`, true)
    await new Promise((r) => setTimeout(r, 320))
    appendTerminalLine(`[${isoStamp()}] [scrapetag:scan] pass ${i + 1}/${steps} — ${Math.round(((i + 1) / steps) * 100)}%`)
    NixieTicker.scan(i + 1, steps)
  }

  await webview.executeJavaScript(`window.scrollTo({ top: 0, behavior: 'instant' })`, true)
  await new Promise((r) => setTimeout(r, 400))
  appendTerminalLine(`[${isoStamp()}] [scrapetag:scan] scroll complete — page reset, querying DOM...`)
  NixieTicker.querying()

  return { pageHeight, steps }
}

function mergeHarvestPasses(passes) {
  const byKey = new Map()
  passes.forEach((nodes) => {
    if (!Array.isArray(nodes)) return
    nodes.forEach((node) => {
      const rect = node?.rect || {}
      const key = [
        node?.selector || '',
        node?.type || '',
        (node?.label || '').trim().toLowerCase(),
        Number(rect.x || 0),
        Number(rect.y || 0),
        Number(rect.width || 0),
        Number(rect.height || 0),
      ].join('|')
      if (!byKey.has(key)) byKey.set(key, node)
    })
  })
  return Array.from(byKey.values()).map((node, index) => ({ ...node, index }))
}

async function runHarvestPass(webview, passLabel) {
  appendTerminalLine(`[${isoStamp()}] [scrapetag:harvest] DOM query pass ${passLabel}...`)
  let raw = []
  try {
    raw = await webview.executeJavaScript(HARVEST_NODE_SCRIPT, true)
  } catch (err) {
    appendTerminalLine(`[${isoStamp()}] [scrapetag:harvest] pass ${passLabel} script error: ${err.message}`)
    return []
  }
  if (!Array.isArray(raw)) return []
  if (raw[0]?.error) {
    appendTerminalLine(`[${isoStamp()}] [scrapetag:harvest] pass ${passLabel} DOM error: ${raw[0].error}`)
    return []
  }
  appendTerminalLine(`[${isoStamp()}] [scrapetag:harvest] pass ${passLabel} captured ${raw.length} raw nodes`)
  return raw
}

function computeSelectorNoiseStats(masters) {
  const noisyPattern = /(default-ltr|cache-|_[a-z0-9]{5,}|[a-z]{1,4}\d[a-z0-9-]{4,}|[a-z0-9]{8,}-[a-z0-9]{6,})/i
  const total = Array.isArray(masters) ? masters.length : 0
  if (!total) return { total: 0, noisy: 0, ratio: 0 }
  let noisy = 0
  masters.forEach((node) => {
    const sig = `${node?.logicalName || ''}|${node?.selector || ''}`
    if (noisyPattern.test(sig)) noisy += 1
  })
  return { total, noisy, ratio: noisy / total }
}

function closeStrictSuggestModal() {
  if (strictSuggestModalEl) {
    strictSuggestModalEl.remove()
    strictSuggestModalEl = null
  }
}

function showStrictSuggestModal({ noisy, total, onRerun, onKeep }) {
  closeStrictSuggestModal()
  const overlay = document.createElement('div')
  overlay.className = 'strict-suggest-modal'
  overlay.innerHTML = `
    <div class="strict-suggest-card" role="dialog" aria-modal="true" aria-label="Strict mode suggestion">
      <p class="strict-suggest-title">Dynamic Selector Noise Detected</p>
      <p class="strict-suggest-text">${noisy}/${total} captured tags look highly dynamic. Re-running in Strict Mode can produce cleaner, test-ready names.</p>
      <div class="strict-suggest-actions">
        <button type="button" class="strict-suggest-btn" data-strict-choice="keep">Keep current tags</button>
        <button type="button" class="strict-suggest-btn strict-suggest-btn--primary" data-strict-choice="rerun">RERUN IN STRICT MODE</button>
      </div>
    </div>
  `
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      closeStrictSuggestModal()
      onKeep?.()
    }
  })
  const keepBtn = overlay.querySelector('[data-strict-choice="keep"]')
  const rerunBtn = overlay.querySelector('[data-strict-choice="rerun"]')
  if (keepBtn) {
    keepBtn.addEventListener('click', () => {
      closeStrictSuggestModal()
      onKeep?.()
    })
  }
  if (rerunBtn) {
    rerunBtn.addEventListener('click', () => {
      closeStrictSuggestModal()
      onRerun?.()
    })
  }
  strictSuggestModalEl = overlay
  const stageWrap = document.querySelector('.stage-wrap')
  if (stageWrap) {
    overlay.classList.add('strict-suggest-modal--stage')
    stageWrap.appendChild(overlay)
  } else {
    document.body.appendChild(overlay)
  }
}

async function harvestInteractiveNodes(webview, options = {}) {
  const strictMode = options.forceStrict != null ? Boolean(options.forceStrict) : isStrictHarvestEnabled()
  const url = typeof webview.getURL === 'function' ? webview.getURL() : ''
  if (!url || url === 'about:blank') {
    appendTerminalLine(`[${isoStamp()}] [scrapetag:harvest] no page loaded — launch a session first`)
    return
  }

  appendTerminalLine(`[${isoStamp()}] [scrapetag:harvest] ── TOTAL RECALL INITIATED ──`)
  appendTerminalLine(`[${isoStamp()}] [scrapetag:harvest] target: ${url}`)
  appendTerminalLine(`[${isoStamp()}] [scrapetag:harvest] mode: ${strictMode ? 'strict' : 'normal'}`)
  NixieTicker.boot(url)

  try {
    await deepScrollPage(webview)
  } catch (err) {
    appendTerminalLine(`[${isoStamp()}] [scrapetag:scan] scroll warning: ${err.message}`)
  }

  appendTerminalLine(`[${isoStamp()}] [scrapetag:harvest] querying all visible nodes...`)
  const pass1 = await runHarvestPass(webview, '1/2')
  await new Promise((r) => setTimeout(r, 450))
  const pass2 = await runHarvestPass(webview, '2/2')
  const rawNodes = mergeHarvestPasses([pass1, pass2])

  if (!Array.isArray(rawNodes) || rawNodes.length === 0) {
    appendTerminalLine(`[${isoStamp()}] [scrapetag:harvest] no nodes found`)
    return
  }

  const withGroups = applyPatternGroups(rawNodes.map((node) => ({
    ...node,
    confidence: scoreNodeConfidence(node.selector),
  })), { strictMode })
  const nodes = withGroups.map((node) => ({
    ...node,
    logicalName: deriveLogicalName(node, { strictMode }),
  }))
  lastHarvestNodes = nodes

  const masters = nodes.filter((n) => n.isMaster)
  const ghosts = nodes.filter((n) => n.isGhost)
  const green = masters.filter((n) => n.confidence >= 60).length
  const orange = masters.filter((n) => n.confidence < 60).length
  const collections = masters.filter((n) => n.collectionCount > 1).length
  const captureFeed = masters.map((n) => n.logicalName).filter(Boolean)

  NixieTicker.done(
    { total: nodes.length, masters: masters.length, ghosts: ghosts.length, green, orange, collections },
    captureFeed
  )

  appendTerminalLine(`[${isoStamp()}] [scrapetag:harvest] ── TOTAL RECALL COMPLETE ──`)
  appendTerminalLine(`[${isoStamp()}] [scrapetag:harvest] ${nodes.length} nodes total | ${masters.length} unique | ${ghosts.length} grouped`)
  appendTerminalLine(`[${isoStamp()}] [scrapetag:harvest] confidence: ${green} green / ${orange} orange | ${collections} collections`)
  masters.forEach((node) => {
    const rect = node.rect
    const coords = `(${rect.x},${rect.y}) ${rect.width}×${rect.height}`
    const tier = node.confidence >= 60 ? '🟢' : '🟠'
    const badge = node.collectionCount > 1 ? ` ×${node.collectionCount}` : ''
    appendTerminalLine(`[${isoStamp()}] ${tier} [${String(node.index).padStart(3, '0')}] ${node.type}${badge} "${node.logicalName}" | ${coords} | ${node.selector}`)
  })
  appendTerminalLine(`[${isoStamp()}] [scrapetag:harvest] ── rendering overlays... ──`)

  await drawHarvestOverlays(webview, nodes)

  if (!strictMode && !options.fromSuggestion) {
    const stats = computeSelectorNoiseStats(masters)
    const shouldSuggest = stats.total >= 20 && stats.noisy >= 8 && stats.ratio >= 0.28
    const suggestionKey = `${url}::normal`
    if (shouldSuggest && !strictSuggestionSeenForUrl.has(suggestionKey)) {
      strictSuggestionSeenForUrl.add(suggestionKey)
      showStrictSuggestModal({
        noisy: stats.noisy,
        total: stats.total,
        onKeep: () => {
          appendTerminalLine(`[${isoStamp()}] [scrapetag:strict] kept current tags`)
        },
        onRerun: async () => {
          setStrictHarvestEnabled(true)
          appendTerminalLine(`[${isoStamp()}] [scrapetag:strict] strict mode rerun requested`)
          await harvestInteractiveNodes(webview, { forceStrict: true, fromSuggestion: true })
        },
      })
    }
  }
}

const OVERLAY_INJECT_SCRIPT = (nodes) => `
(function (nodes) {
  var ROOT_ID = '__gt-overlay-root__';
  var existing = document.getElementById(ROOT_ID);
  if (existing) existing.remove();

  var root = document.createElement('div');
  root.id = ROOT_ID;
  root.style.cssText = 'position:absolute;top:0;left:0;width:0;height:0;pointer-events:none;z-index:2147483640;';
  document.body.appendChild(root);

  var styleId = '__gt-overlay-style__';
  if (!document.getElementById(styleId)) {
    var s = document.createElement('style');
    s.id = styleId;
    s.textContent = [
      '@keyframes __gtBloom{from{opacity:0;transform:scale(0.82)}to{opacity:1;transform:scale(1)}}',
      '.__gt-box{position:absolute;box-sizing:border-box;pointer-events:all;border-radius:4px;',
        'animation:__gtBloom 0.22s cubic-bezier(0.34,1.56,0.64,1) both;}',
      '.__gt-box--ghost{opacity:0.18!important;border-style:dashed!important;',
        'pointer-events:none!important;box-shadow:none!important;background:none!important;animation:none!important;}',
      '.__gt-label{position:absolute;bottom:100%;left:-1px;margin-bottom:3px;',
        'background:rgba(5,6,6,0.72);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);',
        'border:1px solid currentColor;border-radius:4px 4px 0 0;color:inherit;',
        'font:700 10px/1.4 monospace;letter-spacing:.07em;padding:2px 8px;',
        'white-space:nowrap;max-width:220px;overflow:hidden;text-overflow:ellipsis;',
        'text-shadow:0 0 8px currentColor;cursor:text;outline:none;}',
      '.__gt-badge{position:absolute;top:3px;left:3px;background:rgba(5,6,6,0.80);',
        'backdrop-filter:blur(4px);border:1px solid currentColor;border-radius:3px;',
        'color:inherit;font:700 9px monospace;padding:1px 5px;letter-spacing:.05em;pointer-events:none;}',
      '.__gt-x{position:absolute;top:3px;right:3px;width:16px;height:16px;',
        'background:#d90429;border:0;border-radius:3px;color:#fff;',
        'font:700 10px/16px monospace;cursor:pointer;padding:0;z-index:1;}',
    ].join('');
    document.head.appendChild(s);
  }

  var masterCount = 0;
  nodes.forEach(function (node) {
    var el;
    try { el = document.querySelector(node.selector); } catch (e) { el = null; }
    if (!el) return;

    var scrollTop = window.scrollY || document.documentElement.scrollTop || 0;
    var scrollLeft = window.scrollX || document.documentElement.scrollLeft || 0;
    var r = el.getBoundingClientRect();
    var top = r.top + scrollTop;
    var left = r.left + scrollLeft;
    if (r.width === 0 || r.height === 0) return;

    var isGreen = node.confidence >= 60;
    var color = isGreen ? '#b8ff5a' : '#ff9500';
    var rgb = isGreen ? '184,255,90' : '255,149,0';

    var box = document.createElement('div');
    box.className = '__gt-box' + (node.isGhost ? ' __gt-box--ghost' : '');
    box.setAttribute('data-test-index', node.index);
    box.style.cssText = [
      'top:' + top + 'px;',
      'left:' + left + 'px;',
      'width:' + r.width + 'px;',
      'height:' + r.height + 'px;',
      '--gc:' + color + ';--gr:' + rgb + ';',
      'color:' + color + ';',
      'border:2px solid ' + color + ';',
      node.isGhost ? '' : [
        'background:linear-gradient(135deg,rgba(' + rgb + ',0.13) 0%,rgba(' + rgb + ',0.04) 100%);',
        'box-shadow:',
          '0 0 0 1px rgba(' + rgb + ',0.28),',
          '0 0 10px rgba(' + rgb + ',0.55),',
          '0 0 28px rgba(' + rgb + ',0.28),',
          '0 6px 20px rgba(0,0,0,0.55);',
        'animation-delay:' + (node.isMaster ? masterCount * 65 : 0) + 'ms;',
      ].join(''),
    ].join('');

    if (node.isMaster) masterCount++;

    if (!node.isGhost) {
      var label = document.createElement('div');
      label.className = '__gt-label';
      label.contentEditable = 'true';
      label.textContent = node.logicalName;
      label.addEventListener('blur', function () {
        var updated = label.textContent.trim().replace(/\\s+/g, '-').toLowerCase();
        if (updated) label.textContent = updated;
        console.log('[scrapetag:overlay:label]' + JSON.stringify({ index: node.index, logicalName: label.textContent }));
      });
      label.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); label.blur(); }
      });

      if (node.collectionCount > 1) {
        var badge = document.createElement('div');
        badge.className = '__gt-badge';
        badge.textContent = '\\u00d7' + node.collectionCount;
        box.appendChild(badge);
      }

      var xBtn = document.createElement('button');
      xBtn.className = '__gt-x';
      xBtn.textContent = 'X';
      xBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        box.remove();
        console.log('[scrapetag:overlay:exclude]' + JSON.stringify({ index: node.index }));
      });

      box.appendChild(label);
      box.appendChild(xBtn);
    }

    root.appendChild(box);
  });

  return { drawn: root.children.length, masters: masterCount };
})(${JSON.stringify(nodes)})
`

async function drawHarvestOverlays(webview, nodes) {
  try {
    const result = await webview.executeJavaScript(OVERLAY_INJECT_SCRIPT(nodes), true)
    appendTerminalLine(`[${isoStamp()}] [scrapetag:harvest] ✦ ${result?.masters ?? 0} master boxes / ${result?.drawn ?? 0} total rendered`)
  } catch (err) {
    appendTerminalLine(`[${isoStamp()}] [scrapetag:harvest] overlay error: ${err.message}`)
  }
}

function parseOverlayMessage(message) {
  if (typeof message !== 'string') return null
  if (message.startsWith('[scrapetag:overlay:label]')) {
    try { return { type: 'label', ...JSON.parse(message.slice('[scrapetag:overlay:label]'.length)) } } catch { return null }
  }
  if (message.startsWith('[scrapetag:overlay:exclude]')) {
    try { return { type: 'exclude', ...JSON.parse(message.slice('[scrapetag:overlay:exclude]'.length)) } } catch { return null }
  }
  return null
}

function handleOverlayMessage(msg) {
  const parsed = parseOverlayMessage(msg)
  if (!parsed) return false

  const node = lastHarvestNodes.find((n) => n.index === parsed.index)
  if (!node) return true

  if (parsed.type === 'label') {
    node.logicalName = parsed.logicalName
    appendTerminalLine(`[${isoStamp()}] [scrapetag:overlay] renamed [${parsed.index}] → "${parsed.logicalName}"`)
  } else if (parsed.type === 'exclude') {
    lastHarvestNodes = lastHarvestNodes.filter((n) => n.index !== parsed.index)
    appendTerminalLine(`[${isoStamp()}] [scrapetag:overlay] excluded [${parsed.index}] — ${lastHarvestNodes.length} nodes remain`)
  }
  return true
}

function launchScrapeSession() {
  closeStrictSuggestModal()
  const scrapeShell = document.getElementById('scrape-shell')
  const webview = document.getElementById('scrape-webview')
  const urlInput = document.getElementById('scrape-target-url')

  if (!scrapeShell || !webview) {
    appendTerminalLine(`[${isoStamp()}] [scrapetag] in-app webview container unavailable`)
    return
  }

  const rawField = String(urlInput?.value ?? '').trim()
  let targetUrl = null
  if (rawField) {
    targetUrl = resolveScrapeTargetUrl(rawField)
    if (!targetUrl) {
      appendTerminalLine(`[${isoStamp()}] [scrapetag] invalid target URL`)
      return
    }
  } else {
    targetUrl =
      resolveScrapeTargetUrl(localStorage.getItem(SCRAPE_URL_STORAGE_KEY) || '') || DEFAULT_SCRAPE_URL
  }

  if (urlInput) {
    urlInput.value = targetUrl
  }
  localStorage.setItem(SCRAPE_URL_STORAGE_KEY, targetUrl)

  scrapeShell.hidden = false
  bindScrapeWebview(webview)
  appendTerminalLine(`[${isoStamp()}] [scrapetag] launching in-app session: ${targetUrl}`)
  webview.src = targetUrl
}

async function launchEnvHarness(toolInfo = null, { auto = false } = {}) {
  const spoolerShellMounted = document.getElementById('spooler-shell')
  const spoolerWebview = document.getElementById('spooler-webview')
  if (!spoolerShellMounted || !spoolerWebview) {
    appendTerminalLine(`[${isoStamp()}] [Spooler] webview container unavailable`)
    return
  }

  if (spoolerHarnessLaunchPending) {
    return
  }

  if (spoolerHarnessActive && spoolerWebview.src === SPOOLER_UI_URL) {
    return
  }

  spoolerHarnessLaunchPending = true
  try {
    const health = await refreshSpoolerDependencyStatus({ logMissing: !auto })
    if (!health.healthy) {
      if (!auto) {
        appendTerminalLine(`[${isoStamp()}] [Spooler] launch blocked until dependencies are installed`)
      }
      return
    }

    spoolerWebviewRetryCount = 0
    clearSpoolerWebviewRetry()
    window.ghostOps.launchTool('Spooler')
    spoolerHarnessActive = true
    spoolerShellMounted.hidden = false
    spoolerWebview.src = SPOOLER_UI_URL
    appendTerminalLine(`[${isoStamp()}] [Spooler] loading UI at ${SPOOLER_UI_URL}`)
  } finally {
    spoolerHarnessLaunchPending = false
  }
}

function attachPreviewFallback(img) {
  img.addEventListener('error', () => {
    img.alt = 'Preview GIF unavailable on disk'
    img.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 640 360'%3E%3Crect width='640' height='360' fill='%23080909'/%3E%3Ctext x='50%25' y='50%25' fill='%2339FF14' font-size='26' font-family='monospace' dominant-baseline='middle' text-anchor='middle'%3EPREVIEW OFFLINE%3C/text%3E%3C/svg%3E"
  })
}

function renderBlackBoxHoldingState(chip = 'state-a') {
  const wrap = document.createElement('section')
  wrap.className = 'blackbox-holding'

  const logo = document.createElement('img')
  logo.className = 'blackbox-holding-logo'
  logo.src = '../Toolbelt/BlackBox/assets/buildghost-placeholder.png'
  logo.alt = 'BLACKbox'

  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'primary-action blackbox-readme-btn'
  button.textContent = 'VIEW READ ME'
  button.addEventListener('click', async () => {
    const openResult = await window.ghostOps.openToolReadme('BlackBox')
    if (openResult?.ok) {
      appendTerminalLine(`[${isoStamp()}] [BlackBox] opened README`)
    } else {
      appendTerminalLine(`[${isoStamp()}] [BlackBox] failed to open README: ${openResult?.error || 'unknown error'}`)
    }
  })

  wrap.appendChild(logo)
  wrap.appendChild(button)
  setChip(chip)
  mountContent(wrap)
  terminalLogNode = null
}

async function renderMissingState(toolName, toolInfo) {
  if (toolName === 'BlackBox') {
    renderBlackBoxHoldingState('state-a')
    return
  }

  const cfg = toolConfig[toolName]
  const view = cloneTemplate('module-missing-template')
  const description = view.querySelector('#missing-description')
  const missingPath = view.querySelector('#missing-path')
  const preview = view.querySelector('#preview-gif')
  const initializeBtn = view.querySelector('#initialize-module')

  if (description) description.textContent = cfg.description
  if (missingPath) missingPath.textContent = toolInfo.expectedPath || cfg.expectedPath
  if (preview) preview.src = cfg.preview
  if (preview) attachPreviewFallback(preview)

  if (initializeBtn) {
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
  }

  setChip('state-a')
  mountContent(view)
  terminalLogNode = null
}

function renderRunnerState(toolName, toolInfo) {
  closeStrictSuggestModal()
  if (toolName === 'BlackBox') {
    renderBlackBoxHoldingState('state-b')
    return
  }

  const view = cloneTemplate('tactical-runner-template')
  // Contract: tactical-runner-template uses #launch-scrape-btn (image control), not legacy #launch-engine.
  const launchBtn = view.querySelector('#launch-scrape-btn')
  const scrapeShell = view.querySelector('#scrape-shell')
  const spoolerShell = view.querySelector('#spooler-shell')
  const runnerChip = view.querySelector('.runner-chip')
  const runnerCommandRow = view.querySelector('.runner-command-row')

  if (terminalLogBuffer.length === 0) {
    appendTerminalLine(`[${isoStamp()}] ${toolName} entrypoint discovered`)
    appendTerminalLine(`[${isoStamp()}] runner idle`)
    appendTerminalLine(`[${isoStamp()}] note: module runtime telemetry bridged into tactical stage`)
  }

  const scrapeOnlyNodes = Array.from(view.querySelectorAll('[data-scrapetag-only]'))
  if (toolName === 'scrapetag') {
    if (runnerCommandRow) runnerCommandRow.classList.add('runner-command-row--scrapetag')
    if (runnerChip) runnerChip.textContent = 'in-app-ready'
    if (spoolerShell) spoolerShell.remove()
  } else {
    if (runnerCommandRow) runnerCommandRow.classList.remove('runner-command-row--scrapetag')
    if (scrapeShell) scrapeShell.remove()
    scrapeOnlyNodes.forEach((node) => node.remove())
    if (toolName === 'Spooler') {
      if (runnerChip) runnerChip.textContent = 'streamlit-ready'
    } else {
      if (runnerChip) runnerChip.textContent = 'headful-ready'
      if (spoolerShell) spoolerShell.remove()
    }
  }

  if (launchBtn) {
    launchBtn.addEventListener('click', async () => {
      appendTerminalLine(`[${isoStamp()}] launch requested for ${toolName} at ${toolInfo.entryPath}`)
      if (toolName === 'scrapetag') {
        launchScrapeSession()
      } else if (toolName === 'Spooler') {
        launchEnvHarness(toolInfo, { auto: false })
      } else {
        spoolerHarnessActive = false
        window.ghostOps.launchTool(toolName)
      }
    })
  }

  setChip('state-b')
  mountContent(view)

  const launchMounted = document.getElementById('launch-scrape-btn')
  if (launchMounted) {
    if (toolName === 'scrapetag') {
      initLaunchSpacebarKey(launchMounted, { label: 'LOAD TARGET SITE', enableCycle: true })
    } else if (toolName === 'Spooler') {
      setLaunchKeyStaticLabel(launchMounted, 'LAUNCH ENV HARNESS')
    } else {
      setLaunchKeyStaticLabel(launchMounted, 'LAUNCH HEADFUL ENGINE')
    }
  }

  if (toolName === 'scrapetag') {
    const urlField = document.getElementById('scrape-target-url')
    const strictToggle = document.getElementById('strict-harvest-toggle')
    if (urlField) {
      const stored = localStorage.getItem(SCRAPE_URL_STORAGE_KEY)
      urlField.value = stored && resolveScrapeTargetUrl(stored) ? stored : DEFAULT_SCRAPE_URL
      urlField.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          launchScrapeSession()
        }
      })
    }
    if (strictToggle && !strictToggle.dataset.bound) {
      strictToggle.dataset.bound = '1'
      strictToggle.checked = isStrictHarvestEnabled()
      strictToggle.addEventListener('change', () => {
        const enabled = Boolean(strictToggle.checked)
        setStrictHarvestEnabled(enabled)
        appendTerminalLine(`[${isoStamp()}] [scrapetag:strict] mode ${enabled ? 'enabled' : 'disabled'}`)
      })
    }
  }

  if (toolName === 'Spooler') {
    const setup = document.getElementById('spooler-setup')
    const installBtn = document.getElementById('spooler-install-deps')
    if (setup) setup.hidden = false
    if (installBtn && !installBtn.dataset.bound) {
      installBtn.dataset.bound = '1'
      installBtn.addEventListener('click', async () => {
        spoolerDependencyState.installing = true
        setSpoolerSetupPanel(spoolerDependencyState)
        appendTerminalLine(`[${isoStamp()}] [Spooler] dependency install requested`)

        const result = await window.ghostOps.installSpoolerDeps()
        spoolerDependencyState.installing = false
        setSpoolerSetupPanel(spoolerDependencyState)

        if (!result?.ok) {
          appendTerminalLine(`[${isoStamp()}] [Spooler] dependency install failed: ${result?.error || 'unknown error'}`)
          return
        }

        appendTerminalLine(`[${isoStamp()}] [Spooler] dependency install completed`)
        await refreshSpoolerDependencyStatus({ logMissing: false })
      })
    }

    const spoolerShellMounted = document.getElementById('spooler-shell')
    const spoolerWebview = document.getElementById('spooler-webview')
    if (spoolerShellMounted) spoolerShellMounted.hidden = true
    if (spoolerWebview) {
      if (!spoolerWebview.dataset.bound) {
        spoolerWebview.dataset.bound = '1'
        spoolerWebview.addEventListener('did-start-loading', () => {
          appendTerminalLine(`[${isoStamp()}] [Spooler] webview loading started`)
        })
        spoolerWebview.addEventListener('did-stop-loading', () => {
          clearSpoolerWebviewRetry()
          spoolerWebviewRetryCount = 0
          spoolerHarnessActive = true
          appendTerminalLine(`[${isoStamp()}] [Spooler] webview loading complete`)
          updateNixieReadout('SPOOLER UI ONLINE :: BIG-SCREEN LINKED')
        })
        spoolerWebview.addEventListener('did-fail-load', (event) => {
          appendTerminalLine(`[${isoStamp()}] [Spooler] webview load failed: ${event.errorDescription}`)
          const code = Number(event?.errorCode)
          if (code === -102 || code === -105 || code === -106) {
            scheduleSpoolerWebviewRetry(spoolerWebview, event.errorDescription || 'connection issue')
          } else {
            spoolerHarnessActive = false
          }
        })
      }
    }
    refreshSpoolerDependencyStatus({ logMissing: false }).then((health) => {
      if (health.healthy) {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            launchEnvHarness(toolInfo, { auto: true })
          })
        })
      }
    })
    appendTerminalLine(`[${isoStamp()}] [Spooler] press LAUNCH ENV HARNESS after dependency check completes`)
  }

  if (toolName === 'scrapetag') {
    const wvBack = document.getElementById('wv-back')
    const wvForward = document.getElementById('wv-forward')
    const wvReload = document.getElementById('wv-reload')
    const harvestBtn = document.getElementById('start-harvest-btn')

    if (wvBack) {
      wvBack.addEventListener('click', () => {
        const wv = document.getElementById('scrape-webview')
        if (wv) {
          try { wv.goBack() } catch { /* ignore */ }
        }
      })
    }

    if (wvForward) {
      wvForward.addEventListener('click', () => {
        const wv = document.getElementById('scrape-webview')
        if (wv) {
          try { wv.goForward() } catch { /* ignore */ }
        }
      })
    }

    if (wvReload) {
      wvReload.addEventListener('click', () => {
        const wv = document.getElementById('scrape-webview')
        if (wv) {
          try { wv.reload() } catch { /* ignore */ }
        }
      })
    }

    if (harvestBtn) {
      initLaunchSpacebarKey(harvestBtn, { label: 'START HARVEST', enableCycle: true })
      harvestBtn.addEventListener('click', () => {
        closeStrictSuggestModal()
        const wv = document.getElementById('scrape-webview')
        if (wv) harvestInteractiveNodes(wv)
      })
    }
  }

  terminalLogNode = document.getElementById('terminal-log')
  if (terminalLogNode) terminalLogNode.innerHTML = terminalLogBuffer.join('\n')
  if (terminalLogNode) terminalLogNode.scrollTop = terminalLogNode.scrollHeight
}

function renderDocsState() {
  const view = cloneTemplate('docs-template')
  setChip('state-c')
  setPollingStatus('documentation mode', true)
  mountContent(view)
  terminalLogNode = null
}

function renderConfigState() {
  const view = cloneTemplate('placeholder-config-template')
  setChip('state-c')
  setPollingStatus('settings shell', true)
  mountContent(view)
  terminalLogNode = null
}

function renderAuthState() {
  const view = cloneTemplate('placeholder-auth-template')
  setChip('state-c')
  setPollingStatus('auth shell', true)
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

  if (activeRoute === 'config') {
    if (currentStageSignature !== 'config') {
      renderConfigState()
      currentStageSignature = 'config'
    }
    return
  }

  if (activeRoute === 'auth') {
    if (currentStageSignature !== 'auth') {
      renderAuthState()
      currentStageSignature = 'auth'
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
    if (stageContent) stageContent.textContent = `IPC failure while checking ${activeTool}: ${error.message}`
    currentStageSignature = 'error'
  }
}

function startPollingLoop() {
  if (pollTimer) {
    clearInterval(pollTimer)
  }

  if (activeRoute === 'docs' || activeRoute === 'config' || activeRoute === 'auth') {
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

      if (!nextRoute || !['tool', 'docs', 'config', 'auth'].includes(nextRoute)) {
        return
      }

      const continueNav = () => {
        activeRoute = nextRoute
        if (nextTool) {
          activeTool = nextTool
        }
        currentStageSignature = ''
        appendTerminalLine(`[${isoStamp()}] route changed: ${activeRoute}/${activeTool}`)
        setNavSelection()
        refreshActiveStage()
        startPollingLoop()
      }

      if (nextRoute === 'tool') {
        if (stageContent) playBootSequence(nextTool, stageContent, continueNav)
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
    // Update selector display if this is a CAPTURED event
    if (line && line.includes('[CAPTURED]')) {
      const match = line.match(/\[CAPTURED\]\s+(.+?)\s+->\s+(.+)/)
      if (match) {
        const alias = match[1].trim()
        const selector = match[2].trim()
        updateSelectorHud(alias, selector)
      }
    }
  })
}

function renderWelcomeScreen() {
  if (stageTitle) stageTitle.textContent = 'GHOSTOPS TERMINAL'
  if (toolHealth) toolHealth.textContent = 'ONLINE'
  const isFirstBoot = !localStorage.getItem('ghostops_booted')
  if (!stageContent) return
  
  stageContent.classList.remove('fade-swap')
  stageContent.innerHTML = ''

  const wrap = document.createElement('div')
  wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:24px;padding:24px;'

  // Main-stage loading theater (ghost at computer / multi-beat placeholder) — separate from Module Dock GHOSTops-startup-sequence.mp4.
  const hero = document.createElement('video')
  hero.className = 'welcome-hero-video'
  hero.src = 'assets/modules/scrapetag/ghost-crawler-idle.mp4'
  hero.autoplay = true
  hero.loop = true
  hero.muted = true
  hero.playsInline = true
  hero.setAttribute('playsinline', '')
  hero.setAttribute('aria-label', 'Terminal loading sequence')

  const textBlock = document.createElement('div')
  textBlock.style.cssText = 'text-align:center;font-family:"Share Tech Mono",monospace;color:#b8ff5a;text-shadow:0 0 8px #b8ff5a;'

  const line1 = document.createElement('div')
  line1.style.cssText = 'font-size:0.95rem;letter-spacing:0.14em;margin-bottom:6px;'
  const line2 = document.createElement('div')
  line2.style.cssText = 'font-size:0.72rem;letter-spacing:0.1em;opacity:0.75;margin-bottom:12px;'
  const line3 = document.createElement('div')
  line3.style.cssText = 'font-size:0.65rem;letter-spacing:0.08em;opacity:0.5;'

  textBlock.appendChild(line1)
  textBlock.appendChild(line2)
  textBlock.appendChild(line3)
  wrap.appendChild(hero)
  wrap.appendChild(textBlock)
  stageContent.appendChild(wrap)
  requestAnimationFrame(() => stageContent.classList.add('fade-swap'))

  const fullLine1 = '> GHOSTOPS TERMINAL ONLINE'
  const fullLine2 = 'SYSTEMS NOMINAL. ALL MODULES STANDING BY._'
  const fullLine3 = isFirstBoot
    ? 'NEW OPERATIVE DETECTED — SELECT A MODULE OR VIEW SYSTEM DOCS TO BEGIN.'
    : 'SELECT A MODULE FROM OPERATIONAL MODULES TO BEGIN.'

  let i = 0
  let j = 0
  let k = 0

  const typeChar = (str, el, idx, next) => {
    if (idx < str.length) {
      el.textContent += str[idx]
      setTimeout(() => typeChar(str, el, idx + 1, next), 38)
    } else if (next) {
      setTimeout(next, 120)
    }
  }

  typeChar(fullLine1, line1, i, () => {
    typeChar(fullLine2, line2, j, () => {
      typeChar(fullLine3, line3, k, () => {
        localStorage.setItem('ghostops_booted', '1')
        const readmeBtn = document.createElement('button')
        readmeBtn.textContent = '[ VIEW SYSTEM README ]'
        readmeBtn.id = 'welcome-readme-btn'
        readmeBtn.style.cssText = 'margin-top:8px;background:transparent;border:1px solid #b8ff5a;color:#b8ff5a;font-family:"Share Tech Mono",monospace;font-size:0.7rem;letter-spacing:0.12em;padding:6px 16px;border-radius:6px;cursor:pointer;opacity:0.7;transition:opacity 0.2s;'
        readmeBtn.addEventListener('mouseenter', () => { readmeBtn.style.opacity = '1' })
        readmeBtn.addEventListener('mouseleave', () => { readmeBtn.style.opacity = '0.7' })
        readmeBtn.addEventListener('click', () => {
          activeRoute = 'docs'
          activeTool = 'SYSTEM'
          currentStageSignature = ''
          appendTerminalLine(`[${isoStamp()}] route changed: ${activeRoute}/${activeTool}`)
          setNavSelection()
          setStageIdentity()
          refreshActiveStage()
          startPollingLoop()
        })
        textBlock.appendChild(readmeBtn)
      })
    })
  })
}

async function boot() {
  if (!window.ghostOps) {
    console.error('[renderer] ghostOps bridge not available')
    return
  }
  bindModuleDockToggle()
  bindToolLogs()
  bindNavigation()
  setNavSelection()
  renderWelcomeScreen()
}

boot()
