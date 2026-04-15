#!/usr/bin/env sh
set -eu

as_int() {
  value="${1:-0}"
  fallback="${2:-0}"
  case "$value" in
    ''|*[!0-9]*)
      echo "$fallback"
      return 0
      ;;
  esac
  echo "$value"
}

LATENCY_MS="$(as_int "${LATENCY_MS:-0}" 0)"
PACKET_LOSS_PCT="$(as_int "${PACKET_LOSS_PCT:-0}" 0)"

if [ "$PACKET_LOSS_PCT" -gt 100 ]; then
  PACKET_LOSS_PCT=100
fi

DEVICE="${SPOOLER_NET_DEVICE:-eth0}"

clear_qdisc() {
  tc qdisc del dev "$DEVICE" root 2>/dev/null || true
}

if [ "$LATENCY_MS" -le 0 ] && [ "$PACKET_LOSS_PCT" -le 0 ]; then
  clear_qdisc
  echo "SPOOLER_NETEM_STATUS:disabled latency_ms=0 packet_loss_pct=0"
  exit 0
fi

JITTER_MS=$((LATENCY_MS / 5))

set -- tc qdisc replace dev "$DEVICE" root netem
if [ "$LATENCY_MS" -gt 0 ]; then
  set -- "$@" delay "${LATENCY_MS}ms" "${JITTER_MS}ms" distribution normal
fi
if [ "$PACKET_LOSS_PCT" -gt 0 ]; then
  set -- "$@" loss "${PACKET_LOSS_PCT}%"
fi

"$@"

echo "SPOOLER_NETEM_STATUS:applied latency_ms=${LATENCY_MS} jitter_ms=${JITTER_MS} packet_loss_pct=${PACKET_LOSS_PCT} device=${DEVICE}"
tc qdisc show dev "$DEVICE" | sed 's/^/SPOOLER_NETEM_QDISC:/'
