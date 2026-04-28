# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog principles and uses semantic versioning.

## [1.0.0] - 2026-04-19

### Added
- Repository version baseline via `VERSION` (`1.0.0`).
- Changelog and version-bump policy documentation in `README.md`.

### Changed
- Header status scroller behavior aligned across modules for consistent lane geometry and marquee travel.
- Harvest capture deduplication strengthened with a deterministic identity key before grouping.
- Harvest visibility checks refined to improve captured-element completeness while filtering hidden/non-rendered structural tags.
- Runtime launch/dependency checks hardened with interpreter fallback resolution (`venv`, env overrides, `python3`, `python`).
## [Unreleased]

### Fixed
- Spooler harness now reattaches correctly when returning to the module in-session instead of appearing inactive.
- Spooler webview retry flow no longer cancels reconnect attempts during initial Streamlit startup race conditions.
- Module intro videos now play once per app session per module (no repeat on module switch within same session).

