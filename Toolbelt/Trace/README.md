# Trace

Trace is the deterministic state engine module for payment funnels inside BuildGhost.

## Purpose
- Capture immutable `StateSnapshot` records of transaction context.
- Enable replay and simulation between QA and development.
- Feed trace telemetry into shared shell components (Nixie Scroller + BigScreen).

## Shell Integration Status
- Sidebar registration in `ghostops-terminal` complete.
- First-boot Trace briefing gate complete (persisted via localStorage).

## Planned Contracts
- `StateSnapshot` interface (ID, source, status, payload, context, simulation metadata).
- Provider Factory (Stripe, Klarna, Manual Injection normalization).
- Iteration Engine (Coinflipper up to 1000x).

## Assets
- Logo: `assets/trace_logo.png`
