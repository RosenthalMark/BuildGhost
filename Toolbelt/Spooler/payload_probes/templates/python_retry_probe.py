#!/usr/bin/env python3
"""Reusable Python retry probe template for SPOOLER payloads."""

import json
import os
import random
import sys
import time
from urllib import error, request


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


def bounded_probability(value: float) -> float:
    return max(0.0, min(value, 0.98))


def probe_upstream(url: str, timeout_seconds: float) -> tuple[bool, str]:
    req = request.Request(url, headers={"User-Agent": "spooler-python-retry-probe/1.0"})
    try:
        with request.urlopen(req, timeout=timeout_seconds) as response:
            body = response.read(160).decode("utf-8", errors="replace")
            code = response.getcode()
    except error.HTTPError as exc:
        body = exc.read(160).decode("utf-8", errors="replace")
        return False, f"http_status={exc.code} body={body}"
    except error.URLError as exc:
        return False, f"url_error={exc.reason}"
    except TimeoutError:
        return False, "timeout"
    except Exception as exc:  # defensive fallback for runtime probe use
        return False, f"unexpected_error={exc}"

    if 200 <= code < 300:
        return True, f"http_status={code} body={body}"
    return False, f"http_status={code} body={body}"


def main() -> int:
    cfg = {
        "intent": os.getenv("INTENT", "unset"),
        "network_profile": os.getenv("NETWORK_PROFILE", "unknown"),
        "latency_ms": env_int("LATENCY_MS", 120),
        "packet_loss_pct": env_int("PACKET_LOSS_PCT", 0, minimum=0, maximum=100),
        "chaos_mode": env_bool("CHAOS_MODE"),
        "third_party_outage": env_bool("THIRD_PARTY_OUTAGE"),
        "strict_rate_limit": env_bool("STRICT_RATE_LIMIT"),
        "auth_bypass": env_bool("AUTH_BYPASS"),
        "third_party_endpoint": os.getenv("THIRD_PARTY_ENDPOINT", "http://third-party-sim:18080/third-party"),
        "max_attempts": env_int("PROBE_MAX_ATTEMPTS", 4, minimum=1, maximum=8),
    }

    print("SPOOLER PYTHON RETRY PROBE START")
    print(json.dumps(cfg, indent=2, sort_keys=True))

    failure_probability = cfg["packet_loss_pct"] / 100.0
    if cfg["chaos_mode"]:
        failure_probability += 0.15
    if cfg["strict_rate_limit"]:
        failure_probability += 0.08
    if cfg["auth_bypass"]:
        failure_probability += 0.10
    failure_probability = bounded_probability(failure_probability)

    for attempt in range(1, cfg["max_attempts"] + 1):
        jitter_ms = random.randint(-20, 35)
        delay_ms = max(0, cfg["latency_ms"] + jitter_ms)
        time.sleep(min(delay_ms / 1000.0, 2.5))

        print(f"attempt={attempt} delay_ms={delay_ms} preflight_failure_probability={failure_probability:.2f}")
        if random.random() < failure_probability:
            print("probe_step=preflight_drop simulated_packet_loss=true")
            if attempt < cfg["max_attempts"]:
                time.sleep(min(0.20 * (2 ** (attempt - 1)), 2.0))
                continue
            print("probe_result=FAIL reason=preflight_packet_drop_exhausted")
            return 1

        endpoint = cfg["third_party_endpoint"]
        timeout_seconds = min(2.0 + (cfg["latency_ms"] / 1000.0), 6.0)

        if cfg["third_party_outage"]:
            endpoint = f"{endpoint}?attempt={attempt}"

        ok, detail = probe_upstream(endpoint, timeout_seconds=timeout_seconds)
        if ok:
            print(f"probe_step=upstream_success detail={detail}")
            print("probe_result=PASS")
            return 0

        print(f"probe_step=upstream_failure detail={detail}")
        if attempt < cfg["max_attempts"]:
            backoff_seconds = min(0.25 * (2 ** (attempt - 1)), 2.0)
            print(f"retry_backoff_seconds={backoff_seconds:.2f}")
            time.sleep(backoff_seconds)

    print("probe_result=FAIL exhausted_retries=true")
    return 1


if __name__ == "__main__":
    sys.exit(main())
