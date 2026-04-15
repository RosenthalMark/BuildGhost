#!/usr/bin/env python3
"""Interpret SPOOLER runtime contract and execute payload command with app-level fault injection."""

import os
import random
import shlex
import subprocess
import sys
import time
from dataclasses import dataclass
from urllib import error, request


def env_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def env_int(name: str, default: int, minimum: int = 0, maximum: int = 10_000) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        parsed = int(raw)
    except ValueError:
        return default
    return max(minimum, min(maximum, parsed))


def bounded_probability(value: float) -> float:
    return max(0.0, min(value, 0.98))


@dataclass
class RuntimeContract:
    network_profile: str
    latency_ms: int
    packet_loss_pct: int
    cpu_budget: str
    memory_budget: str
    db_engine: str
    chaos_mode: bool
    vulnerable_dom: bool
    sql_injection: bool
    auth_bypass: bool
    third_party_outage: bool
    third_party_endpoint: str
    strict_rate_limit: bool

    @classmethod
    def from_env(cls) -> "RuntimeContract":
        return cls(
            network_profile=os.getenv("NETWORK_PROFILE", "unknown").strip().lower(),
            latency_ms=env_int("LATENCY_MS", 120, minimum=0, maximum=60_000),
            packet_loss_pct=env_int("PACKET_LOSS_PCT", 0, minimum=0, maximum=100),
            cpu_budget=os.getenv("CPU_BUDGET", "2"),
            memory_budget=os.getenv("MEMORY_BUDGET", "1g"),
            db_engine=os.getenv("DB_ENGINE", "sqlite"),
            chaos_mode=env_bool("CHAOS_MODE"),
            vulnerable_dom=env_bool("VULNERABLE_DOM"),
            sql_injection=env_bool("SQL_INJECTION"),
            auth_bypass=env_bool("AUTH_BYPASS"),
            third_party_outage=env_bool("THIRD_PARTY_OUTAGE"),
            third_party_endpoint=os.getenv("THIRD_PARTY_ENDPOINT", "http://third-party-sim:18080/third-party"),
            strict_rate_limit=env_bool("STRICT_RATE_LIMIT"),
        )


def to_bool_text(value: bool) -> str:
    return "true" if value else "false"


def profile_latency_bonus(profile: str) -> int:
    if profile == "edge_failure":
        return 220
    if profile == "3g_degraded":
        return 90
    if profile == "wifi_office":
        return 20
    return 0


def compute_failure_probability(contract: RuntimeContract) -> float:
    probability = contract.packet_loss_pct / 100.0
    if contract.network_profile == "edge_failure":
        probability += 0.18
    elif contract.network_profile == "3g_degraded":
        probability += 0.08
    if contract.chaos_mode:
        probability += 0.15
    if contract.auth_bypass:
        probability += 0.10
    if contract.sql_injection:
        probability += 0.05
    if contract.vulnerable_dom:
        probability += 0.05
    if contract.strict_rate_limit:
        probability += 0.05
    return bounded_probability(probability)


def compute_max_attempts(contract: RuntimeContract) -> int:
    attempts = 1
    if contract.packet_loss_pct > 0 or contract.third_party_outage or contract.chaos_mode:
        attempts = 3
    if contract.strict_rate_limit or contract.packet_loss_pct >= 20:
        attempts += 1
    return min(attempts, 5)


def compute_delay_seconds(contract: RuntimeContract, attempt: int) -> tuple[float, int]:
    jitter_span = 20 + (35 if contract.chaos_mode else 0)
    delay_ms = contract.latency_ms + profile_latency_bonus(contract.network_profile)
    if contract.strict_rate_limit and attempt > 1:
        delay_ms += 40 * attempt
    delay_ms += random.randint(-jitter_span, jitter_span)
    delay_ms = max(0, delay_ms)
    return min(delay_ms / 1000.0, 5.0), delay_ms


def sleep_backoff(attempt: int, chaos_mode: bool) -> None:
    seconds = 0.20 * (2 ** (attempt - 1))
    if chaos_mode:
        seconds *= 1.4
    seconds = min(seconds, 4.0)
    print(f"SPOOLER_RUNTIME_BACKOFF_SECONDS:{seconds:.2f}")
    time.sleep(seconds)


def log_contract(contract: RuntimeContract) -> None:
    print("SPOOLER_RUNTIME_CONTRACT_START")
    print(f"SPOOLER_RUNTIME_NETWORK_PROFILE:{contract.network_profile}")
    print(f"SPOOLER_RUNTIME_LATENCY_MS:{contract.latency_ms}")
    print(f"SPOOLER_RUNTIME_PACKET_LOSS_PCT:{contract.packet_loss_pct}")
    print(f"SPOOLER_RUNTIME_CPU_BUDGET:{contract.cpu_budget}")
    print(f"SPOOLER_RUNTIME_MEMORY_BUDGET:{contract.memory_budget}")
    print(f"SPOOLER_RUNTIME_DB_ENGINE:{contract.db_engine}")
    print(f"SPOOLER_RUNTIME_CHAOS_MODE:{to_bool_text(contract.chaos_mode)}")
    print(f"SPOOLER_RUNTIME_VULNERABLE_DOM:{to_bool_text(contract.vulnerable_dom)}")
    print(f"SPOOLER_RUNTIME_SQL_INJECTION:{to_bool_text(contract.sql_injection)}")
    print(f"SPOOLER_RUNTIME_AUTH_BYPASS:{to_bool_text(contract.auth_bypass)}")
    print(f"SPOOLER_RUNTIME_THIRD_PARTY_OUTAGE:{to_bool_text(contract.third_party_outage)}")
    print(f"SPOOLER_RUNTIME_THIRD_PARTY_ENDPOINT:{contract.third_party_endpoint}")
    print(f"SPOOLER_RUNTIME_STRICT_RATE_LIMIT:{to_bool_text(contract.strict_rate_limit)}")
    print("SPOOLER_RUNTIME_CONTRACT_END")


def merge_command_parts(parts: list[str]) -> str:
    if len(parts) == 1:
        return parts[0]
    return " ".join(shlex.quote(part) for part in parts)


def should_rate_limit(contract: RuntimeContract, attempt: int) -> bool:
    if not contract.strict_rate_limit:
        return False
    threshold = 0.20 + (0.15 if contract.chaos_mode else 0.0)
    if attempt == 1:
        threshold += 0.10
    return random.random() < bounded_probability(threshold)


def probe_third_party_endpoint(contract: RuntimeContract, attempt: int) -> tuple[bool, str]:
    timeout_seconds = min(3.0 + (contract.latency_ms / 1000.0), 8.0)
    probe_url = f"{contract.third_party_endpoint}?attempt={attempt}"
    req = request.Request(probe_url, headers={"User-Agent": "spooler-runtime-controller/1.0"})
    try:
        with request.urlopen(req, timeout=timeout_seconds) as response:
            body = response.read(160).decode("utf-8", errors="replace")
            status_code = response.getcode()
    except error.HTTPError as exc:
        body = exc.read(160).decode("utf-8", errors="replace")
        return False, f"http_status={exc.code} body={body}"
    except error.URLError as exc:
        return False, f"url_error={exc.reason}"
    except TimeoutError:
        return False, "timeout"
    except Exception as exc:  # defensive fallback to keep attempts moving
        return False, f"unexpected_error={exc}"

    if 200 <= status_code < 300:
        return True, f"http_status={status_code} body={body}"
    return False, f"http_status={status_code} body={body}"


def run_with_contract(contract: RuntimeContract, command: str) -> int:
    failure_probability = compute_failure_probability(contract)
    max_attempts = compute_max_attempts(contract)
    print(f"SPOOLER_RUNTIME_FAILURE_PROBABILITY:{failure_probability:.2f}")
    print(f"SPOOLER_RUNTIME_MAX_ATTEMPTS:{max_attempts}")

    last_exit_code = 1
    for attempt in range(1, max_attempts + 1):
        print(f"SPOOLER_RUNTIME_ATTEMPT:{attempt}/{max_attempts}")
        delay_seconds, delay_ms = compute_delay_seconds(contract, attempt)
        print(f"SPOOLER_RUNTIME_DELAY_MS:{delay_ms}")
        if delay_seconds > 0:
            time.sleep(delay_seconds)

        if should_rate_limit(contract, attempt):
            print("SPOOLER_RUNTIME_FAULT:rate_limited")
            if attempt < max_attempts:
                sleep_backoff(attempt, contract.chaos_mode)
                continue
            return 42

        if contract.third_party_outage:
            upstream_ok, detail = probe_third_party_endpoint(contract, attempt)
            if upstream_ok:
                print(f"SPOOLER_RUNTIME_UPSTREAM_PROBE:ok {detail}")
            else:
                print(f"SPOOLER_RUNTIME_FAULT:third_party_outage {detail}")
                if attempt < max_attempts:
                    sleep_backoff(attempt, contract.chaos_mode)
                    continue
                return 70

        roll = random.random()
        print(f"SPOOLER_RUNTIME_ROLL:{roll:.2f}")
        if roll < failure_probability:
            print("SPOOLER_RUNTIME_FAULT:packet_drop_simulated")
            if attempt < max_attempts:
                sleep_backoff(attempt, contract.chaos_mode)
                continue
            return 75

        print("SPOOLER_RUNTIME_EXECUTING_COMMAND")
        result = subprocess.run(command, shell=True, check=False)
        last_exit_code = result.returncode
        print(f"SPOOLER_RUNTIME_COMMAND_EXIT_CODE:{last_exit_code}")
        if last_exit_code == 0:
            return 0
        if attempt < max_attempts:
            sleep_backoff(attempt, contract.chaos_mode)

    return last_exit_code


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print("SPOOLER_RUNTIME_ERROR:missing_command")
        return 2

    command = merge_command_parts(argv[1:]).strip()
    if not command:
        print("SPOOLER_RUNTIME_ERROR:empty_command")
        return 2

    contract = RuntimeContract.from_env()
    log_contract(contract)
    return run_with_contract(contract, command)


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(line_buffering=True)
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(line_buffering=True)
    sys.exit(main(sys.argv))
