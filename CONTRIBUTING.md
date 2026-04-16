# GHOSTops Terminal — Module Development Standard

> This document defines the contract every module must fulfill to integrate
> with GHOSTops Terminal. It applies to internal BuildGhost modules and
> future third-party marketplace modules equally.

---

## Module File Structure

Every module lives inside the `Toolbelt/` directory:
```
Toolbelt/
  YourModuleName/
    index.js              ← REQUIRED: module entry point
    assets/
      yourmodule-boot.mp4 ← REQUIRED: boot sequence video (16:9, max 15s)
      yourmodule-logo.png ← REQUIRED: Module Dock logo (recommended 480x120px)
    README.md             ← REQUIRED: module documentation
```

---

## Step-by-Step: Registering a New Module

### 1. Add your entry to `moduleBootConfig` in `src/services/bootManager.js`
```javascript
const moduleBootConfig = {
  YourModuleName: {
    video: 'assets/modules/yourmodulename/yourmodule-boot.mp4',
    color: '#b8ff5a' // accent color for boot screen overlay text
  }
}
```

### 2. Add your module entry to `toolConfig` in `renderer.js`
```javascript
const toolConfig = {
  YourModuleName: {
    preview: 'assets/previews/yourmodule.gif',
    description: 'One sentence describing what this module does.',
    expectedPath: '../Toolbelt/YourModuleName/index.js'
  }
}
```

### 3. Add your nav button to `index.html`
```html
<button class="nav-item module-slot" data-route="tool" data-tool="YourModuleName">
  <span class="nav-logo-wrap">
    <img class="nav-tool-logo"
         src="../Toolbelt/YourModuleName/assets/yourmodule-logo.png"
         alt="YourModuleName" />
    <span class="tool-live-dot" aria-hidden="true"></span>
  </span>
  <span class="nav-meta">Your Module Tagline</span>
</button>
```

### 4. Add your module to `ALLOWED_TOOLS` in `main.js`
```javascript
const ALLOWED_TOOLS = new Set(['scrapetag', 'GHOSTstub', 'YourModuleName'])
```

### 5. Drop your boot video and logo into the assets folder
```
ghostops-terminal/assets/modules/yourmodulename/yourmodule-boot.mp4
ghostops-terminal/assets/modules/yourmodulename/yourmodule-logo.png
```

That's it. Zero new logic. Zero new functions. The Terminal handles the rest.

---

## Boot Video Spec

| Property    | Requirement                        |
|-------------|------------------------------------|
| Format      | MP4 (H.264)                        |
| Aspect      | 16:9 preferred, square acceptable  |
| Duration    | 5–15 seconds                       |
| Audio       | Silent / muted                     |
| Style       | Match GHOSTops Terminal aesthetic  |

---

## Logo Spec

| Property    | Requirement                        |
|-------------|------------------------------------|
| Format      | PNG with transparent background    |
| Dimensions  | 480 × 120px recommended            |
| Style       | High contrast, legible at 200px wide |

---

## Module Entry Point Contract (`index.js`)

Your `index.js` must export at minimum:
```javascript
module.exports = {
  id: 'YourModuleName',     // must match key in moduleBootConfig exactly
  version: '1.0.0',
  run: async () => {
    // module logic here
  }
}
```

---

## Marketplace Submission Checklist

Before submitting a module to the GHOSTops Marketplace:

- [ ] `index.js` exports `id`, `version`, and `run`
- [ ] Boot video is MP4, under 15 seconds, silent
- [ ] Logo is PNG, transparent background
- [ ] `README.md` exists and documents all module features
- [ ] Module tested against latest GHOSTops Terminal release
- [ ] No external network calls without explicit user consent
- [ ] No access to filesystem paths outside module's own `assets/` folder
- [ ] Submitted with contact email for support

---

## Questions?

Contact: buildghost.dev@gmail.com
