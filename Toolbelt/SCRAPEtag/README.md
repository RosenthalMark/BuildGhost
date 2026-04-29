# SCRAPEtag

Manual selector hunting is dead. `SCRAPEtag` bridges the gap between legacy chaos and modern stability. It crawls the DOM, identifies interactive nodes, and performs safe, regex-strict injection of custom data attributes so automated suites are decoupled from UI churn.

Intelligent DOM mapping helper: capture interactive elements, assign human-readable aliases, and emit CSS selectors for downstream automation.

## Two run modes

1. **GhostOps Terminal (recommended for demos)**  
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

## Confidence scoring (green vs orange)

`SCRAPEtag` assigns every harvested selector a confidence score from `0` to `100`, then colors the overlay:

- `green` when score is `>= 60`
- `orange` when score is `< 60`

This is not vibe-based; it is deterministic selector math from `scoreNodeConfidence()` in `ghostops-terminal/renderer.js`.

### Scoring formula

```text
start at 50
+50  if selector starts with ID         (^#[a-zA-Z])
+30  if selector includes data attribute (\[data-)
+15  if selector includes aria label     (aria-label|aria-labelledby)
-35  if selector uses nth-of-type        (nth-of-type)
-20  if selector depth >= 4 and not ID-rooted
-10  if selector contains generic tokens (btn|el|item|wrap|container|inner|outer|root|box)
clamp final value to [0, 100]
```

### What each signal means

| Signal | Why it helps/hurts |
| --- | --- |
| Starts with `#id` | Usually the strongest anchor on a page. |
| Contains `[data-*]` | Indicates test- or app-level intent instead of layout trivia. |
| Contains `aria-label` / `aria-labelledby` | Often a stable semantic hook tied to UX meaning. |
| Uses `nth-of-type` | Position-based selectors drift when sibling order changes. |
| Deep `>` chains | Long ancestry chains are brittle in modern component trees. |
| Generic tokens | Names like `container`/`wrap`/`item` carry weak semantic identity. |

### Fast examples

| Selector | Score | Tier |
| --- | ---: | --- |
| `#login-button` | `100` (`50 + 50`, clamped) | Green |
| `[data-testid="email"]` | `80` (`50 + 30`) | Green |
| `main > section > div > ul > li:nth-of-type(2) > button` | `0` (`50 - 35 - 20 - 10`, then clamped) | Orange |
| `header > .nav-wrap > .item > a` | `20` (`50 - 20 - 10`) | Orange |

### Operator note

Strict Mode currently improves naming/grouping behavior, but this numeric confidence rubric remains the same unless `scoreNodeConfidence()` changes.

## Known limits

- Captures are held in main-process memory (`currentSessionLogs` in `main.js`); no export file yet.
- TARGET URL is implemented in the Terminal runner; standalone Playwright still uses a hardcoded `page.goto` in `index.js`.
- Automated full-page crawler vs. manual click-to-tag: crawler automation is still on the roadmap; this build is the **in-app capture loop**.
