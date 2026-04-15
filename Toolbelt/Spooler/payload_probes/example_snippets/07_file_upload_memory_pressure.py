#!/usr/bin/env python3
"""
SPOOLER Example: File Upload Handler Under Memory Pressure
----------------------------------------------------------
Scenario fit: Memory Pressure Leak Hunt, CPU Spike Recovery, Full Chaos Fire Drill

Simulates a file upload pipeline that buffers chunks in memory, scans them for
malicious signatures (AV/malware check), and writes to a staging area. Under
memory pressure the buffer pool can exhaust, causing partial uploads to land
without being fully scanned. This tests whether your upload handler correctly
rejects or quarantines files when the scan step cannot complete.
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


MALICIOUS_SIGNATURES = [
    b"\x4d\x5a\x90\x00",
    b"EICAR-STANDARD-ANTIVIRUS-TEST",
    b"eval(base64_decode",
    b"<script>document.cookie",
]

CHUNK_SIZE_BYTES = 64 * 1024


class MemoryPressureSimulator:
    def __init__(self, memory_budget_mb):
        self.budget_mb = memory_budget_mb
        self.allocated_mb = 0
        self.oom_triggered = False

    def allocate(self, size_mb):
        if self.allocated_mb + size_mb > self.budget_mb * 0.85:
            self.oom_triggered = True
            raise MemoryError(f"OOM: allocated={self.allocated_mb:.1f}MB budget={self.budget_mb}MB")
        self.allocated_mb += size_mb

    def free(self, size_mb):
        self.allocated_mb = max(0, self.allocated_mb - size_mb)


def generate_file_chunks(filename, is_malicious=False, num_chunks=4):
    chunks = []
    for i in range(num_chunks):
        chunk = os.urandom(512)
        if is_malicious and i == num_chunks - 1:
            sig = random.choice(MALICIOUS_SIGNATURES)
            chunk = sig + chunk[len(sig):]
        chunks.append(chunk)
    return chunks


def scan_chunk(chunk, latency_ms):
    time.sleep(max(0, latency_ms + random.randint(-5, 15)) / 1000.0)
    for sig in MALICIOUS_SIGNATURES:
        if sig in chunk:
            return False, sig.decode(errors="replace")[:20]
    return True, None


def process_upload(filename, chunks, mem_sim, latency_ms, chaos_mode):
    print(f"upload_start filename={filename} chunks={len(chunks)}")
    chunk_size_mb = CHUNK_SIZE_BYTES / (1024 * 1024)

    scanned = 0
    scan_skipped = False

    for i, chunk in enumerate(chunks):
        if chaos_mode and random.random() < 0.05:
            print(f"upload chunk={i} chaos_corruption=true")
            chunk = os.urandom(len(chunk))

        try:
            mem_sim.allocate(chunk_size_mb)
        except MemoryError as exc:
            print(f"upload chunk={i} oom_during_buffer error={exc}")
            scan_skipped = True
            return "oom_incomplete", None

        clean, matched_sig = scan_chunk(chunk, latency_ms)
        if not clean:
            mem_sim.free(chunk_size_mb)
            print(f"upload chunk={i} malicious_detected sig='{matched_sig}'")
            return "quarantined", matched_sig

        scanned += 1
        mem_sim.free(chunk_size_mb)
        print(f"upload chunk={i} scan=clean")

    if scan_skipped:
        return "oom_incomplete", None

    return "accepted", None


def main():
    latency_ms = env_int("LATENCY_MS", 60)
    chaos_mode = env_bool("CHAOS_MODE")
    memory_budget = os.getenv("MEMORY_BUDGET", "1g")

    try:
        mem_mb = float(memory_budget.rstrip("g")) * 1024 if memory_budget.endswith("g") else float(memory_budget.rstrip("m"))
    except (ValueError, AttributeError):
        mem_mb = 1024.0

    print("FILE UPLOAD MEMORY PRESSURE PROBE START")
    print(f"latency_ms={latency_ms}")
    print(f"chaos_mode={chaos_mode}")
    print(f"memory_budget_mb={mem_mb:.0f}")

    mem_sim = MemoryPressureSimulator(mem_mb)

    uploads = [
        ("report.pdf", False, 4),
        ("malware_sample.exe", True, 4),
        ("large_export.csv", False, 8),
        ("invoice.pdf", False, 3),
        ("payload.js", True, 2),
        ("backup.tar.gz", False, 6),
    ]

    results = {"accepted": 0, "quarantined": 0, "oom_incomplete": 0}
    unsafe_accepted = 0

    for filename, is_malicious, num_chunks in uploads:
        chunks = generate_file_chunks(filename, is_malicious, num_chunks)
        outcome, _ = process_upload(filename, chunks, mem_sim, latency_ms, chaos_mode)
        results[outcome] = results.get(outcome, 0) + 1

        if is_malicious and outcome == "accepted":
            unsafe_accepted += 1
            print(f"SECURITY_RISK malicious_file_accepted filename={filename}")

        print(f"upload_result filename={filename} malicious={is_malicious} outcome={outcome}")

    probe_pass = unsafe_accepted == 0
    print(f"probe_result={'PASS' if probe_pass else 'FAIL'}")
    print(f"results={results} unsafe_accepted={unsafe_accepted} oom_triggered={mem_sim.oom_triggered}")
    return 0 if probe_pass else 1


if __name__ == "__main__":
    sys.exit(main())
