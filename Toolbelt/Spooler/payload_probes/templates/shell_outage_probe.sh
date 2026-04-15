#!/usr/bin/env sh
set -eu

bool_flag() {
  case "${1:-false}" in
    1|true|TRUE|yes|on) echo "true" ;;
    *) echo "false" ;;
  esac
}

as_int() {
  case "${1:-}" in
    ''|*[!0-9]*) echo "${2:-0}" ;;
    *) echo "$1" ;;
  esac
}

latency_ms="$(as_int "${LATENCY_MS:-120}" 120)"
packet_loss_pct="$(as_int "${PACKET_LOSS_PCT:-0}" 0)"
third_party_outage="$(bool_flag "${THIRD_PARTY_OUTAGE:-false}")"
chaos_mode="$(bool_flag "${CHAOS_MODE:-false}")"
endpoint="${THIRD_PARTY_ENDPOINT:-http://third-party-sim:18080/third-party}"
max_attempts="$(as_int "${PROBE_MAX_ATTEMPTS:-3}" 3)"
allow_fallback="$(bool_flag "${ALLOW_FALLBACK:-true}")"

printf '%s\n' "SPOOLER SHELL OUTAGE PROBE START"
printf '%s\n' "latency_ms=${latency_ms}"
printf '%s\n' "packet_loss_pct=${packet_loss_pct}"
printf '%s\n' "third_party_outage=${third_party_outage}"
printf '%s\n' "chaos_mode=${chaos_mode}"
printf '%s\n' "endpoint=${endpoint}"

attempt=1
while [ "$attempt" -le "$max_attempts" ]; do
  delay_s=$(( (latency_ms + 999) / 1000 ))
  if [ "$delay_s" -gt 0 ]; then
    sleep "$delay_s"
  fi

  printf '%s\n' "attempt=${attempt}"

  # Deterministic local drop simulation to mimic preflight packet loss.
  if [ "$packet_loss_pct" -gt 0 ] && [ $((attempt * 30)) -le "$packet_loss_pct" ]; then
    printf '%s\n' "probe_step=preflight_drop simulated_packet_loss=true"
    attempt=$((attempt + 1))
    continue
  fi

  url="${endpoint}?attempt=${attempt}"

  if command -v curl >/dev/null 2>&1; then
    if curl --silent --show-error --fail --max-time 4 "$url" >/tmp/spooler-shell-probe-response.txt 2>/tmp/spooler-shell-probe-error.txt; then
      printf '%s\n' "probe_step=upstream_success"
      printf '%s\n' "probe_result=PASS fallback_used=false"
      exit 0
    fi
    err="$(cat /tmp/spooler-shell-probe-error.txt 2>/dev/null || true)"
    printf '%s\n' "probe_step=upstream_failure detail=${err}"
  else
    # If curl is unavailable, retain outage signal behavior in pure shell.
    if [ "$third_party_outage" = "true" ]; then
      printf '%s\n' "probe_step=upstream_failure detail=curl_unavailable_outage_mode=true"
    else
      printf '%s\n' "probe_step=upstream_failure detail=curl_unavailable"
    fi
  fi

  if [ "$attempt" -lt "$max_attempts" ]; then
    if [ "$chaos_mode" = "true" ]; then
      backoff_mult=2
    else
      backoff_mult=1
    fi
    backoff_s=$((attempt * backoff_mult))
    sleep "$backoff_s"
  fi

  attempt=$((attempt + 1))
done

if [ "$allow_fallback" = "true" ]; then
  printf '%s\n' "probe_step=fallback_activated mode=shell_local_default"
  printf '%s\n' "probe_result=PASS fallback_used=true"
  exit 0
fi

printf '%s\n' "probe_result=FAIL exhausted_retries=true"
exit 1
