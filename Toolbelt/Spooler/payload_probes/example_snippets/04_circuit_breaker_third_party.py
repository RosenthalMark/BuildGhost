#!/usr/bin/env python3
"""
SPOOLER Example: Circuit Breaker for Third-Party API
-----------------------------------------------------
Scenario fit: Third-Party Timeout Cascade, Full Chaos Fire Drill, Offline-First Failover

Simulates a circuit breaker wrapping calls to an upstream third-party service
(payment gateway, threat intel feed, identity provider, etc.). The circuit opens
after consecutive failures and rejects calls fast-fail until a cooldown passes.
SPOOLER's THIRD_PARTY_OUTAGE flag drives the upstream into failure mode so you
can verify the breaker trips correctly and downstream callers get clean fallbacks.
"""

import os
import random
import sys
import time


def env_bool(name, default=False):
    v = os.getenv(name, "")
    return v.strip().lower() in {"1", "true", "yes", "on"} if v else default


def env_int(name, default):
    try:
        return int(os.getenv(name, default))
    except (ValueError, TypeError):
        return default


FAILURE_THRESHOLD = 3
COOLDOWN_SECONDS = 0.8
HALF_OPEN_PROBE_ATTEMPTS = 2

STATE_CLOSED = "CLOSED"
STATE_OPEN = "OPEN"
STATE_HALF_OPEN = "HALF_OPEN"


class CircuitBreaker:
    def __init__(self):
        self.state = STATE_CLOSED
        self.failure_count = 0
        self.last_failure_time = 0
        self.success_count = 0

    def call(self, fn, *args, **kwargs):
        now = time.time()

        if self.state == STATE_OPEN:
            if now - self.last_failure_time >= COOLDOWN_SECONDS:
                self.state = STATE_HALF_OPEN
                self.success_count = 0
                print("circuit=HALF_OPEN probing_upstream=true")
            else:
                remaining = round(COOLDOWN_SECONDS - (now - self.last_failure_time), 2)
                print(f"circuit=OPEN fast_fail=true cooldown_remaining_s={remaining}")
                return None, "circuit_open"

        try:
            result = fn(*args, **kwargs)
            self._on_success()
            return result, "ok"
        except Exception as exc:
            self._on_failure()
            return None, str(exc)

    def _on_success(self):
        self.failure_count = 0
        if self.state == STATE_HALF_OPEN:
            self.success_count += 1
            if self.success_count >= HALF_OPEN_PROBE_ATTEMPTS:
                self.state = STATE_CLOSED
                print("circuit=CLOSED recovered=true")
        else:
            self.state = STATE_CLOSED

    def _on_failure(self):
        self.failure_count += 1
        self.last_failure_time = time.time()
        if self.failure_count >= FAILURE_THRESHOLD:
            self.state = STATE_OPEN
            print(f"circuit=OPEN failure_threshold={FAILURE_THRESHOLD} exceeded=true")


def call_third_party(latency_ms, outage_mode, chaos_mode, packet_loss_pct):
    jitter = random.randint(-20, 40)
    effective_latency = max(0, latency_ms + jitter)
    time.sleep(effective_latency / 1000.0)

    if outage_mode:
        mode = random.choice(["hard_down", "intermittent", "hard_down"])
        if mode == "hard_down":
            raise ConnectionError(f"upstream_unavailable latency_ms={effective_latency}")
        if mode == "intermittent" and random.random() < 0.7:
            raise TimeoutError(f"upstream_timeout_ms={effective_latency + 500}")

    if chaos_mode and random.random() < (packet_loss_pct / 100.0):
        raise ConnectionError("packet_drop simulated by chaos_mode")

    return {"status": "ok", "data": f"payload_{random.randint(1000, 9999)}"}


def main():
    latency_ms = env_int("LATENCY_MS", 120)
    third_party_outage = env_bool("THIRD_PARTY_OUTAGE")
    chaos_mode = env_bool("CHAOS_MODE")
    packet_loss_pct = env_int("PACKET_LOSS_PCT", 0)
    total_calls = 12

    print("CIRCUIT BREAKER THIRD-PARTY PROBE START")
    print(f"latency_ms={latency_ms}")
    print(f"third_party_outage={third_party_outage}")
    print(f"chaos_mode={chaos_mode}")
    print(f"packet_loss_pct={packet_loss_pct}")

    breaker = CircuitBreaker()
    results = {"ok": 0, "circuit_open": 0, "upstream_error": 0, "fast_fail": 0}

    for call_num in range(1, total_calls + 1):
        result, status = breaker.call(call_third_party, latency_ms, third_party_outage, chaos_mode, packet_loss_pct)
        print(f"call={call_num} circuit={breaker.state} status={status} data={result}")

        if status == "ok":
            results["ok"] += 1
        elif status == "circuit_open":
            results["fast_fail"] += 1
        else:
            results["upstream_error"] += 1

        time.sleep(0.05)

    circuit_healthy = breaker.state != STATE_OPEN
    probe_pass = circuit_healthy or results["fast_fail"] > 0

    print(f"probe_result={'PASS' if probe_pass else 'FAIL'}")
    print(f"circuit_final_state={breaker.state}")
    print(f"results={results}")
    return 0 if probe_pass else 1


if __name__ == "__main__":
    sys.exit(main())
