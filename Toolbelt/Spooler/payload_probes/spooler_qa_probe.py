#!/usr/bin/env python3
"""SPOOLER validation payload: checks env wiring and simulates unstable dependency behavior."""

import json
import os
import random
import sys
import time


def env_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def bounded_probability(value: float) -> float:
    return max(0.0, min(value, 0.98))


def main() -> int:
    config = {
        "intent": os.getenv("INTENT", "unset"),
        "network_profile": os.getenv("NETWORK_PROFILE", "unknown"),
        "latency_ms": env_int("LATENCY_MS", 120),
        "packet_loss_pct": env_int("PACKET_LOSS_PCT", 0),
        "cpu_budget": os.getenv("CPU_BUDGET", "2"),
        "memory_budget": os.getenv("MEMORY_BUDGET", "1g"),
        "db_engine": os.getenv("DB_ENGINE", "sqlite"),
        "chaos_mode": env_bool("CHAOS_MODE"),
        "auth_bypass": env_bool("AUTH_BYPASS"),
        "third_party_outage": env_bool("THIRD_PARTY_OUTAGE"),
        "strict_rate_limit": env_bool("STRICT_RATE_LIMIT"),
    }

    print("SPOOLER QA PROBE START")
    print(json.dumps(config, indent=2, sort_keys=True))

    base_failure = config["packet_loss_pct"] / 100.0
    if config["chaos_mode"]:
        base_failure += 0.15
    if config["third_party_outage"]:
        base_failure += 0.20
    if config["auth_bypass"]:
        base_failure += 0.10
    if config["strict_rate_limit"]:
        base_failure += 0.05

    failure_probability = bounded_probability(base_failure)

    max_attempts = 5
    backoff_seconds = 0.2

    for attempt in range(1, max_attempts + 1):
        jitter_ms = random.randint(-25, 25)
        simulated_latency_ms = max(0, config["latency_ms"] + jitter_ms)
        time.sleep(min(simulated_latency_ms / 1000.0, 1.0))

        roll = random.random()
        print(
            f"attempt={attempt} latency_ms={simulated_latency_ms} "
            f"failure_probability={failure_probability:.2f} roll={roll:.2f}"
        )

        if roll >= failure_probability:
            print("probe_result=PASS simulated_dependency_call=SUCCESS")
            return 0

        print("probe_result=RETRY simulated_dependency_call=FAILED")
        if attempt < max_attempts:
            wait_time = backoff_seconds * (2 ** (attempt - 1))
            print(f"retry_backoff_seconds={wait_time:.2f}")
            time.sleep(wait_time)

    print("probe_result=FAIL exhausted_retries=true")
    return 1


if __name__ == "__main__":
    sys.exit(main())
