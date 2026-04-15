#!/usr/bin/env python3
"""
SPOOLER Example: Session Cache Invalidation Under Chaos
-------------------------------------------------------
Scenario fit: Auth Chaos Drill, CPU Spike Recovery, Full Chaos Fire Drill

Simulates an in-process session cache layer that stores user sessions and
invalidates stale entries. Chaos mode introduces random eviction, concurrent
write races, and TTL drift. Auth bypass flag models a misconfiguration where
the cache always returns a hit, bypassing actual auth checks. Tests whether
cache-aside patterns hold up under resource pressure without leaking sessions.
"""

import os
import random
import sys
import time
from collections import OrderedDict


def env_bool(name, default=False):
    v = os.getenv(name, "")
    return v.strip().lower() in {"1", "true", "yes", "on"} if v else default


def env_int(name, default):
    try:
        return int(os.getenv(name, default))
    except (ValueError, TypeError):
        return default


SESSION_TTL_MS = 3000
MAX_CACHE_SIZE = 50


class SessionCache:
    def __init__(self, max_size, ttl_ms, auth_bypass, chaos_mode):
        self._store = OrderedDict()
        self.max_size = max_size
        self.ttl_ms = ttl_ms
        self.auth_bypass = auth_bypass
        self.chaos_mode = chaos_mode
        self.hits = 0
        self.misses = 0
        self.evictions = 0
        self.bypass_hits = 0

    def _now_ms(self):
        return int(time.time() * 1000)

    def _is_expired(self, entry):
        if self.chaos_mode:
            drift = random.randint(-500, 500)
            return (self._now_ms() - entry["created_at"] + drift) > self.ttl_ms
        return (self._now_ms() - entry["created_at"]) > self.ttl_ms

    def get(self, session_id):
        if self.auth_bypass:
            self.bypass_hits += 1
            print(f"cache_get session={session_id} result=BYPASS_HIT auth_bypass_active=true SECURITY_RISK=true")
            return {"user": "bypass_user", "roles": ["admin"], "authenticated": True}

        if session_id not in self._store:
            self.misses += 1
            print(f"cache_get session={session_id} result=MISS")
            return None

        entry = self._store[session_id]
        if self._is_expired(entry):
            del self._store[session_id]
            self.misses += 1
            self.evictions += 1
            print(f"cache_get session={session_id} result=EXPIRED evicted=true")
            return None

        if self.chaos_mode and random.random() < 0.1:
            print(f"cache_get session={session_id} result=CHAOS_EVICT")
            del self._store[session_id]
            self.evictions += 1
            return None

        self.hits += 1
        self._store.move_to_end(session_id)
        print(f"cache_get session={session_id} result=HIT user={entry['data'].get('user')}")
        return entry["data"]

    def put(self, session_id, data):
        if len(self._store) >= self.max_size:
            evicted_key, _ = self._store.popitem(last=False)
            self.evictions += 1
            print(f"cache_put lru_evict={evicted_key}")

        self._store[session_id] = {"data": data, "created_at": self._now_ms()}
        print(f"cache_put session={session_id} user={data.get('user')} cache_size={len(self._store)}")

    def invalidate(self, session_id):
        removed = self._store.pop(session_id, None)
        print(f"cache_invalidate session={session_id} found={removed is not None}")


def fetch_from_upstream(latency_ms, third_party_outage):
    time.sleep(max(0, latency_ms + random.randint(-20, 40)) / 1000.0)
    if third_party_outage and random.random() < 0.6:
        raise ConnectionError("upstream_auth_provider_unavailable")
    return {"user": f"user_{random.randint(100, 999)}", "roles": ["read"], "authenticated": True}


def main():
    latency_ms = env_int("LATENCY_MS", 100)
    auth_bypass = env_bool("AUTH_BYPASS")
    chaos_mode = env_bool("CHAOS_MODE")
    third_party_outage = env_bool("THIRD_PARTY_OUTAGE")

    print("SESSION CACHE CHAOS PROBE START")
    print(f"latency_ms={latency_ms}")
    print(f"auth_bypass={auth_bypass}")
    print(f"chaos_mode={chaos_mode}")
    print(f"third_party_outage={third_party_outage}")

    cache = SessionCache(MAX_CACHE_SIZE, SESSION_TTL_MS, auth_bypass, chaos_mode)

    session_ids = [f"sess_{i:04d}" for i in range(1, 21)]
    for sid in session_ids[:10]:
        try:
            data = fetch_from_upstream(latency_ms, third_party_outage)
            cache.put(sid, data)
        except ConnectionError as exc:
            print(f"upstream_fetch_failed session={sid} error={exc}")

    security_risk = False
    upstream_fallback_failures = 0

    for sid in session_ids:
        result = cache.get(sid)
        if result and result.get("authenticated") and auth_bypass:
            security_risk = True

        if result is None:
            try:
                data = fetch_from_upstream(latency_ms, third_party_outage)
                cache.put(sid, data)
            except ConnectionError:
                upstream_fallback_failures += 1
                print(f"fallback_failed session={sid} user_blocked=true")

    for sid in session_ids[:5]:
        cache.invalidate(sid)

    print(f"probe_result={'FAIL' if security_risk else 'PASS'}")
    print(f"hits={cache.hits} misses={cache.misses} evictions={cache.evictions} bypass_hits={cache.bypass_hits}")
    print(f"upstream_fallback_failures={upstream_fallback_failures}")
    print(f"security_risk={security_risk}")
    return 1 if security_risk else 0


if __name__ == "__main__":
    sys.exit(main())
