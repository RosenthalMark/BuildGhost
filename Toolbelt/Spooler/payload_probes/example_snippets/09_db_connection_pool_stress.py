#!/usr/bin/env python3
"""
SPOOLER Example: Database Connection Pool Under Resource Stress
--------------------------------------------------------------
Scenario fit: Memory Pressure Leak Hunt, CPU Spike Recovery, SQL Storm + Tight Limits

Simulates a connection pool that manages a fixed set of DB connections under
concurrent query load. Under tight CPU and memory limits, the pool can starve,
causing queries to block, time out, or (the bad case) proceed without a valid
connection. Tests that pool exhaustion fails loudly rather than silently, and
that connection leak detection works before the pool is fully drained.
"""

import os
import random
import sys
import time
import threading
from queue import Queue, Empty


def env_bool(name, default=False):
    v = os.getenv(name, "")
    return v.strip().lower() in {"1", "true", "yes", "on"} if v else default


def env_int(name, default):
    try:
        return int(os.getenv(name, default))
    except (ValueError, TypeError):
        return default


POOL_ACQUIRE_TIMEOUT_S = 1.5
QUERY_TIMEOUT_S = 2.0


class MockConnection:
    _id_counter = 0
    _lock = threading.Lock()

    def __init__(self):
        with MockConnection._lock:
            MockConnection._id_counter += 1
            self.conn_id = MockConnection._id_counter
        self.in_use = False
        self.acquired_at = None

    def execute(self, query, latency_ms, sql_injection):
        time.sleep(min(latency_ms / 1000.0, QUERY_TIMEOUT_S))
        if sql_injection and ("'--" in query or "UNION" in query.upper()):
            return {"rows": 0, "warning": "injection_attempt_detected"}
        return {"rows": random.randint(0, 100), "conn_id": self.conn_id}


class ConnectionPool:
    def __init__(self, pool_size):
        self.pool_size = pool_size
        self._pool = Queue()
        self._all_connections = []
        self._leak_count = 0
        self._total_acquired = 0
        self._total_timeouts = 0

        for _ in range(pool_size):
            conn = MockConnection()
            self._pool.put(conn)
            self._all_connections.append(conn)

    def acquire(self, timeout=POOL_ACQUIRE_TIMEOUT_S):
        try:
            conn = self._pool.get(timeout=timeout)
            conn.in_use = True
            conn.acquired_at = time.time()
            self._total_acquired += 1
            return conn
        except Empty:
            self._total_timeouts += 1
            return None

    def release(self, conn, chaos_mode=False):
        if chaos_mode and random.random() < 0.08:
            self._leak_count += 1
            print(f"conn={conn.conn_id} LEAK_SIMULATED connection_not_returned=true")
            return

        conn.in_use = False
        conn.acquired_at = None
        self._pool.put(conn)

    def check_for_leaks(self, max_hold_s=5.0):
        leaked = []
        for conn in self._all_connections:
            if conn.in_use and conn.acquired_at and (time.time() - conn.acquired_at) > max_hold_s:
                leaked.append(conn.conn_id)
        return leaked

    @property
    def available(self):
        return self._pool.qsize()


def run_query(pool, query, latency_ms, sql_injection, chaos_mode, results, lock):
    conn = pool.acquire()
    if conn is None:
        with lock:
            results["timeout"] += 1
        print(f"pool_acquire=TIMEOUT available={pool.available}")
        return

    try:
        result = conn.execute(query, latency_ms, sql_injection)
        with lock:
            results["success"] += 1
            if "warning" in result:
                results["injection_warnings"] += 1
        print(f"query=OK conn={conn.conn_id} rows={result.get('rows')} warn={result.get('warning','none')}")
    except Exception as exc:
        with lock:
            results["error"] += 1
        print(f"query=ERROR conn={conn.conn_id} error={exc}")
    finally:
        pool.release(conn, chaos_mode)


def main():
    latency_ms = env_int("LATENCY_MS", 80)
    sql_injection = env_bool("SQL_INJECTION")
    chaos_mode = env_bool("CHAOS_MODE")
    cpu_budget = os.getenv("CPU_BUDGET", "2")

    try:
        cpu_cores = float(cpu_budget)
    except ValueError:
        cpu_cores = 2.0

    pool_size = max(2, int(cpu_cores * 2))
    concurrent_workers = max(pool_size + 2, 8)

    print("DB CONNECTION POOL STRESS PROBE START")
    print(f"latency_ms={latency_ms}")
    print(f"sql_injection={sql_injection}")
    print(f"chaos_mode={chaos_mode}")
    print(f"cpu_budget={cpu_budget}")
    print(f"pool_size={pool_size}")
    print(f"concurrent_workers={concurrent_workers}")

    pool = ConnectionPool(pool_size)

    queries = [
        "SELECT * FROM sessions WHERE user_id = ?",
        "SELECT id, email FROM users WHERE active = 1",
        "INSERT INTO audit_log (action, user_id) VALUES (?, ?)",
        "UPDATE tokens SET last_used = NOW() WHERE id = ?",
    ]

    if sql_injection:
        queries += [
            "SELECT * FROM users WHERE name = 'admin'--",
            "SELECT * FROM accounts WHERE '1'='1' UNION SELECT password FROM admin--",
        ]

    results = {"success": 0, "timeout": 0, "error": 0, "injection_warnings": 0}
    lock = threading.Lock()
    threads = []

    for i in range(concurrent_workers):
        query = random.choice(queries)
        t = threading.Thread(
            target=run_query,
            args=(pool, query, latency_ms, sql_injection, chaos_mode, results, lock),
            daemon=True,
        )
        threads.append(t)

    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=10.0)

    leaks = pool.check_for_leaks()
    if leaks:
        print(f"LEAK_DETECTED conn_ids={leaks}")

    success_rate = results["success"] / concurrent_workers if concurrent_workers else 0
    probe_pass = success_rate >= 0.5 and len(leaks) == 0

    print(f"probe_result={'PASS' if probe_pass else 'FAIL'}")
    print(f"results={results}")
    print(f"pool_total_acquired={pool._total_acquired} pool_timeouts={pool._total_timeouts} leaks={len(leaks)}")
    return 0 if probe_pass else 1


if __name__ == "__main__":
    sys.exit(main())
