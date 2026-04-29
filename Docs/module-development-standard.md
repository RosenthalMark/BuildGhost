# GhostOps Terminal Module Development Standard

This document defines the contract a module must fulfill to integrate with `ghostops-terminal`. It applies to internal BuildGhost modules and future marketplace-style modules.

## Module File Structure

Every module lives inside `Toolbelt/`:

```text
Toolbelt/
  YourModuleName/
    index.js
    assets/
      yourmodule-boot.mp4
      yourmodule-logo.png
    README.md
```

Required files:

- `index.js`: module entry point
- `assets/yourmodule-boot.mp4`: boot sequence video
- `assets/yourmodule-logo.png`: module dock logo
- `README.md`: module documentation

## Registration Steps

### 1. Add the boot config entry

Update `moduleBootConfig` in `ghostops-terminal/src/services/bootManager.js`:

```javascript
const moduleBootConfig = {
  YourModuleName: {
    video: 'assets/modules/yourmodulename/yourmodule-boot.mp4',
    color: '#b8ff5a'
  }
}
```

### 2. Add the tool config entry

Update `toolConfig` in `ghostops-terminal/renderer.js`:

```javascript
const toolConfig = {
  YourModuleName: {
    preview: 'assets/previews/yourmodule.gif',
    description: 'One sentence describing what this module does.',
    expectedPath: '../Toolbelt/YourModuleName/index.js'
  }
}
```

### 3. Add the nav button

Update `ghostops-terminal/index.html`:

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

### 4. Allow the module in the main process

Update `ALLOWED_TOOLS` in `ghostops-terminal/main.js`:

```javascript
const ALLOWED_TOOLS = new Set(['scrapetag', 'GHOSTstub', 'YourModuleName'])
```

### 5. Add the module assets

Place these files under terminal assets:

```text
ghostops-terminal/assets/modules/yourmodulename/yourmodule-boot.mp4
ghostops-terminal/assets/modules/yourmodulename/yourmodule-logo.png
```

## Boot Video Spec

| Property | Requirement |
| --- | --- |
| Format | MP4 (H.264) |
| Aspect | 16:9 preferred, square acceptable |
| Duration | 5-15 seconds |
| Audio | Silent or muted |
| Style | Match GhostOps Terminal aesthetic |

## Logo Spec

| Property | Requirement |
| --- | --- |
| Format | PNG with transparent background |
| Dimensions | 480 x 120px recommended |
| Style | High contrast and legible at small dock sizes |

## Module Entry Point Contract

Your `index.js` must export at minimum:

```javascript
module.exports = {
  id: 'YourModuleName',
  version: '1.0.0',
  run: async () => {
    // module logic here
  }
}
```

Rules:

- `id` must match the module key used in terminal config
- `version` should track the module's current contract state
- `run` must exist even if the module shell is still minimal

## Submission Checklist

- [ ] `index.js` exports `id`, `version`, and `run`
- [ ] boot video is present and within spec
- [ ] logo is present and legible
- [ ] `README.md` documents actual current behavior
- [ ] module tested against the current terminal shell
- [ ] no undocumented external network behavior
- [ ] no access patterns outside intended module boundaries

## Notes

- keep module docs honest about what is implemented versus planned
- do not register a module in the terminal without its required shell assets
- prefer additive integration over one-off terminal logic for a single module
