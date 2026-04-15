#!/usr/bin/env python3
"""Example probe focused on auth checks under latency pressure."""

import os
import random
import sys
import time


def env_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def env_int(name: str, default: int, minimum: int = 0, maximum: int = 100_000) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        value = int(raw)
    except ValueError:
        return default
    return max(minimum, min(maximum, value))


def main() -> int:
    latency_ms = env_int("LATENCY_MS", 120)
    strict_rate_limit = env_bool("STRICT_RATE_LIMIT")
    auth_bypass = env_bool("AUTH_BYPASS")
    token = os.getenv("AUTH_TOKEN", "").strip()

    print("SPOOLER PYTHON AUTH+LATENCY EXAMPLE START")
    print(f"latency_ms={latency_ms}")
    print(f"strict_rate_limit={str(strict_rate_limit).lower()}")
    print(f"auth_bypass={str(auth_bypass).lower()}")
    print(f"auth_token_present={str(bool(token)).lower()}")

    simulated_delay = max(0, latency_ms + random.randint(-15, 40))
    time.sleep(min(simulated_delay / 1000.0, 2.0))
    print(f"simulated_auth_check_delay_ms={simulated_delay}")

    if auth_bypass:
        print("probe_result=FAIL reason=auth_bypass_enabled")
        return 1

    if not token:
        if strict_rate_limit:
            print("probe_result=FAIL reason=missing_token_under_strict_rate_limit")
            return 1
        print("probe_step=fallback_to_guest_session true")
        print("probe_result=PASS mode=guest_fallback")
        return 0

    if token.lower().startswith("expired:"):
        print("probe_result=FAIL reason=expired_token")
        return 1

    print("probe_result=PASS mode=authenticated")
    return 0


if __name__ == "__main__":
    sys.exit(main())
