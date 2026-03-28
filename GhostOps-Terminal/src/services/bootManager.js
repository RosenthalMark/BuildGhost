'use strict'

// GHOSTstub boot file is a stand-in until a module-specific clip ships (keep paths distinct in UI).
const moduleBootConfig = {
  SCRAPEtag: {
    video: 'assets/modules/scrapetag/scrapetag-boot.mp4',
    color: '#b8ff5a'
  },
  GHOSTstub: {
    video: 'assets/modules/ghoststub/ghoststub-boot.mp4',
    color: '#ff5e5e'
  },
  BlackBox: {
    video: 'assets/modules/blackbox/blackbox-boot.mp4',
    color: '#b8ff5a'
  }
}

const SKIP_BOOT_KEY = 'ghostops_skip_boot_sequences'
const moduleBootCounts = JSON.parse(localStorage.getItem('ghostops_boot_counts') || '{}')
const NUDGE_DELAY_MS = 5000

export function playBootSequence(toolName, stageContent, onComplete) {
  const skipBoot = localStorage.getItem(SKIP_BOOT_KEY) === '1'
  const config = moduleBootConfig[toolName]

  if (skipBoot || !config) {
    onComplete()
    return
  }

  stageContent.classList.remove('fade-swap')
  stageContent.innerHTML = ''

  const wrap = document.createElement('div')
  wrap.style.cssText = 'display:flex;align-items:center;justify-content:center;height:100%;background:#000;border-radius:10px;position:relative;overflow:hidden;'

  const vid = document.createElement('video')
  vid.src = config.video
  vid.autoplay = true
  vid.muted = true
  vid.playsInline = true
  vid.controls = false
  vid.style.cssText = 'width:100%;height:100%;object-fit:contain;'

  const overlay = document.createElement('div')
  overlay.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;padding-top:clamp(12px,4vh,36px);gap:8px;pointer-events:none;z-index:2;font-family:"Share Tech Mono",monospace;text-align:center;'
  const overlayKicker = document.createElement('div')
  overlayKicker.textContent = 'GHOSTOPS // MODULE LOAD'
  overlayKicker.style.cssText = `color:${config.color};font-size:0.62rem;letter-spacing:0.22em;opacity:0.9;text-shadow:0 0 10px ${config.color};`
  const overlayTitle = document.createElement('div')
  overlayTitle.textContent = String(toolName || 'MODULE').toUpperCase()
  overlayTitle.style.cssText = `color:${config.color};font-size:clamp(0.95rem,2.2vw,1.25rem);letter-spacing:0.2em;font-weight:700;text-shadow:0 0 14px ${config.color};`
  const overlayHint = document.createElement('div')
  overlayHint.textContent = 'TAPE DECK — LOADING MODULE ASSET'
  overlayHint.style.cssText = `color:${config.color};font-size:0.58rem;letter-spacing:0.14em;opacity:0.55;margin-top:4px;`
  overlay.appendChild(overlayKicker)
  overlay.appendChild(overlayTitle)
  overlay.appendChild(overlayHint)

  vid.addEventListener('ended', () => {
    onComplete()
  })

  vid.addEventListener('error', () => {
    onComplete()
  })

  const bootCount = (moduleBootCounts[toolName] || 0) + 1
  moduleBootCounts[toolName] = bootCount
  localStorage.setItem('ghostops_boot_counts', JSON.stringify(moduleBootCounts))

  const nudgeTimer = bootCount > 1 ? setTimeout(() => {
    const nudge = document.createElement('button')
    nudge.textContent = 'Skip boot sequences? → Settings'
    nudge.style.cssText = `position:absolute;bottom:12px;right:12px;z-index:4;background:transparent;border:1px solid ${config.color};color:${config.color};font-family:"Share Tech Mono",monospace;font-size:0.62rem;letter-spacing:0.08em;padding:4px 10px;border-radius:4px;cursor:pointer;opacity:0.6;transition:opacity 0.2s;`
    nudge.addEventListener('mouseenter', () => { nudge.style.opacity = '1' })
    nudge.addEventListener('mouseleave', () => { nudge.style.opacity = '0.6' })
    nudge.addEventListener('click', () => { onComplete() })
    wrap.appendChild(nudge)
  }, NUDGE_DELAY_MS) : null

  vid.addEventListener('ended', () => clearTimeout(nudgeTimer))
  vid.addEventListener('error', () => clearTimeout(nudgeTimer))

  wrap.appendChild(vid)
  wrap.appendChild(overlay)
  stageContent.appendChild(wrap)
}
