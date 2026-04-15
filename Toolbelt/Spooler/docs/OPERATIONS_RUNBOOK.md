# SPOOLER Operations Runbook

> **Part of the BuildGhost GHOSTOPS ecosystem.** SPOOLER runs inside GhostOps Terminal as an embedded Streamlit webview and can also be launched standalone.

---

## What SPOOLER Does

SPOOLER is a **local-first hostile-environment harness**. You define a scenario (network conditions, resource limits, fault flags), inject a probe payload (code you want to test), and SPOOLER packages everything into a fully reproducible Docker Compose artifact. One click. One deterministic environment. Every time.

The problem it solves: teams generate code fast but can only test it in clean conditions. Real bugs surface in degraded networks, under memory pressure, with a third-party going down at 2am. SPOOLER makes those conditions repeatable and artifact-driven instead of tribal knowledge.

**What SPOOLER is not:** a full application runner. It is an environment-packaging and probe-injection tool. Your payload is the experiment unit — a focused code snippet that exercises a specific behavior under pressure. Keep payloads targeted: retry logic, auth flows, DB connection handling, rate limiting, not a full Express server.

---

## Prerequisites

- **Docker Engine** + **Docker Compose plugin** (`docker compose` — not `docker-compose`)
- **Python 3.10+**
- macOS or Linux shell (WSL2 works on Windows)
- The target Docker image built locally (see below)

---

## Quick Start

### 1. Set up the Python environment

```bash
cd Toolbelt/Spooler
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 2. Build the target agent image

This builds the Docker image SPOOLER injects your payload into:

```bash
./scripts/build-target-agent-image.sh
```

This only needs to run once (and again if you modify `docker/target-agent/`).

### 3. Start SPOOLER

```bash
streamlit run app.py
```

Or from GhostOps Terminal — click **SPOOLER** in the module dock. The terminal manages the process lifecycle automatically.

---

## The UI — Every Section Explained

### Quick Prompt

A single free-text field for describing **intent**. This text is written into the compose recipe as `INTENT` and printed by the runtime controller inside the container so you can see it in logs.

Use it as a label for this run: `"Testing retry logic on auth service under edge conditions"`. It does not change the behavior — it helps you understand the history entry later.

### Preset Scenario

A dropdown of 10 built-in hostile scenarios. Selecting one loads a full set of pre-configured values across network profile, resource limits, fault flags, and injection language — replacing whatever you currently have set.

Presets are the fastest way to start. They represent common failure archetypes, not contrived edge cases. See **Preset Scenarios Reference** below.

### Challenge Level

Applied **on top of** a preset. Escalates the hostility:

| Level | Effect |
|---|---|
| **Preset Default** | No modification — exact preset values |
| **Mild** | Slight latency increase, minor resource reduction |
| **Balanced** | Moderate latency spike, modest memory reduction, packet loss increase |
| **Hard** | High latency, tighter resources, more packet loss, some chaos flags toggled |
| **Extreme** | Pushes every parameter toward failure — maximum latency, minimal resources, all fault flags on |

Use Challenge Level to escalate a scenario step by step. Start at Balanced to find the inflection point where your code starts failing, then replay at Hard to confirm the failure is reproducible.

### Network Profile

Sets the simulated network condition applied to the container via Linux `tc netem`:

| Label | Profile | Behavior |
|---|---|---|
| **5G Stable** | `5g_stable` | Negligible latency, no loss |
| **WiFi Office** | `wifi_office` | Low latency, minimal jitter |
| **3G Degraded** | `3g_degraded` | Moderate latency (~400ms), some loss |
| **Edge Failure** | `edge_failure` | High latency, significant loss, instability |

### Latency (ms)

Manual override of the base latency in milliseconds. Works alongside network profile. This value is passed as `LATENCY_MS` env var — your probe reads it and uses it to simulate or verify timing-sensitive behavior.

### Packet Loss (%)

Percentage of packets dropped on the container's network interface via `tc netem`. Also passed as `PACKET_LOSS_PCT`. Your probe uses this to calculate failure probabilities for retry simulations.

### CPU Budget

Number of virtual CPUs allocated to the container via Docker `cpus` constraint. Real enforcement — the container cannot burst beyond this.

| Label | Value |
|---|---|
| 1 vCPU | `1` |
| 2 vCPU | `2` |
| 4 vCPU | `4` |
| 8 vCPU | `8` |

### Memory Budget

Hard memory limit on the container via Docker `mem_limit`. If the container exceeds this, the OOM killer fires.

| Label | Value |
|---|---|
| 512 MB | `512m` |
| 1 GB | `1g` |
| 2 GB | `2g` |
| 4 GB | `4g` |

### DB Engine

Sets the `DB_ENGINE` environment variable in the container. Does not spin up a real database — it signals to your payload what kind of DB it should expect or simulate. The `SQLite (No DB Container)` option is the special value that tells your probe no DB is available at all, which is useful for testing fallback paths.

---

## Fault Flags — What Each One Does

Fault flags are boolean environment variables injected into the container. Your probe reads them and adjusts behavior accordingly. They signal **risk posture**, not infrastructure — the real enforcement comes from resource limits and netem; the flags communicate the attack surface.

### Chaos Mode — `CHAOS_MODE=1`

Enables general unpredictability. Your probe should use this to introduce random failures, shuffle operation order, corrupt intermediate state, or add random delays on top of the base latency. The example snippets in `payload_probes/example_snippets/` all respond to `CHAOS_MODE` by increasing failure probability.

**Use when:** you want to go beyond clean path testing into genuine fault injection.

### Vulnerable DOM — `VULNERABLE_DOM=1`

Signals that the DOM (or equivalent UI surface) is configured in a permissive way that could expose it to XSS or script injection. For a backend probe, use this to enable code paths that skip output encoding or relax CSP enforcement.

**Use when:** testing whether your auth or rendering layer hardens correctly when the front-end config is permissive.

### SQL Injection Surface — `SQL_INJECTION=1`

Signals that the query layer may be receiving unsanitized input and SQL injection attempts should be exercised. Your probe should construct and attempt injection patterns and verify they are caught by the sanitizer, not executed.

**Use when:** validating query builders, ORM wrappers, or any code that constructs SQL strings from user input.

### Auth Bypass Path — `AUTH_BYPASS=1`

Signals that a misconfiguration exists that could allow unauthenticated access. Your probe should behave as if a bypass is attempted and verify the system correctly rejects it — or surface that it does not.

**Use when:** testing auth middleware, token validation, and session management.

### Third-Party Outage — `THIRD_PARTY_OUTAGE=1`

Signals that an upstream dependency (payment gateway, identity provider, threat intel feed, etc.) is unavailable or intermittently failing. Your probe should use this to drive its mock upstream into a failure state and verify that fallbacks, circuit breakers, and graceful degradation work.

Works in conjunction with the bundled `docker/third-party-sim/server.py`, which exposes `THIRD_PARTY_ENDPOINT` and responds with healthy, hard-down, or intermittent behavior based on configuration.

**Use when:** testing circuit breakers, retry loops, graceful degradation, and offline-first fallback paths.

### Strict Rate Limiting — `STRICT_RATE_LIMIT=1`

Signals that the rate limiter is configured at its tightest threshold. Your probe should use this to reduce the allowed request budget and verify that clients back off correctly instead of hammering the limit.

**Use when:** testing rate-limited clients, backoff strategies, and queue behavior under throttling.

---

## Injection Zone — How It Works

The Injection Zone is where your payload enters the system. There are three ways to get code in:

### 1. File Upload (Drag + Drop or Browse)

Upload any supported file type (`.py`, `.js`, `.ts`, `.sh`, `.bash`, `.json`, etc.). The file contents are copied into the **Injected Code Payload** editor. Language detection runs on the extension and updates target path and run command defaults automatically.

### 2. Try an Example

Click the **Try an Example** expander directly below the uploader. Pick from 10 ready-made probes, each targeting a real security/QA failure mode and wired to read SPOOLER env vars. The example loads into the payload editor where you can inspect or modify it before building.

**Available examples:**
1. **Rate Limiter Backoff** — exponential backoff under strict rate limiting and packet loss
2. **Jwt Validator Latency** — JWT validation races against clock skew and auth bypass config
3. **Sql Injection Surface** — query builder sanitization under injection pressure and CPU limits
4. **Circuit Breaker Third Party** — circuit breaker tripping and recovery on third-party outage
5. **Session Cache Chaos** — cache invalidation, LRU eviction, and bypass security risk detection
6. **Webhook Signature Packet Loss** — HMAC verification, replay detection, and drop handling
7. **File Upload Memory Pressure** — malware signature scanning under OOM conditions
8. **Feature Flag Stale Fallback** — stale cache and safe-default behavior when flag service is down
9. **Db Connection Pool Stress** — pool exhaustion, leak detection, and timeout handling
10. **Health Check Cascade** — multi-dependency health aggregation with hard timeouts

### 3. IDE Connect (Expander)

Provide a local workspace file path and click **Import Workspace File**. The file is read from disk and copied into the editor in read-only mode — your source file is never modified. Paths can be relative to the Spooler root or absolute.

This is the hook point for future IDE module integration: when the IDE module is wired up, it will write a payload path here and Spooler will ingest it automatically.

### Injected Code Payload Editor

The text area below the uploader is the final payload. This is exactly what gets written to `injections/<run-id>/payload.<ext>`. Edit directly in the editor for quick iterations without switching tools. Nothing is persisted between sessions unless you export the scenario.

### Injection Language

Sets the language family for the payload. Drives:
- **Target path default** (`/workspace/injected/main.py`, `.js`, `.sh`, etc.)
- **Run command default** (`python`, `node`, `sh`)
- File extension on the written artifact

Override target path and run command manually in the Advanced Controls section.

---

## Runtime Contract — All Environment Variables

These variables are emitted into the container environment by the generated compose recipe. Your probe reads them via `os.getenv()` / `process.env`. They define the contract between the SPOOLER control plane and your payload.

| Variable | Type | Source | Description |
|---|---|---|---|
| `INTENT` | string | Quick Prompt | Human-readable label for this run |
| `NETWORK_PROFILE` | string | Network Profile | Profile key: `5g_stable`, `wifi_office`, `3g_degraded`, `edge_failure` |
| `LATENCY_MS` | int | Latency slider | Base simulated latency in milliseconds |
| `PACKET_LOSS_PCT` | int | Packet Loss slider | Packet drop percentage for netem |
| `CPU_BUDGET` | string | CPU Budget | vCPU count: `"1"`, `"2"`, `"4"`, `"8"` |
| `MEMORY_BUDGET` | string | Memory Budget | Memory limit: `"512m"`, `"1g"`, `"2g"`, `"4g"` |
| `DB_ENGINE` | string | DB Engine | Database label: `postgres_15`, `mysql_8`, `mongodb_7`, `sqlite_no_db` |
| `SPOOLER_TARGET_PATH` | string | Target Path | Path inside container where payload is written |
| `SPOOLER_RUN_COMMAND` | string | Run Command | Command executed after bootstrap copies payload |
| `CHAOS_MODE` | bool | Fault flag | `"1"` when Chaos Mode is enabled |
| `VULNERABLE_DOM` | bool | Fault flag | `"1"` when Vulnerable DOM is enabled |
| `SQL_INJECTION` | bool | Fault flag | `"1"` when SQL Injection Surface is enabled |
| `AUTH_BYPASS` | bool | Fault flag | `"1"` when Auth Bypass Path is enabled |
| `THIRD_PARTY_OUTAGE` | bool | Fault flag | `"1"` when Third-Party Outage is enabled |
| `STRICT_RATE_LIMIT` | bool | Fault flag | `"1"` when Strict Rate Limiting is enabled |
| `THIRD_PARTY_ENDPOINT` | string | third-party-sim | URL of the bundled outage simulation service |

**Reading env vars in Python:**
```python
import os

latency_ms = int(os.getenv("LATENCY_MS", "120"))
chaos_mode = os.getenv("CHAOS_MODE", "").lower() in {"1", "true", "yes"}
```

**Reading env vars in Node:**
```javascript
const latencyMs = parseInt(process.env.LATENCY_MS || "120", 10);
const chaosMode = ["1","true","yes"].includes((process.env.CHAOS_MODE || "").toLowerCase());
```

---

## Build It — Artifact Generation

Clicking **Build It** freezes the current state of the control panel into a timestamped run package:

```
recipes/spool-<YYYYMMDD-HHMMSS>.yml       ← Docker Compose recipe
injections/spool-<YYYYMMDD-HHMMSS>/
  payload.<ext>                            ← Your injected code
  bootstrap.sh                             ← Container bootstrap script
```

### What the compose recipe contains

- Service definitions for `spool-target` (your payload host) and optionally `spool-third-party-sim`
- Real Docker resource constraints: `cpus` and `mem_limit`
- Bind mount: `injections/<run-id>/` → `/opt/spooler/injection` inside the container
- All runtime contract env vars injected into the container environment
- A startup command that runs `bootstrap.sh` and then tails the container alive

### What bootstrap.sh does

1. Copies `payload.<ext>` from `/opt/spooler/injection/` to `SPOOLER_TARGET_PATH` inside the container
2. If `SPOOLER_RUN_COMMAND` is set, executes the payload
3. `apply_netem.sh` runs in parallel to apply `tc netem` latency and packet loss on the container's network interface (requires `NET_ADMIN` capability)

### Determinism guarantee

The recipe is a point-in-time snapshot. You can share `recipes/spool-<id>.yml` + `injections/spool-<id>/` with anyone and they will get an identical environment. Nothing in the recipe references your local machine path for execution — paths are absolute inside the container.

---

## Local Spin-Up

Enable the **Local Spin-Up** toggle before clicking Build It. After artifact generation, SPOOLER runs:

```bash
docker compose -f recipes/<run-id>.yml up -d --remove-orphans
```

The app shows:
- Compose startup output
- Container state and ID
- Full container logs
- The exact command used to spin up

To spin down manually:

```bash
docker compose -f recipes/spool-<run-id>.yml down -v
```

**Note:** Local spin-up requires Docker Engine running and the target image built. Artifact generation always succeeds even if spin-up fails — the package is still complete and shareable.

---

## Third-Party Simulation Service

When `Third-Party Outage` is enabled, the compose recipe includes a second service: `spool-third-party-sim`. This is a lightweight Flask server (`docker/third-party-sim/server.py`) that exposes:

- `GET /health` — returns healthy, degraded, or hard-down responses based on config
- `GET /data` — simulates a payload endpoint with intermittent failures

Its URL is injected as `THIRD_PARTY_ENDPOINT` into the target container. Your probe calls this URL to simulate hitting an upstream API and tests whether your code handles the failure modes gracefully.

**Response modes** (configurable via the server):
- **Healthy**: 200 with valid payload
- **Intermittent**: random mix of 200, 503, and timeout
- **Hard down**: immediate 503 on every request

---

## CI Mode

For noninteractive CI execution, use the Python script directly:

```bash
python3 scripts/ci_run.py --help
```

**Typical run:**

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

**Output artifacts** (in `--artifact-dir`):
- `<run-id>.result.json` — pass/fail verdict with metadata
- `<run-id>.compose-up.log` — full Docker Compose startup output
- `<run-id>.compose-down.log` — teardown output
- `<run-id>.spool-target.log` — stdout/stderr from your payload inside the container
- `<run-id>.third-party-sim.log` — third-party service logs if outage mode was on

**GitHub Actions example:** `.github/workflows/ci-execution.yml`

---

## Scenario Export / Import

Export the current scenario (all control panel settings) as a JSON file for sharing or version control:

```json
{
  "schema": "spooler-scenario",
  "version": 1,
  "network_profile_label": "Edge Failure",
  "latency_ms": 410,
  "packet_loss_pct": 18,
  "cpu_budget_label": "2 vCPU",
  "memory_budget_label": "1 GB",
  "chaos_mode": true,
  "auth_bypass": true,
  ...
}
```

Import a JSON to restore the exact scenario settings. Schema version checking ensures compatibility. Use this to share reproducer configurations with teammates: "here's the exact scenario that made the auth service fail."

---

## Run History and Results View

SPOOLER persists every build to `logs/run_history.jsonl`. Each line is a JSON record:

```json
{
  "run_id": "spool-20260412-154710",
  "ts": "2026-04-12T15:47:10",
  "status": "Pass",
  "recipe_path": "recipes/spool-20260412-154710.yml",
  "intent": "Testing retry backoff under packet loss"
}
```

**Filtering and search:**
- Filter by status: `Pass`, `Fail`, `Recipe Only` (artifact generated, no spin-up), `Unknown`
- Search by run ID substring
- Click any entry to expand the detail view

**Detail view shows:**
- Scenario summary (all params at time of build)
- Artifact paths with download links
- Compose output, container logs, inspect output

---

## Preset Scenarios Reference

### Slow Mobile + Vulnerable DOM
**What it tests:** Code under degraded mobile conditions (520ms latency, 8% packet loss) with DOM misconfiguration exposure. 1 vCPU, 512MB, strict rate limiting.
**Fault flags:** `VULNERABLE_DOM=1`, `STRICT_RATE_LIMIT=1`
**Best with:** UI rendering probes, mobile-path retry logic, XSS guard validation

### Auth Chaos Drill
**What it tests:** Token expiry races, bypass behavior, and partial upstream failures. Edge network, 390ms latency, 5% loss. Chaos mode and both auth flags on.
**Fault flags:** `CHAOS_MODE=1`, `AUTH_BYPASS=1`, `THIRD_PARTY_OUTAGE=1`, `STRICT_RATE_LIMIT=1`
**Best with:** JWT validators, session managers, token refresh flows

### SQL Storm + Tight Limits
**What it tests:** Query sanitization under SQL injection pressure with strict rate limits. WiFi network, 140ms latency, chaos mode.
**Fault flags:** `CHAOS_MODE=1`, `SQL_INJECTION=1`, `STRICT_RATE_LIMIT=1`
**Best with:** Query builders, ORM wrappers, input sanitizers, parameterization checks

### Third-Party Timeout Cascade
**What it tests:** Upstream dependency instability. 3G, 460ms latency, 6% loss, third-party outage + chaos.
**Fault flags:** `CHAOS_MODE=1`, `THIRD_PARTY_OUTAGE=1`, `STRICT_RATE_LIMIT=1`
**Best with:** Circuit breakers, HTTP client retry wrappers, fallback handlers

### CPU Spike Recovery
**What it tests:** Retry and backoff logic under CPU starvation. 1 vCPU, WiFi, 170ms latency, chaos + outage.
**Fault flags:** `CHAOS_MODE=1`, `THIRD_PARTY_OUTAGE=1`
**Best with:** Compute-heavy retry logic, thread pool behavior, queue processors

### Memory Pressure Leak Hunt
**What it tests:** Low-memory behavior that surfaces leak-prone code paths. 512MB, WiFi, chaos on.
**Fault flags:** `CHAOS_MODE=1`, `STRICT_RATE_LIMIT=1`
**Best with:** Buffer handling, cache sizing, file processors, anything that holds state

### Packet Loss Retry Trap
**What it tests:** Idempotency and retry logic when 18% packet loss causes duplicates and partial requests. Edge network, 410ms latency, auth bypass + outage.
**Fault flags:** `CHAOS_MODE=1`, `AUTH_BYPASS=1`, `THIRD_PARTY_OUTAGE=1`, `STRICT_RATE_LIMIT=1`
**Best with:** Webhook handlers, API clients, idempotency key implementations

### Offline-First Failover
**What it tests:** Graceful degradation when the network is mostly gone. Edge, 700ms, 25% loss, SQLite (no DB), outage + chaos.
**Fault flags:** `CHAOS_MODE=1`, `THIRD_PARTY_OUTAGE=1`
**Best with:** Offline cache strategies, sync queues, local-first architectures

### No-DB Fallback Path
**What it tests:** Code when no database container is present at all. 5G stable, no fault flags — isolates just the DB fallback logic without other noise.
**Fault flags:** None (uses SQLite/no-DB engine flag)
**Best with:** SQLite fallbacks, in-memory stores, file-based persistence

### Full Chaos Fire Drill
**What it tests:** Everything at once. Edge network, 780ms, 22% loss, 1 vCPU, 512MB, all fault flags enabled. The "does this even survive" test.
**Fault flags:** All six fault flags enabled
**Best with:** Final integration validation, "ship it?" go/no-go gate, stress test baselines

---

## Adding Custom Scenarios

Custom scenarios are registered via the module system. Create a new file in `spooler_modules/`:

```python
# spooler_modules/my_scenarios.py
from __future__ import annotations
from .registry import register_presets

MY_PRESETS: dict[str, dict] = {
    "My Custom Scenario": {
        "intent_text": "Testing my specific failure mode.",
        "network_profile_label": "3G Degraded",
        "latency_ms": 300,
        "packet_loss_pct": 10,
        "cpu_budget_label": "2 vCPU",
        "memory_budget_label": "1 GB",
        "db_engine_label": "Postgres 15",
        "chaos_mode": True,
        "vulnerable_dom": False,
        "sql_injection": False,
        "auth_bypass": False,
        "third_party_outage": True,
        "strict_rate_limit": False,
        "injection_language": "python",
        "target_path": "/workspace/injected/main.py",
        "run_command": "python /workspace/injected/main.py",
        "payload_text": "print('my custom scenario')",
        "spin_now": False,
    }
}

def register_my_scenarios() -> None:
    register_presets(MY_PRESETS)
```

Then register it in `spooler_modules/__init__.py`:

```python
from .my_scenarios import register_my_scenarios
register_my_scenarios()
```

Your scenario appears in the Preset Scenario dropdown immediately on next app reload.

---

## Adding Custom Fault Flags

New fault flags follow the same pattern:

```python
# spooler_modules/my_faults.py
from __future__ import annotations
from .registry import FaultModule, register_fault_modules

MY_FAULTS = (
    FaultModule(
        key="ssl_strip",
        env_var="SSL_STRIP",
        ticker_name="ssl_strip",
        label="SSL Strip Surface",
        default_enabled=False,
    ),
)

def register_my_faults() -> None:
    register_fault_modules(MY_FAULTS)
```

Register in `__init__.py` and the flag appears in the Fault Flags panel with its own toggle. The env var is automatically included in generated compose recipes.

---

## Recipe Format Explained

A generated recipe looks like this (simplified):

```yaml
version: "3.9"

services:
  spool-target:
    image: spooler/target-agent:latest
    environment:
      INTENT: "Testing retry backoff"
      NETWORK_PROFILE: edge_failure
      LATENCY_MS: "410"
      PACKET_LOSS_PCT: "18"
      CPU_BUDGET: "2"
      MEMORY_BUDGET: "1g"
      CHAOS_MODE: "1"
      AUTH_BYPASS: "1"
      THIRD_PARTY_OUTAGE: "1"
      STRICT_RATE_LIMIT: "1"
      SPOOLER_TARGET_PATH: "/workspace/injected/main.py"
      SPOOLER_RUN_COMMAND: "python /workspace/injected/main.py"
      THIRD_PARTY_ENDPOINT: "http://spool-third-party-sim:5050"
    volumes:
      - source: "/absolute/path/to/injections/spool-20260412-154710"
        target: /opt/spooler/injection
        type: bind
    deploy:
      resources:
        limits:
          cpus: "2"
          memory: 1g
    cap_add:
      - NET_ADMIN
    command: >
      sh -c "if [ -f /opt/spooler/injection/bootstrap.sh ];
             then sh /opt/spooler/injection/bootstrap.sh;
             fi; tail -f /dev/null"

  spool-third-party-sim:
    image: python:3.12-slim
    ...
```

**Key points:**
- Injection mount uses **absolute paths** — this is why the recipe must be used on the machine that generated it (or paths adjusted for CI)
- `cap_add: NET_ADMIN` is required for `tc netem` to apply latency/loss
- `tail -f /dev/null` keeps the container alive for log inspection after payload exits

---

## Writing Effective Probes

**Do:**
- Read every relevant env var at startup and print them — makes logs self-documenting
- Simulate latency explicitly in your probe using `LATENCY_MS` — this mirrors what a real network call would experience
- Print structured key=value output (`probe_result=PASS`, `attempt=3 status=retry`) — makes logs greppable
- Exit 0 for pass, exit 1 for fail — CI mode uses this exit code
- Test the **dangerous case** explicitly: if `AUTH_BYPASS=1`, verify the bypass is rejected, not just that normal auth works

**Don't:**
- Import libraries not available in the container base image (only stdlib + whatever you install)
- Use hardcoded timeouts that don't account for `LATENCY_MS`
- Swallow exceptions silently — let the probe fail loudly so SPOOLER captures the log
- Assume Docker networking is the same as your dev machine — the container is isolated

**Probe output convention:**
```
PROBE_NAME START
param1=value1
param2=value2
...
step_name=result detail=info
...
probe_result=PASS   ← or FAIL
summary_stat=value
```

---

## Troubleshooting

### Container fails to start
- Check that the target image exists: `docker images | grep spooler`
- Run `./scripts/build-target-agent-image.sh` to rebuild
- Ensure Docker daemon is running

### `tc netem` not applying
- The container requires `NET_ADMIN` capability, which is included in generated recipes
- Some Docker Desktop versions on macOS restrict `NET_ADMIN` — latency will still be simulated via `LATENCY_MS` env var in your probe even if netem is blocked

### Spin-up hangs
- Port conflict: another container is using the same ports — change port mapping in recipe or stop the conflicting container
- Increase Docker resource limits in Docker Desktop settings if on macOS

### Payload not executing
- Verify `SPOOLER_RUN_COMMAND` is set correctly for your language
- Check that the file extension matched the language (auto-detection sets command defaults)
- Look at `<run-id>.spool-target.log` — bootstrap errors appear there

### App not loading in GhostOps Terminal
- SPOOLER starts Streamlit on port `8512` — verify nothing else is using that port
- Check the GhostOps Terminal logs in the module dock for the Streamlit process stderr

---

## Payload Probe Templates

Pre-built starting points in `payload_probes/templates/`:

- **`python_retry_probe.py`** — Basic retry loop with backoff, reads all core env vars
- **`js_fallback_probe.js`** — Node fallback handler pattern with timeout simulation
- **`shell_outage_probe.sh`** — Shell probe for checking outage behavior with minimal deps

Example probes (more complex, targeted) in `payload_probes/examples/`:

- **`python_auth_latency_probe.py`** — Auth token validation under latency and rate limiting
- **`shell_sqlish_failure_probe.sh`** — Shell-based query-like failure simulation

Fully integrated example snippets (load via **Try an Example** in the UI) in `payload_probes/example_snippets/` — see the list above.

---

## Demo Script (Fast Show-It-Off)

```bash
./scripts/showcase_run.sh
```

Or with explicit run ID and artifact dir:

```bash
./scripts/showcase_run.sh spool-showcase logs/showcase
```

This script builds the target image, runs a deterministic hostile scenario via `ci_run.py`, and writes all result artifacts under `logs/showcase/`. Use this to show SPOOLER working end-to-end in under 90 seconds without touching the UI.

---

## Repository Layout

```
Toolbelt/Spooler/
  app.py                          ← Streamlit application (main entry)
  requirements.txt                ← Python dependencies (streamlit only)
  index.js                        ← GhostOps Terminal bridge (Node child_process)
  scripts/
    build-target-agent-image.sh   ← Builds the Docker target agent image
    ci_run.py                     ← Noninteractive CI execution driver
    showcase_run.sh               ← Demo/show-it-off script
  docker/
    target-agent/
      Dockerfile                  ← Target container image definition
      runtime_controller.py       ← Interprets runtime contract inside container
      apply_netem.sh              ← tc netem latency/loss enforcement
    third-party-sim/
      server.py                   ← Outage simulation service (Flask)
  spooler_modules/
    __init__.py                   ← Module registration bootstrap
    registry.py                   ← Preset and fault registration API
    builtin_scenarios.py          ← 10 built-in preset scenarios
    builtin_faults.py             ← 6 built-in fault flag definitions
  payload_probes/
    templates/                    ← Minimal starting-point probes
    examples/                     ← More complete example probes
    example_snippets/             ← 10 Try-an-Example snippets (loaded via UI)
    spooler_qa_probe.py/.js/.sh   ← General-purpose QA validation probes
  docs/
    OPERATIONS_RUNBOOK.md         ← This file
    PORTFOLIO_PITCH.md            ← Executive summary
  assets/                         ← Logos, UI images
  recipes/                        ← Generated compose recipes (gitignored by pattern)
  injections/                     ← Generated injection artifacts (gitignored by pattern)
  logs/                           ← Run history and CI logs (gitignored except .gitkeep)
  .github/workflows/
    ci-execution.yml              ← Example GitHub Actions CI workflow
```
