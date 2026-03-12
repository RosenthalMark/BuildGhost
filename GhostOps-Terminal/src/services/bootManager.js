'use strict'

const moduleBootConfig = {
  SCRAPEtag: {
    video: 'assets/modules/scrapetag/scrapetag-boot.mp4',
    color: '#b8ff5a'
  },
  GHOSTstub: {
    video: 'assets/modules/ghoststub/ghoststub-boot.mp4',
    color: '#ff5e5e'
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
    nudge.style.cssText = `position:absolute;bottom:12px;right:12px;background:transparent;border:1px solid ${config.color};color:${config.color};font-family:"Share Tech Mono",monospace;font-size:0.62rem;letter-spacing:0.08em;padding:4px 10px;border-radius:4px;cursor:pointer;opacity:0.6;transition:opacity 0.2s;`
    nudge.addEventListener('mouseenter', () => { nudge.style.opacity = '1' })
    nudge.addEventListener('mouseleave', () => { nudge.style.opacity = '0.6' })
    nudge.addEventListener('click', () => { onComplete() })
    wrap.appendChild(nudge)
  }, NUDGE_DELAY_MS) : null

  vid.addEventListener('ended', () => clearTimeout(nudgeTimer))
  vid.addEventListener('error', () => clearTimeout(nudgeTimer))

  wrap.appendChild(vid)
  stageContent.appendChild(wrap)
}
