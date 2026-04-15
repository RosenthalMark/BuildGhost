#!/usr/bin/env python3
"""
SPOOLER Example: Rate Limiter with Exponential Backoff
-------------------------------------------------------
Scenario fit: Strict Rate Limit, 3G Degraded, Packet Loss Retry Trap

Simulates a client hitting a rate-limited API endpoint. Under tight limits
and packet loss, retries pile up and the backoff strategy determines whether
the client recovers or exhausts its budget. Great for validating that your
retry logic doesn't thunder-herd a rate-limited upstream.
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


RATE_LIMIT_WINDOW_MS = 1000
MAX_REQUESTS_PER_WINDOW = 5
MAX_RETRIES = 6
BASE_BACKOFF_MS = 150


def simulate_api_call(request_num, latency_ms, strict_rate_limit, packet_loss_pct):
    jitter = random.randint(-20, 20)
    effective_latency = max(0, latency_ms + jitter)
    time.sleep(effective_latency / 1000.0)

    if strict_rate_limit and request_num > MAX_REQUESTS_PER_WINDOW:
        return "rate_limited", 429

    loss_roll = random.random()
    if loss_roll < (packet_loss_pct / 100.0):
        return "dropped", 0

    return "ok", 200


def main():
    latency_ms = env_int("LATENCY_MS", 80)
    packet_loss_pct = env_int("PACKET_LOSS_PCT", 0)
    strict_rate_limit = env_bool("STRICT_RATE_LIMIT")
    chaos_mode = env_bool("CHAOS_MODE")

    print("RATE LIMITER BACKOFF PROBE START")
    print(f"latency_ms={latency_ms}")
    print(f"packet_loss_pct={packet_loss_pct}")
    print(f"strict_rate_limit={strict_rate_limit}")
    print(f"chaos_mode={chaos_mode}")

    if chaos_mode:
        packet_loss_pct = min(packet_loss_pct + 15, 95)
        print(f"chaos_adjusted_packet_loss_pct={packet_loss_pct}")

    successful_requests = 0
    target_requests = 10

    for req_num in range(1, target_requests + 1):
        attempt = 0
        success = False

        while attempt <= MAX_RETRIES:
            status, code = simulate_api_call(req_num, latency_ms, strict_rate_limit, packet_loss_pct)
            print(f"req={req_num} attempt={attempt} status={status} code={code}")

            if status == "ok":
                successful_requests += 1
                success = True
                break

            if status == "rate_limited":
                backoff_ms = BASE_BACKOFF_MS * (2 ** attempt) + random.randint(0, 50)
                print(f"req={req_num} rate_limited backoff_ms={backoff_ms}")
                time.sleep(backoff_ms / 1000.0)

            if status == "dropped":
                backoff_ms = BASE_BACKOFF_MS * (2 ** attempt)
                print(f"req={req_num} packet_drop backoff_ms={backoff_ms}")
                time.sleep(backoff_ms / 1000.0)

            attempt += 1

        if not success:
            print(f"req={req_num} exhausted_retries=true")

    success_rate = successful_requests / target_requests
    print(f"probe_result={'PASS' if success_rate >= 0.7 else 'FAIL'}")
    print(f"success_rate={success_rate:.2f}")
    print(f"successful_requests={successful_requests}/{target_requests}")
    return 0 if success_rate >= 0.7 else 1


if __name__ == "__main__":
    sys.exit(main())
