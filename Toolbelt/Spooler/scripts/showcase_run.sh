#!/usr/bin/env sh
set -eu

ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

RUN_ID="${1:-spool-showcase-$(date +%Y%m%d-%H%M%S)}"
ARTIFACT_DIR="${2:-logs/showcase}"

echo "[showcase] building target image..."
./scripts/build-target-agent-image.sh

echo "[showcase] executing scripted hostile scenario..."
python3 scripts/ci_run.py \
  --run-id "$RUN_ID" \
  --payload payload_probes/templates/python_retry_probe.py \
  --intent showcase_noninteractive_run \
  --network-profile edge_failure \
  --latency-ms 260 \
  --packet-loss-pct 12 \
  --cpu-budget 2 \
  --memory-budget 1g \
  --db-engine sqlite \
  --third-party-outage \
  --chaos-mode \
  --artifact-dir "$ARTIFACT_DIR"

echo "[showcase] complete"
echo "[showcase] result artifact: $ROOT/$ARTIFACT_DIR/$RUN_ID.result.json"
