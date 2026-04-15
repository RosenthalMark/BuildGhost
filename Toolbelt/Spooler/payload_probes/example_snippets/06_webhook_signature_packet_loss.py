#!/usr/bin/env python3
"""
SPOOLER Example: Webhook Signature Verifier Under Packet Loss
-------------------------------------------------------------
Scenario fit: Packet Loss Retry Trap, Third-Party Timeout Cascade

Simulates a webhook ingestion endpoint that must verify HMAC signatures on
inbound payloads before processing. Packet loss causes partial or replayed
delivery. This probe tests that replayed payloads with duplicate event IDs are
idempotently rejected, that tampered payloads fail signature checks, and that
the endpoint does not silently accept events when the verification call itself
times out or drops.
"""

import hashlib
import hmac
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


WEBHOOK_SECRET = b"spooler-test-secret-key"
SEEN_EVENT_IDS = set()


def compute_signature(payload_bytes):
    return hmac.new(WEBHOOK_SECRET, payload_bytes, hashlib.sha256).hexdigest()


def make_event(event_id, event_type="order.created", tampered=False, replayed=False):
    body = f'{{"event_id":"{event_id}","type":"{event_type}","ts":{int(time.time())}}}'
    payload_bytes = body.encode()
    sig = compute_signature(payload_bytes)
    if tampered:
        sig = sig[:32] + "0" * 32
    return {
        "event_id": event_id,
        "body": body,
        "signature": sig,
        "replayed": replayed,
    }


def verify_and_process(event, latency_ms, packet_loss_pct, chaos_mode):
    jitter = random.randint(-10, 30)
    effective_latency = max(0, latency_ms + jitter)
    time.sleep(effective_latency / 1000.0)

    loss_roll = random.random()
    if loss_roll < (packet_loss_pct / 100.0):
        return "dropped", "packet_loss"

    if chaos_mode and random.random() < 0.1:
        return "dropped", "chaos_drop"

    if event["event_id"] in SEEN_EVENT_IDS:
        return "rejected", "duplicate_event_id"

    payload_bytes = event["body"].encode()
    expected_sig = compute_signature(payload_bytes)
    if not hmac.compare_digest(event["signature"], expected_sig):
        return "rejected", "signature_mismatch"

    SEEN_EVENT_IDS.add(event["event_id"])
    return "accepted", "ok"


def main():
    latency_ms = env_int("LATENCY_MS", 80)
    packet_loss_pct = env_int("PACKET_LOSS_PCT", 0)
    chaos_mode = env_bool("CHAOS_MODE")
    third_party_outage = env_bool("THIRD_PARTY_OUTAGE")

    print("WEBHOOK SIGNATURE PACKET LOSS PROBE START")
    print(f"latency_ms={latency_ms}")
    print(f"packet_loss_pct={packet_loss_pct}")
    print(f"chaos_mode={chaos_mode}")
    print(f"third_party_outage={third_party_outage}")

    if third_party_outage:
        packet_loss_pct = min(packet_loss_pct + 25, 90)
        print(f"adjusted_packet_loss_pct={packet_loss_pct}")

    events = []
    for i in range(1, 9):
        events.append(make_event(f"evt_{i:04d}"))

    events.append(make_event("evt_0001", replayed=True))
    events.append(make_event(f"evt_tampered_{random.randint(100,999)}", tampered=True))
    events.append(make_event(f"evt_{random.randint(5,8):04d}", replayed=True))

    random.shuffle(events)

    accepted = rejected = dropped = unsafe_accepted = 0

    for event in events:
        status, reason = verify_and_process(event, latency_ms, packet_loss_pct, chaos_mode)

        is_tampered = "tampered" in event["event_id"]
        is_replay = event["replayed"]

        if status == "accepted" and (is_tampered or is_replay):
            unsafe_accepted += 1
            print(f"event={event['event_id']} status=ACCEPTED SECURITY_RISK=true tampered={is_tampered} replay={is_replay}")
        else:
            print(f"event={event['event_id']} status={status} reason={reason} tampered={is_tampered} replay={is_replay}")

        if status == "accepted":
            accepted += 1
        elif status == "rejected":
            rejected += 1
        else:
            dropped += 1

    probe_pass = unsafe_accepted == 0
    print(f"probe_result={'PASS' if probe_pass else 'FAIL'}")
    print(f"accepted={accepted} rejected={rejected} dropped={dropped} unsafe_accepted={unsafe_accepted}")
    return 0 if probe_pass else 1


if __name__ == "__main__":
    sys.exit(main())
