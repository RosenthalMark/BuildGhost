# SPOOLER Operations Runbook

## Goal

Show a complete environment packaging workflow in under 3 minutes:

- choose scenario
- inject probe
- build deterministic artifacts
- optionally spin up locally
- explain replayability

---

## Walkthrough Narrative

### 1. Problem Statement (15-20 seconds)

"Teams can generate code fast, but testing that code in realistic degraded conditions is slow and inconsistent. SPOOLER packages those conditions into reproducible artifacts in one click."

### 2. Quick Setup Path (45-60 seconds)

1. Set `Preset Scenario` to `Packet Loss Retry Trap`.
2. Set `Challenge Level` to `Hard`.
3. Upload `payload_probes/spooler_qa_probe.py`.
4. Click `Build It`.
5. Call out generated files shown by app:
- `recipes/spool-<timestamp>.yml`
- `injections/spool-<timestamp>/payload.py`
- `injections/spool-<timestamp>/bootstrap.sh`

### 3. Explain Runtime Contract (30-40 seconds)

"The injection directory mounts into `/opt/spooler/injection`. On container start, `bootstrap.sh` copies payload to `SPOOLER_TARGET_PATH` and optionally executes `SPOOLER_RUN_COMMAND`."

### 4. Optional Local Spin-Up (30-45 seconds)

Run command shown by app:

```bash
docker compose -f recipes/spool-<timestamp>.yml up -d --remove-orphans
```

Tear down:

```bash
docker compose -f recipes/spool-<timestamp>.yml down -v
```

### 5. Close (15 seconds)

"SPOOLER turns vague environment testing into a reproducible package anyone can rerun. It shortens test-to-fix loops and removes setup drift."

---

## Fast Fallbacks (If Live Run Breaks)

- If Docker image is unavailable: still show generated recipe + injections as deterministic output.
- If spin-up fails: show that build artifact generation still completed and is shareable.
- If upload fails: paste payload text directly into Injection Zone and build.
