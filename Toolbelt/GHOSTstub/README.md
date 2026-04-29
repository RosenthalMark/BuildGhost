# GHOSTstub

## Mission
`GHOSTstub` is the BuildGhost response-stubbing module. It lets QA and developers stabilize test runs when live services are slow, flaky, rate-limited, or unavailable.

## Core Purpose
- Provide deterministic API responses for local and CI sessions.
- Simulate edge cases (timeouts, 4xx/5xx, empty states, malformed payloads) without waiting on real backends.
- Keep frontend and automation work moving while upstream services change.

## Intended Module Interop
- `SCRAPEtag` captures selectors and interaction targets.
- `GHOSTstub` supplies predictable data behind those interactions.
- Future modules can consume both:
  - selector maps from `SCRAPEtag`
  - scenario payload sets from `GHOSTstub`

## Current Status
- The runtime entrypoint exists at `Toolbelt/GHOSTstub/index.js`.
- UI slot and boot sequence path are wired in `ghostops-terminal`.
- Full stubbing engine implementation is still pending.

## Near-Term Feature Targets
- Scenario profiles: `happy`, `empty`, `degraded`, `error`.
- Request matching by method + path + query fingerprint.
- Adjustable response delay and jitter controls.
- Session export of active stub profile for reproducible test runs.
