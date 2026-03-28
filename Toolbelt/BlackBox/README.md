# BLACKbox

## Mission
`BLACKbox` is the BuildGhost release-intelligence and migration module. Its job is to preserve test intent while modernizing automation stacks and reducing framework rewrite risk.

## Core Purpose
- Ingest existing suites from multiple frameworks and identify behavioral intent.
- Normalize selectors, waits, assertions, and fixture usage into a common execution model.
- Generate migration-ready outputs for modern runners, including `Selenium -> Playwright` and `Cypress -> Playwright`.
- Surface risk hotspots before merge with actionable conversion notes and confidence markers.

## How It Works (Planned Flow)
1. Intake legacy test assets, metadata, and run signals from local or CI contexts.
2. Build a normalized test graph that maps actions, assertions, and dependencies.
3. Transform framework-specific commands into target-runner equivalents.
4. Attach migration guidance for unsupported patterns and edge-case rewrites.
5. Emit translated suites, compatibility reports, and verification checkpoints.

## Intended Module Interop
- `SCRAPEtag` provides resilient selectors and interaction alias maps.
- `GHOSTstub` provides deterministic payload scenarios for repeatable validation.
- `BLACKbox` consumes both to increase translation fidelity and reduce flaky post-migration behavior.

## Current Status
- Module scaffold exists under `Toolbelt/BlackBox`.
- Sidebar slot is wired in GHOSTops Terminal as an operational module.
- Intro boot media is registered for module-load theater.
- Conversion engine and validation pipeline are not implemented yet.

## Near-Term Feature Targets
- Import adapters for Selenium and Cypress projects.
- Playwright-first output contracts with fixture mapping support.
- Translation diff reports for command parity and assertion drift.
- Confidence scoring with manual-review flags for unsafe conversions.
- Session export for reproducible migration runs.

## Status
**In Progress** - BLACKbox is actively being integrated and is not yet production-ready.
