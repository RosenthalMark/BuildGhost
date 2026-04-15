# SPOOLER

Local-first hostile-environment runner for generated code.

SPOOLER turns a scenario config + probe payload into reproducible Docker artifacts, applies real runtime pressure (CPU/memory limits, netem latency/loss, fault/outage behavior), and surfaces pass/fail + logs in both the app and CI.

## What SPOOLER Is Now

SPOOLER is a practical local test harness that lets you define a hostile scenario, build/run it reproducibly, and inspect results afterward. It now includes real resource/network enforcement, runtime contract interpretation, dependency fault simulation, reusable probes, scenario import/export, CI execution, internal module registration, and persisted run history.

## Current Capability Snapshot

- Preset + challenge-based scenario builder in Streamlit
- Local target image build script: `./scripts/build-target-agent-image.sh`
- Deterministic compose + injection artifact generation
- Absolute injection mount paths in generated compose for path correctness
- Local spin-up result visibility: compose output, container state, logs, run command, run/container id
- Runtime contract interpreter in target image (`runtime_controller.py`)
- Real Docker resource constraints in compose:
  - `cpus`
  - `mem_limit`
- Real Linux `tc/netem` shaping in container bootstrap (`apply_netem.sh`)
- Third-party outage simulation service (`docker/third-party-sim/server.py`)
- Reusable probe templates and example payloads
- IDE Connect local read-only file ingestion (workspace path based)
- Scenario export/import (JSON)
- Noninteractive CI execution mode (`scripts/ci_run.py`) + example GitHub workflow
- Internal plugin-style module registration for scenarios/faults (`spooler_modules/`)
- Persistent run history (`logs/run_history.jsonl`) + in-app Run Results & History view

## Prerequisites

- Docker Engine + Docker Compose plugin
- Python 3.10+
- macOS/Linux shell environment

## Quick Start (App)

1. Create env and install dependencies:

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

2. Build target image:

```bash
./scripts/build-target-agent-image.sh
```

3. Start app:

```bash
streamlit run app.py
```

4. In the UI:

- pick a preset/challenge
- upload/paste payload (or use IDE Connect path ingest)
- click **Build It**
- optionally enable local spin-up
- review generated artifacts and Run Results/History

## Show-It-Off Script (Fast Demo)

Run one scripted noninteractive demo locally:

```bash
./scripts/showcase_run.sh
```

Optional arguments:

```bash
./scripts/showcase_run.sh <run-id> <artifact-dir>
```

Example:

```bash
./scripts/showcase_run.sh spool-showcase logs/showcase
```

This script:

- builds `spooler/target-agent:latest`
- runs a deterministic hostile scenario through `scripts/ci_run.py`
- writes result artifacts under `logs/showcase/`

## Test/CI Script

Primary noninteractive execution script:

```bash
python3 scripts/ci_run.py --help
```

Typical local run:

```bash
python3 scripts/ci_run.py \
  --run-id spool-ci-local \
  --payload payload_probes/templates/python_retry_probe.py \
  --network-profile 3g_degraded \
  --latency-ms 180 \
  --packet-loss-pct 8 \
  --cpu-budget 2 \
  --memory-budget 1g \
  --third-party-outage \
  --chaos-mode \
  --artifact-dir logs/ci
```

CI workflow example:

- `.github/workflows/ci-execution.yml`

Result artifacts include:

- `<run-id>.result.json`
- `<run-id>.compose-up.log`
- `<run-id>.compose-down.log`
- `<run-id>.spool-target.log`
- `<run-id>.third-party-sim.log`

## Runtime Contract and Enforcement

SPOOLER emits env vars including:

- `INTENT`
- `NETWORK_PROFILE`
- `LATENCY_MS`
- `PACKET_LOSS_PCT`
- `CPU_BUDGET`
- `MEMORY_BUDGET`
- `DB_ENGINE`
- `SPOOLER_TARGET_PATH`
- `SPOOLER_RUN_COMMAND`
- `CHAOS_MODE`
- `VULNERABLE_DOM`
- `SQL_INJECTION`
- `AUTH_BYPASS`
- `THIRD_PARTY_OUTAGE`
- `STRICT_RATE_LIMIT`
- `THIRD_PARTY_ENDPOINT`

Enforcement path:

- Compose applies real container constraints (`cpus`, `mem_limit`)
- Bootstrap applies `tc netem` latency/loss on container interface
- Runtime controller interprets contract and applies retries/backoff/fault behavior
- Third-party simulation service provides healthy/hard-outage/intermittent upstream behavior

## Scenario Presets and Modules

Built-in presets include:

- Slow Mobile + Vulnerable DOM
- Auth Chaos Drill
- SQL Storm + Tight Limits
- Third-Party Timeout Cascade
- CPU Spike Recovery
- Memory Pressure Leak Hunt
- Packet Loss Retry Trap
- Offline-First Failover
- No-DB Fallback Path
- Full Chaos Fire Drill

Challenge levels:

- Preset Default
- Mild
- Balanced
- Hard
- Extreme

Internal extensibility:

- `spooler_modules/registry.py`
- `spooler_modules/builtin_scenarios.py`
- `spooler_modules/builtin_faults.py`

Add future scenario/fault modules through registration without expanding one large app file.

## Payload Probes

Templates:

- `payload_probes/templates/python_retry_probe.py`
- `payload_probes/templates/js_fallback_probe.js`
- `payload_probes/templates/shell_outage_probe.sh`

Examples:

- `payload_probes/examples/python_auth_latency_probe.py`
- `payload_probes/examples/shell_sqlish_failure_probe.sh`

## Scenario Export/Import

- Export current scenario from UI as JSON
- Re-import JSON to restore scenario settings
- Schema fields are versioned in-app for compatibility checks

## Run History and Results View

SPOOLER persists basic run records to:

- `logs/run_history.jsonl`

UI provides:

- status filter (`Pass`, `Fail`, `Recipe Only`, `Unknown`)
- run-id search
- run detail view
- artifact path visibility and downloads
- compose/inspect/log output view

## Repository Layout

```text
SPOOLER/
  app.py
  scripts/
    build-target-agent-image.sh
    ci_run.py
    showcase_run.sh
  docker/
    target-agent/
      Dockerfile
      runtime_controller.py
      apply_netem.sh
    third-party-sim/
      server.py
  payload_probes/
    templates/
    examples/
  spooler_modules/
    registry.py
    builtin_scenarios.py
    builtin_faults.py
  .github/workflows/
    ci-execution.yml
  recipes/
  injections/
  logs/
```

## Notes / Limits

- Designed for local Docker-first workflows.
- `tc/netem` enforcement depends on Docker runtime capabilities and container privileges (`NET_ADMIN`).
- CI mode is intentionally minimal and artifact-focused.

## License

MIT. See `LICENSE`.
