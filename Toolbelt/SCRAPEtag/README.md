# SCRAPEtag

Intelligent DOM mapping helper: capture interactive elements, assign human-readable aliases, and emit CSS selectors for downstream automation.

## Two run modes

1. **GHOSTops Terminal (recommended for demos)**  
   Open `ghostops-terminal`, select **SCRAPEtag**, set **TARGET URL** (http/https; bare domains get `https://` prepended), then click **Launch In-App Scrape** or press **Enter** in the field. The last successful URL is stored in `localStorage` under `ghostops_scrape_target_url`. The embedded webview loads that site; click an element, enter an alias in the modal, then confirm. Captures appear in the selector HUD, Nixie ticker, and terminal log as `[CAPTURED] alias -> selector`.

2. **Standalone Playwright**  
   From this directory:

   ```bash
   npm install
   npx playwright install chromium   # first run only
   node index.js
   ```

   A separate Chromium window opens with the same click-to-tag flow (legacy `window.prompt` path in the standalone script).

## Default target

- **Terminal:** default navigation URL is `https://testghost.com` when the TARGET URL field is empty and nothing is stored yet. The webview starts at `about:blank` until you launch a session.
- **Standalone `index.js`:** still uses `page.goto('https://testghost.com')` — edit that line for other targets.

## Contract

- Entry file: `index.js` (must exist for the Terminal “module online” check).
- Renderer talks to the page only through the webview injection in `ghostops-terminal/renderer.js` (`armScrapeTagger`); there is no Node access in the UI process.

## Known limits

- Captures are held in main-process memory (`currentSessionLogs` in `main.js`); no export file yet.
- TARGET URL is implemented in the Terminal runner; standalone Playwright still uses a hardcoded `page.goto` in `index.js`.
- Automated full-page crawler vs. manual click-to-tag: crawler automation is still on the roadmap; this build is the **in-app capture loop**.
