#!/usr/bin/env python3
"""Simple upstream simulator for SPOOLER outage scenarios."""

import json
import os
import random
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


def env_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def resolve_mode(outage_enabled: bool, chaos_mode: bool) -> str:
    # Keep activation tied to existing boolean controls.
    if not outage_enabled:
        return "healthy"
    if chaos_mode:
        return "intermittent"
    return "hard_outage"


OUTAGE_ENABLED = env_bool("OUTAGE_ENABLED")
CHAOS_MODE = env_bool("CHAOS_MODE")
SIM_PORT = env_int("SIM_PORT", 18080)
MODE = resolve_mode(OUTAGE_ENABLED, CHAOS_MODE)


class Handler(BaseHTTPRequestHandler):
    server_version = "SPOOLERThirdPartySim/1.0"

    def _send_json(self, code: int, payload: dict[str, object]) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _simulate_timeout(self, seconds: int = 12) -> None:
        print(f"SPOOLER_UPSTREAM_BEHAVIOR:timeout sleep_seconds={seconds}", flush=True)
        time.sleep(seconds)
        # If the client times out and disconnects, this write may fail; ignore.
        try:
            self._send_json(504, {"error": "upstream_timeout", "mode": MODE})
        except BrokenPipeError:
            pass
        except ConnectionResetError:
            pass

    def _simulate_blackhole(self, seconds: int = 15) -> None:
        print(f"SPOOLER_UPSTREAM_BEHAVIOR:blackhole sleep_seconds={seconds}", flush=True)
        time.sleep(seconds)
        self.close_connection = True

    def _serve_upstream(self) -> None:
        if MODE == "healthy":
            self._send_json(200, {"status": "ok", "mode": MODE})
            return

        if MODE == "hard_outage":
            # Hard outage prefers timeout behavior.
            self._simulate_timeout()
            return

        roll = random.random()
        if roll < 0.40:
            print("SPOOLER_UPSTREAM_BEHAVIOR:http_500", flush=True)
            self._send_json(500, {"error": "simulated_internal_error", "mode": MODE})
            return
        if roll < 0.70:
            self._simulate_timeout()
            return
        if roll < 0.90:
            self._simulate_blackhole()
            return

        self._send_json(200, {"status": "ok", "mode": MODE, "behavior": "intermittent_success"})

    def do_GET(self) -> None:
        if self.path.startswith("/health"):
            self._send_json(200, {"status": "ready", "mode": MODE})
            return
        if self.path.startswith("/third-party"):
            self._serve_upstream()
            return
        self._send_json(404, {"error": "not_found", "path": self.path, "mode": MODE})

    def log_message(self, fmt: str, *args: object) -> None:
        print(f"SPOOLER_UPSTREAM_HTTP:{self.address_string()} {fmt % args}", flush=True)


def main() -> None:
    server = ThreadingHTTPServer(("0.0.0.0", SIM_PORT), Handler)
    print(
        f"SPOOLER_UPSTREAM_SIM_START mode={MODE} outage_enabled={str(OUTAGE_ENABLED).lower()} "
        f"chaos_mode={str(CHAOS_MODE).lower()} port={SIM_PORT}",
        flush=True,
    )
    server.serve_forever()


if __name__ == "__main__":
    main()
