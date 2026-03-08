# GHOSTops Architecture & Design System

## The "Chameleon" Theming Engine
The UI is strictly driven by CSS variables to allow instant, global aesthetic shifts with a single class toggle. This ensures the application can adapt to both tactical environments and corporate screen-sharing scenarios.

### 1. NIGHT OPS (Default)
* **Vibe:** Cold War, Cyberpunk, Tactical, "Liquid Death" energy.
* **Palette:**
  * Background: Absolute Black (`#000000`) with CRT scanline overlays.
  * Primary Accent (`--line-hot`): Neon Green (`#39ff14`).
  * Secondary Text: Muted Tech Grays.

### 2. BOARDROOM / STEALTH (Enterprise HR Mode)
* **Vibe:** Clean, corporate, safe for screen-sharing in executive meetings. Mimics standard enterprise software (GitHub, Jira, Mac OS).
* **Palette:**
  * Background: Clean Matte White or Light Gray.
  * Primary Accent: Muted "Enterprise Blue".
  * Elements: Removes CRT scanlines, softens drop shadows, flattens UI depth.

### 3. THE ARMORY (Custom Configuration)
* **Vibe:** Fully unlocked user personalization.
* **Logic:** Exposes CSS variables to the end-user via the Settings module, allowing custom hex code injection for primary and secondary colors (e.g., Synthwave Purple/Pink).

## UI Component Standards
- **UX Theater (Artificial Latency):** Boot sequences must invoke `playBootSequence()` to trigger module-specific MP4s to simulate tactical initialization before mounting standard UI. This abstracts the loading logic and keeps the main renderer clean.
- **Left Rail Modules:** Module cards must maintain `min-height: 72px` with `object-fit: cover` to ensure future marketplace logos do not break the grid. Active states are indicated by a pulsing neon dot, not full-card glowing, to prevent CSS boundary bleed and maintain strict window containment.
- **The Telemetry Pod (Future):** HUD elements should be draggable and dynamically morph their data stream to match the active Toolbelt module.