# SPOOLER Portfolio Pitch

## One-Liner

SPOOLER is an environment packaging tool that lets teams test generated code under hostile, reproducible conditions in under a minute.

## What I Built

- Streamlit UI with a reduced "Simple Mode" and a full "Advanced Mode" toggle
- Preset-based scenario system with challenge overlays (`Mild` to `Extreme`)
- Injection workflow (drag/drop, browse, or paste)
- Deterministic artifact generation:
  - `Docker Compose` recipe
  - payload file
  - bootstrap script
- Optional local spin-up path via Docker Compose

## Why It Matters

This project addresses a common QA and security workflow gap:

- Teams can generate code quickly
- Reproducing edge-case environments is usually manual, slow, and inconsistent

SPOOLER reduces that gap by turning scenario configuration into a replayable package.

## Architectural Thinking

The current implementation is intentionally lightweight for rapid validation speed, but designed to evolve into a monorepo architecture:

- `ui`: scenario definition + payload capture
- `orchestrator`: config normalization and recipe generation
- `injector`: payload/bootstrap contract
- `runner`: local/CI environment execution adapters
- `profiles`: reusable environment presets

## Executive Talking Points

- I translated a fuzzy operational pain point into a concrete product workflow.
- I balanced adoption speed (simple path) with power-user control (advanced mode).
- I prioritized deterministic outputs for reproducibility and collaboration.
- I scoped v1 for usability while leaving clear seams for scale-out.
