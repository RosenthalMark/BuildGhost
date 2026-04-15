#!/usr/bin/env python3
"""
SPOOLER Example: SQL Query Builder Under Injection Pressure
-----------------------------------------------------------
Scenario fit: SQL Storm + Tight Limits, Full Chaos Fire Drill

Simulates a query builder that receives user-controlled input and constructs
SQL strings. With SQL Injection Surface enabled in SPOOLER, the environment
signals that unsafe query patterns should be exercised. This probe validates
whether your sanitization layer catches injection attempts before execution
and whether it degrades safely under CPU and memory pressure.
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


SAFE_PATTERNS = [
    "SELECT * FROM users WHERE id = ?",
    "SELECT email FROM accounts WHERE token = ?",
    "INSERT INTO logs (event, ts) VALUES (?, ?)",
    "UPDATE sessions SET active=0 WHERE user_id = ?",
]

INJECTION_PATTERNS = [
    "SELECT * FROM users WHERE name = 'admin'--",
    "SELECT * FROM accounts WHERE '1'='1'",
    "DROP TABLE sessions;--",
    "SELECT * FROM users WHERE id=1 UNION SELECT password FROM admin--",
    "'; EXEC xp_cmdshell('whoami');--",
]


def sanitize(query):
    danger_tokens = ["'", "--", ";", "UNION", "DROP", "EXEC", "xp_", "/*", "*/"]
    for token in danger_tokens:
        if token.lower() in query.lower():
            return False, token
    return True, None


def simulate_query_execution(query, latency_ms, cpu_budget, memory_budget):
    base_time = latency_ms / 1000.0
    cpu_cores = float(cpu_budget) if cpu_budget else 2.0
    mem_gb = float(memory_budget.rstrip("g")) if memory_budget else 1.0

    complexity_factor = 1.0 / max(cpu_cores, 0.5)
    time.sleep(min(base_time * complexity_factor, 2.0))

    if mem_gb < 0.5:
        if random.random() < 0.3:
            return "OOM", None

    return "executed", {"rows": random.randint(0, 500), "ms": int(base_time * 1000)}


def main():
    latency_ms = env_int("LATENCY_MS", 100)
    sql_injection = env_bool("SQL_INJECTION")
    chaos_mode = env_bool("CHAOS_MODE")
    cpu_budget = os.getenv("CPU_BUDGET", "2")
    memory_budget = os.getenv("MEMORY_BUDGET", "1g")

    print("SQL INJECTION SURFACE PROBE START")
    print(f"latency_ms={latency_ms}")
    print(f"sql_injection_surface={sql_injection}")
    print(f"chaos_mode={chaos_mode}")
    print(f"cpu_budget={cpu_budget}")
    print(f"memory_budget={memory_budget}")

    queries = list(SAFE_PATTERNS)
    if sql_injection:
        queries += INJECTION_PATTERNS
        print(f"injection_patterns_added={len(INJECTION_PATTERNS)}")

    if chaos_mode:
        random.shuffle(queries)
        queries = queries[:max(4, len(queries) // 2)]
        print(f"chaos_reduced_query_set={len(queries)}")

    passed = 0
    blocked = 0
    executed_unsafe = 0
    oom_count = 0

    for query in queries:
        is_safe, blocked_token = sanitize(query)
        print(f"query_preview='{query[:40]}...' safe={is_safe}")

        if not is_safe:
            blocked += 1
            print(f"sanitizer=BLOCKED token='{blocked_token}'")
            continue

        effective_latency = max(0, latency_ms + random.randint(-10, 30))
        result, stats = simulate_query_execution(query, effective_latency, cpu_budget, memory_budget)

        if result == "OOM":
            oom_count += 1
            print("query_result=OOM_KILL")
            continue

        passed += 1
        print(f"query_result=EXECUTED rows={stats['rows']} exec_ms={stats['ms']}")

    injection_escaped = executed_unsafe > 0
    probe_pass = not injection_escaped and oom_count == 0
    print(f"probe_result={'PASS' if probe_pass else 'FAIL'}")
    print(f"safe_executed={passed} injection_blocked={blocked} oom={oom_count} injection_escaped={injection_escaped}")
    return 0 if probe_pass else 1


if __name__ == "__main__":
    sys.exit(main())
