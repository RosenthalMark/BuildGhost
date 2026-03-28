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
const DEFAULT_SCRAPE_URL = 'https://testghost.com'
const SCRAPE_URL_STORAGE_KEY = 'ghostops_scrape_target_url'

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
let launchKeyAnimGen = 0

function setLaunchKeyStaticLabel(button, label) {
  launchKeyAnimGen += 1
  const root = button?.querySelector('.launch-key-label-root')
  if (!root) return
  root.textContent = label
  root.classList.remove('launch-key-label--neon')
}

function initLaunchSpacebarKey(button, options = {}) {
  const { label = 'LAUNCH IN-APP SCRAPE', enableCycle = true } = options
  const root = button?.querySelector('.launch-key-label-root')
  if (!root) return

  launchKeyAnimGen += 1
  const gen = launchKeyAnimGen
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

  const isStale = () => gen !== launchKeyAnimGen

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
  SCRAPEtag: {
    preview: 'assets/modules/scrapetag/scrapetag-selector-display.png',
    description: 'SCRAPEtag module was not discovered in Toolbelt. Initialize to scaffold runtime files and bridge contracts.',
    expectedPath: '../Toolbelt/SCRAPEtag/index.js'
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
  const isScrapeHud = activeRoute === 'tool' && activeTool === 'SCRAPEtag'
  if (activeRoute === 'docs') {
    if (stageTitle) stageTitle.textContent = 'SYSTEM DOCS'
  } else if (activeRoute === 'config') {
    if (stageTitle) stageTitle.textContent = 'SETTINGS'
  } else if (activeRoute === 'auth') {
    if (stageTitle) stageTitle.textContent = 'SIGN IN'
  } else if (isScrapeHud && lastCapturedAlias) {
    if (stageTitle) stageTitle.textContent = `SCRAPEtag :: ${lastCapturedAlias}`
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
  const el = document.querySelector('.nixie-text')
  if (!el || !plainText) return
  const max = 220
  let t = plainText.length > max ? `${plainText.slice(0, max - 3)}...` : plainText
  if (!t.startsWith('>')) {
    t = `> ${t}`
  }
  if (!t.endsWith('_')) {
    t += '_'
  }
  el.textContent = t
}

function updateSelectorHud(alias, selector) {
  const displayEl = document.getElementById('selector-display-text')
  if (displayEl) {
    displayEl.textContent = `> TARGET ACQUIRED: ${alias} → ${selector}_`
  }
  updateNixieReadout(`TARGET ACQUIRED :: ${alias} :: ${selector}`)
}

function setPollingStatus(text, isHealthy) {
  if (pollingStatus) pollingStatus.textContent = text
  if (toolHealth) toolHealth.textContent = text
  if (toolHealth) toolHealth.classList.toggle('status-good', Boolean(isHealthy))
  if (toolHealth) toolHealth.classList.toggle('status-bad', !isHealthy)
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
    if (line.includes('[CAPTURED]')) {
      const cap = line.match(/\[CAPTURED\]\s+(.+?)\s+->\s+(.+)/)
      if (cap) {
        updateNixieReadout(`CAPTURE :: ${cap[1].trim()} :: ${cap[2].trim()}`)
      }
    } else if (line.includes('[SCRAPEtag]') && (line.includes('launching in-app') || line.includes('webview ready'))) {
      updateNixieReadout(line.replace(/^\[[^\]]+\]\s*/, '').trim())
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
    appendTerminalLine(`[${isoStamp()}] [SCRAPEtag] webview loading started`)
  })

  webview.addEventListener('did-stop-loading', () => {
    appendTerminalLine(`[${isoStamp()}] [SCRAPEtag] webview loading complete`)
    const u = typeof webview.getURL === 'function' ? webview.getURL() : ''
    if (u && u !== 'about:blank') {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => applyWebviewWidthFit(webview))
      })
    }
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
  const urlInput = document.getElementById('scrape-target-url')

  if (!scrapeShell || !webview) {
    appendTerminalLine(`[${isoStamp()}] [SCRAPEtag] in-app webview container unavailable`)
    return
  }

  const rawField = String(urlInput?.value ?? '').trim()
  let targetUrl = null
  if (rawField) {
    targetUrl = resolveScrapeTargetUrl(rawField)
    if (!targetUrl) {
      appendTerminalLine(`[${isoStamp()}] [SCRAPEtag] invalid target URL`)
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
  appendTerminalLine(`[${isoStamp()}] [SCRAPEtag] launching in-app session: ${targetUrl}`)
  webview.src = targetUrl

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
  if (toolName === 'BlackBox') {
    renderBlackBoxHoldingState('state-b')
    return
  }

  const view = cloneTemplate('tactical-runner-template')
  // Contract: tactical-runner-template uses #launch-scrape-btn (image control), not legacy #launch-engine.
  const launchBtn = view.querySelector('#launch-scrape-btn')
  const scrapeShell = view.querySelector('#scrape-shell')
  const runnerChip = view.querySelector('.runner-chip')

  if (terminalLogBuffer.length === 0) {
    appendTerminalLine(`[${isoStamp()}] ${toolName} entrypoint discovered`)
    appendTerminalLine(`[${isoStamp()}] runner idle`)
    appendTerminalLine(`[${isoStamp()}] note: SCRAPEtag now runs inside the app window`)
  }

  const scrapeOnlyNodes = Array.from(view.querySelectorAll('[data-scrapetag-only]'))
  if (toolName === 'SCRAPEtag') {
    if (runnerChip) runnerChip.textContent = 'in-app-ready'
  } else {
    if (runnerChip) runnerChip.textContent = 'headful-ready'
    if (scrapeShell) scrapeShell.remove()
    scrapeOnlyNodes.forEach((node) => node.remove())
  }

  if (launchBtn) {
    launchBtn.addEventListener('click', async () => {
      appendTerminalLine(`[${isoStamp()}] launch requested for ${toolName} at ${toolInfo.entryPath}`)
      if (toolName === 'SCRAPEtag') {
        launchScrapeSession()
      } else {
        window.ghostOps.launchTool(toolName)
      }
    })
  }

  setChip('state-b')
  mountContent(view)

  const launchMounted = document.getElementById('launch-scrape-btn')
  if (launchMounted) {
    if (toolName === 'SCRAPEtag') {
      initLaunchSpacebarKey(launchMounted, { label: 'LAUNCH IN-APP SCRAPE', enableCycle: true })
    } else {
      setLaunchKeyStaticLabel(launchMounted, 'LAUNCH HEADFUL ENGINE')
    }
  }

  if (toolName === 'SCRAPEtag') {
    const urlField = document.getElementById('scrape-target-url')
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
  }

  // PAUSE / RESUME toggle
  const pauseBtn = document.getElementById('pause-resume-btn')
  const pauseImg = document.getElementById('pause-resume-img')
  const pauseLabel = document.getElementById('pause-resume-label')

  if (toolName === 'SCRAPEtag' && pauseBtn && pauseImg && pauseLabel) {
    pauseBtn.addEventListener('click', () => {
      const isRunning = pauseBtn.dataset.state === 'running'
      if (isRunning) {
        pauseImg.src = 'assets/modules/scrapetag/resume-crawler.gif'
        pauseBtn.setAttribute('aria-label', 'Resume Crawler')
        pauseLabel.textContent = '[ RESUME CRAWLER ]'
        pauseBtn.dataset.state = 'paused'
      } else {
        pauseImg.src = 'assets/modules/scrapetag/pause-crawler.gif'
        pauseBtn.setAttribute('aria-label', 'Pause Crawler')
        pauseLabel.textContent = '[ PAUSE CRAWLER ]'
        pauseBtn.dataset.state = 'running'
      }
    })
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

  // Main-stage loading theater (ghost at computer / multi-beat placeholder) — separate from sidebar GHOSTops-startup-sequence.mp4.
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
  bindToolLogs()
  bindNavigation()
  setNavSelection()
  renderWelcomeScreen()
}

boot()
