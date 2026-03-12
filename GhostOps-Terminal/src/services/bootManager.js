const initializedModules = new Set()

export function playBootSequence(toolName, stageElement, callback) {
  if (initializedModules.has(toolName)) {
    callback()
    return
  }

  initializedModules.add(toolName)

  if (!stageElement) {
    callback()
    return
  }

  const video = document.createElement('video')
  video.autoplay = true
  video.muted = true
  video.playsInline = true

  const moduleName = String(toolName).toLowerCase();
  video.src = `assets/modules/${moduleName}/${moduleName}-boot.mp4`;

  video.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:10px;background:#000;display:block;'

  stageElement.innerHTML = ''
  stageElement.appendChild(video)

  let finished = false
  const done = () => {
    if (finished) {
      return
    }
    finished = true
    callback()
  }

  video.addEventListener('ended', done, { once: true })
  video.addEventListener('error', done, { once: true })
}
