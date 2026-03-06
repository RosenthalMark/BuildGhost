const { chromium } = require('playwright')

async function run() {
  console.log('[SCRAPEtag] initializing headful browser')
  console.log('[SCRAPEtag] headful mode opens a separate Chromium window by design')
  const browser = await chromium.launch({ headless: false })
  const page = await browser.newPage()

  page.on('console', (message) => {
    console.log(message.text())
  })

  await page.goto('https://testghost.com', { waitUntil: 'domcontentloaded' })
  console.log('[SCRAPEtag] page loaded: https://testghost.com')
  await page.addStyleTag({
    content: `
      .ghost-tag {
        position: absolute;
        z-index: 2147483647;
        background: #fff;
        color: #000;
        border: 4px solid #39ff14;
        border-radius: 8px;
        font-family: monospace;
        font-size: 12px;
        line-height: 1.2;
        box-shadow: 0 0 10px rgba(57, 255, 20, 0.65);
        padding: 8px 28px 8px 8px;
      }
      .ghost-tag button {
        position: absolute;
        top: 3px;
        right: 3px;
        border: 0;
        border-radius: 3px;
        background: #d90429;
        color: #fff;
        width: 16px;
        height: 16px;
        line-height: 16px;
        padding: 0;
        font-size: 10px;
        cursor: pointer;
      }
    `
  })

  await page.evaluate(() => {
    const computeSelector = (node) => {
      if (!node || node.nodeType !== 1) {
        return ''
      }
      if (node.id) {
        return `#${node.id}`
      }

      const parts = []
      let current = node
      while (current && current.nodeType === 1 && current !== document.body) {
        let part = current.tagName.toLowerCase()
        const classes = Array.from(current.classList).filter(Boolean)
        if (classes.length > 0) {
          part += `.${classes[0]}`
        } else if (current.parentElement) {
          const siblings = Array.from(current.parentElement.children).filter((el) => el.tagName === current.tagName)
          if (siblings.length > 1) {
            part += `:nth-of-type(${siblings.indexOf(current) + 1})`
          }
        }
        parts.unshift(part)
        current = current.parentElement
      }
      return parts.join(' > ')
    }

    document.addEventListener(
      'click',
      (event) => {
        event.preventDefault()
        event.stopPropagation()

        const target = event.target
        if (!(target instanceof Element)) {
          return
        }

        const name = window.prompt('Tag Name')
        if (!name) {
          console.log('[SCRAPEtag] prompt canceled')
          return
        }

        const rect = target.getBoundingClientRect()
        const tag = document.createElement('div')
        tag.className = 'ghost-tag'
        tag.textContent = name
        tag.style.left = `${rect.left + window.scrollX}px`
        tag.style.top = `${rect.top + window.scrollY}px`

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
        console.log(`[SCRAPEtag] selector=${selector} | tag=${name}`)
      },
      true
    )
  })

  console.log('[SCRAPEtag] tag injector armed on https://testghost.com')
  console.log('[SCRAPEtag] click any element in the browser window to create a tag')
  process.stdin.resume()

  const shutdown = async () => {
    await browser.close()
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

run().catch((error) => {
  console.error(`[SCRAPEtag] fatal: ${error.message}`)
  process.exit(1)
})
