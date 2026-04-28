# Trace Playbook

## Mission
Trace is a deterministic state engine for payment funnels. It captures immutable snapshots of transaction reality, replays them, runs controlled simulations, and enables shareable debugging across QA and Dev.

## Product Direction
Trace is not only a Stripe helper; it is a payment funnel simulator and reproducibility runtime.

### Primary Capabilities
- State Snapshot capture (`StateSnapshot`) with full deterministic context.
- Live Replay sandbox where operators edit state variables and rerun logic.
- Coinflipper simulation engine for split testing and risk checks (e.g., 90/10, 50/50, 60/40, custom ratios).
- Provider abstraction for Stripe, generic/custom checkouts, and manual injection.

### Universal Funnel Support
- Support Stripe-native flows and non-Stripe flows.
- Provide a Universal Injection zone for raw normalization code.
- Allow URL-target mode for live funnels when direct codebase access is unavailable.
- Support manual mapping when normalization cannot be inferred.

### Experiments
- Allow unlimited experiments per snapshot.
- Support custom split logic injection (sandboxed execution).
- Include deterministic seeds for reproducible experiment reruns.

### Deep Linking + Sharing
- Enable state-link sharing so collaborators can open exact Trace state.
- Primary deep-link target: `ghostops://trace/open?snapshot=<id>`.
- Web fallback should:
  - Open Trace if GhostOps Terminal is already installed.
  - Prompt install if not installed.
  - Resume and open the requested snapshot after install.

## Security & Compliance Guardrails (Non-Negotiable)
- Never persist raw PAN/CVV or payment secrets.
- Redact or tokenize sensitive fields by default.
- Encrypt snapshot payloads at rest and in transit.
- Use signed, expiring share links.
- Support optional passphrase protection for shared links.
- Keep immutable audit metadata for snapshot and replay actions.

## Shell Integration Requirements
- Register Trace in sidebar navigation.
- First-boot briefing with persisted "Don't show again" behavior.
- Feed trace telemetry to shared Nixie Scroller.
- Render replay and funnel visualization in shared BigScreen surface.
- Preserve inbound socket connection during module switches (hot-swappable behavior).

## Implementation Intent
- Decouple BigScreen and NixieScroller into shared shell components.
- Keep Trace module focused on domain logic + data contracts.
- Have Trace call shared shell surfaces via module contracts, not own UI internals.
