#!/usr/bin/env python3
"""
SPOOLER Example: Health Check Cascade Detector
-----------------------------------------------
Scenario fit: No-DB Fallback Path, Third-Party Timeout Cascade, Full Chaos Fire Drill

Simulates a service health check system that polls multiple downstream dependencies
(database, cache, identity provider, payment API, internal scoring service) and
aggregates their status into an overall health verdict. This is the exact scenario
where cascading failures bite teams: one slow upstream causes the health endpoint
itself to time out, which the load balancer reads as "service down," which triggers
a failover that overloads the backup — the cascade begins.

SPOOLER environment vars drive each dependency into failure independently so you
can verify that partial degradation returns 207 (degraded) not 503 (down), and
that the health checker itself has a hard timeout instead of blocking indefinitely.
"""

import os
import random
import sys
import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeout


def env_bool(name, default=False):
    v = os.getenv(name, "")
    return v.strip().lower() in {"1", "true", "yes", "on"} if v else default


def env_int(name, default):
    try:
        return int(os.getenv(name, default))
    except (ValueError, TypeError):
        return default


HEALTH_CHECK_TIMEOUT_S = 2.0
INDIVIDUAL_CHECK_TIMEOUT_S = 0.8

STATUS_HEALTHY = "healthy"
STATUS_DEGRADED = "degraded"
STATUS_UNAVAILABLE = "unavailable"


def check_database(latency_ms, no_db_fallback):
    time.sleep(max(0, latency_ms + random.randint(-10, 30)) / 1000.0)
    if no_db_fallback:
        return STATUS_UNAVAILABLE, "connection_refused"
    if random.random() < 0.05:
        return STATUS_DEGRADED, "high_query_latency"
    return STATUS_HEALTHY, None


def check_cache(latency_ms, chaos_mode):
    time.sleep(max(0, (latency_ms // 2) + random.randint(-5, 20)) / 1000.0)
    if chaos_mode and random.random() < 0.3:
        return STATUS_DEGRADED, "cache_miss_rate_elevated"
    return STATUS_HEALTHY, None


def check_identity_provider(latency_ms, third_party_outage):
    time.sleep(max(0, latency_ms + random.randint(-20, 80)) / 1000.0)
    if third_party_outage:
        mode = random.choice(["hard_down", "hard_down", "timeout"])
        return STATUS_UNAVAILABLE, f"idp_{mode}"
    return STATUS_HEALTHY, None


def check_payment_api(latency_ms, third_party_outage, packet_loss_pct):
    time.sleep(max(0, latency_ms + random.randint(0, 60)) / 1000.0)
    if random.random() < (packet_loss_pct / 100.0):
        return STATUS_DEGRADED, "packet_loss_detected"
    if third_party_outage and random.random() < 0.5:
        return STATUS_UNAVAILABLE, "payment_provider_down"
    return STATUS_HEALTHY, None


def check_ml_scoring(latency_ms, cpu_budget):
    cpu_cores = float(cpu_budget) if cpu_budget else 2.0
    effective_latency = latency_ms * (1 + (1 / max(cpu_cores, 0.5)))
    time.sleep(min(effective_latency / 1000.0, 1.5))
    if cpu_cores < 1.0:
        return STATUS_UNAVAILABLE, "insufficient_cpu_for_model"
    if cpu_cores < 2.0:
        return STATUS_DEGRADED, "model_inference_slow"
    return STATUS_HEALTHY, None


def aggregate_health(results):
    statuses = [r["status"] for r in results.values()]
    if all(s == STATUS_HEALTHY for s in statuses):
        return 200, STATUS_HEALTHY
    if any(s == STATUS_UNAVAILABLE for s in statuses):
        critical_unavailable = [
            name for name, r in results.items()
            if r["status"] == STATUS_UNAVAILABLE and name in {"database", "identity_provider"}
        ]
        if critical_unavailable:
            return 503, STATUS_UNAVAILABLE
    return 207, STATUS_DEGRADED


def run_health_check(latency_ms, no_db_fallback, third_party_outage, chaos_mode, packet_loss_pct, cpu_budget):
    checks = {
        "database": lambda: check_database(latency_ms, no_db_fallback),
        "cache": lambda: check_cache(latency_ms, chaos_mode),
        "identity_provider": lambda: check_identity_provider(latency_ms, third_party_outage),
        "payment_api": lambda: check_payment_api(latency_ms, third_party_outage, packet_loss_pct),
        "ml_scoring": lambda: check_ml_scoring(latency_ms, cpu_budget),
    }

    results = {}

    with ThreadPoolExecutor(max_workers=len(checks)) as executor:
        futures = {name: executor.submit(fn) for name, fn in checks.items()}

        for name, future in futures.items():
            try:
                status, reason = future.result(timeout=INDIVIDUAL_CHECK_TIMEOUT_S)
                results[name] = {"status": status, "reason": reason}
            except FuturesTimeout:
                results[name] = {"status": STATUS_DEGRADED, "reason": "check_timed_out"}
            except Exception as exc:
                results[name] = {"status": STATUS_UNAVAILABLE, "reason": str(exc)}

    return results


def main():
    latency_ms = env_int("LATENCY_MS", 100)
    third_party_outage = env_bool("THIRD_PARTY_OUTAGE")
    chaos_mode = env_bool("CHAOS_MODE")
    packet_loss_pct = env_int("PACKET_LOSS_PCT", 0)
    cpu_budget = os.getenv("CPU_BUDGET", "2")
    no_db = env_bool("NO_DB_FALLBACK") or (os.getenv("DB_ENGINE", "") == "none")

    print("HEALTH CHECK CASCADE PROBE START")
    print(f"latency_ms={latency_ms}")
    print(f"third_party_outage={third_party_outage}")
    print(f"chaos_mode={chaos_mode}")
    print(f"packet_loss_pct={packet_loss_pct}")
    print(f"no_db_fallback={no_db}")
    print(f"cpu_budget={cpu_budget}")

    start = time.time()
    results = run_health_check(latency_ms, no_db, third_party_outage, chaos_mode, packet_loss_pct, cpu_budget)
    elapsed_ms = int((time.time() - start) * 1000)

    for name, r in results.items():
        print(f"dependency={name} status={r['status']} reason={r['reason']}")

    http_code, overall = aggregate_health(results)
    print(f"health_response http={http_code} overall={overall} elapsed_ms={elapsed_ms}")

    blocked_indefinitely = elapsed_ms > (HEALTH_CHECK_TIMEOUT_S * 1000 * 1.5)
    cascade_triggered = http_code == 503 and overall == STATUS_UNAVAILABLE

    probe_pass = not blocked_indefinitely
    print(f"probe_result={'PASS' if probe_pass else 'FAIL'}")
    print(f"blocked_indefinitely={blocked_indefinitely}")
    print(f"cascade_triggered={cascade_triggered}")
    print(f"check_elapsed_ms={elapsed_ms}")
    return 0 if probe_pass else 1


if __name__ == "__main__":
    sys.exit(main())
