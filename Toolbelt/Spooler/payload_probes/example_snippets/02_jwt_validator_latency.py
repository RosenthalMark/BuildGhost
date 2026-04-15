#!/usr/bin/env python3
"""
SPOOLER Example: JWT Token Validator Under Latency
---------------------------------------------------
Scenario fit: Auth Chaos Drill, Slow Mobile + Vulnerable DOM, Edge Failure

Simulates a token validation service that must verify JWTs against an upstream
auth provider. High latency makes token expiry checks race against clock skew.
Auth bypass flag simulates a config error that disables verification entirely.
Tests whether your auth layer degrades gracefully or silently passes bad tokens.
"""

import hashlib
import os
import random
import sys
import time

VALID_ALGORITHM = "HS256"
CLOCK_SKEW_TOLERANCE_MS = 500
TOKEN_EXPIRY_MS = 5000


def env_bool(name, default=False):
    v = os.getenv(name, "")
    return v.strip().lower() in {"1", "true", "yes", "on"} if v else default


def env_int(name, default):
    try:
        return int(os.getenv(name, default))
    except (ValueError, TypeError):
        return default


def generate_mock_token(expired=False, tampered=False, weak_alg=False):
    alg = "none" if weak_alg else VALID_ALGORITHM
    expiry = -1000 if expired else TOKEN_EXPIRY_MS + random.randint(0, 2000)
    payload = f"sub=user-{random.randint(1000,9999)};exp={expiry};alg={alg}"
    sig = hashlib.sha256(payload.encode()).hexdigest()[:16]
    if tampered:
        sig = sig[:8] + "deadbeef"
    return f"{payload};sig={sig}"


def validate_token(token, latency_ms, auth_bypass, vulnerable_dom):
    time.sleep(latency_ms / 1000.0)

    if auth_bypass:
        print("validator_result=BYPASSED reason=auth_bypass_env_flag_set")
        return False, "auth_bypass"

    if not token:
        print("validator_result=REJECTED reason=missing_token")
        return False, "missing_token"

    parts = dict(p.split("=", 1) for p in token.split(";") if "=" in p)

    if parts.get("alg") == "none":
        if vulnerable_dom:
            print("validator_result=ACCEPTED reason=alg_none_accepted_under_vulnerable_config SECURITY_RISK=true")
            return True, "weak_alg_accepted"
        print("validator_result=REJECTED reason=alg_none_not_permitted")
        return False, "alg_none"

    try:
        exp = int(parts.get("exp", -1))
    except ValueError:
        return False, "malformed_expiry"

    if exp < 0:
        print("validator_result=REJECTED reason=token_expired")
        return False, "expired"

    sig = parts.get("sig", "")
    payload_check = ";".join(f"{k}={v}" for k, v in parts.items() if k != "sig")
    expected_sig = hashlib.sha256(payload_check.encode()).hexdigest()[:16]

    if sig != expected_sig:
        print("validator_result=REJECTED reason=signature_mismatch")
        return False, "tampered"

    print(f"validator_result=ACCEPTED sub={parts.get('sub','unknown')}")
    return True, "valid"


def main():
    latency_ms = env_int("LATENCY_MS", 120)
    auth_bypass = env_bool("AUTH_BYPASS")
    vulnerable_dom = env_bool("VULNERABLE_DOM")
    chaos_mode = env_bool("CHAOS_MODE")
    packet_loss_pct = env_int("PACKET_LOSS_PCT", 0)

    print("JWT VALIDATOR LATENCY PROBE START")
    print(f"latency_ms={latency_ms}")
    print(f"auth_bypass={auth_bypass}")
    print(f"vulnerable_dom={vulnerable_dom}")
    print(f"chaos_mode={chaos_mode}")

    scenarios = [
        ("valid_token", generate_mock_token()),
        ("expired_token", generate_mock_token(expired=True)),
        ("tampered_token", generate_mock_token(tampered=True)),
        ("weak_alg_token", generate_mock_token(weak_alg=True)),
        ("missing_token", ""),
    ]

    failures = 0
    security_risks = 0

    for label, token in scenarios:
        if chaos_mode and random.random() < (packet_loss_pct / 100.0):
            print(f"scenario={label} result=DROPPED simulating_network_loss=true")
            failures += 1
            continue

        effective_latency = max(0, latency_ms + random.randint(-30, 60))
        accepted, reason = validate_token(token, effective_latency, auth_bypass, vulnerable_dom)

        expected_accepted = label == "valid_token"
        if auth_bypass:
            expected_accepted = False

        correct = accepted == expected_accepted
        if not correct:
            failures += 1
        if reason in {"weak_alg_accepted", "auth_bypass"}:
            security_risks += 1

        print(f"scenario={label} accepted={accepted} reason={reason} correct={correct}")

    overall = "FAIL" if failures > 0 or security_risks > 0 else "PASS"
    print(f"probe_result={overall}")
    print(f"failures={failures} security_risks={security_risks}")
    return 0 if overall == "PASS" else 1


if __name__ == "__main__":
    sys.exit(main())
