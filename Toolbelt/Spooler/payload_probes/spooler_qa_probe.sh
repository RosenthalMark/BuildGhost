#!/usr/bin/env sh
set -eu

bool_flag() {
  case "${1:-false}" in
    1|true|TRUE|yes|on) echo "true" ;;
    *) echo "false" ;;
  esac
}

latency_ms="${LATENCY_MS:-120}"
packet_loss_pct="${PACKET_LOSS_PCT:-0}"
chaos_mode="$(bool_flag "${CHAOS_MODE:-false}")"
outage_mode="$(bool_flag "${THIRD_PARTY_OUTAGE:-false}")"

printf '%s\n' "SPOOLER QA PROBE START"
printf '%s\n' "intent=${INTENT:-unset}"
printf '%s\n' "network_profile=${NETWORK_PROFILE:-unknown}"
printf '%s\n' "latency_ms=${latency_ms}"
printf '%s\n' "packet_loss_pct=${packet_loss_pct}"
printf '%s\n' "chaos_mode=${chaos_mode}"
printf '%s\n' "third_party_outage=${outage_mode}"

# Lightweight deterministic stress signal for demos.
attempt=1
max_attempts=3
while [ "$attempt" -le "$max_attempts" ]; do
  printf '%s\n' "attempt=${attempt}"
  sleep 1
  attempt=$((attempt + 1))
done

printf '%s\n' "probe_result=PASS shell_probe_complete=true"
