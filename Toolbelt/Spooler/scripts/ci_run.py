#!/usr/bin/env python3
"""Minimal noninteractive CI execution mode for SPOOLER scenarios."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
RECIPES_DIR = ROOT / "recipes"
INJECTIONS_DIR = ROOT / "injections"
LOGS_DIR = ROOT / "logs"

INJECTION_EXTENSIONS = {
    "python": ".py",
    "node": ".js",
    "shell": ".sh",
}

FILE_EXTENSION_TO_LANGUAGE = {
    ".py": "python",
    ".js": "node",
    ".mjs": "node",
    ".cjs": "node",
    ".ts": "node",
    ".tsx": "node",
    ".sh": "shell",
    ".bash": "shell",
    ".zsh": "shell",
}

DB_SERVICE_CONFIG = {
    "postgres15": {
        "service_name": "database",
        "image": "postgres:15",
        "port": "5432:5432",
        "env": {
            "POSTGRES_USER": "spooler",
            "POSTGRES_PASSWORD": "spooler",
            "POSTGRES_DB": "targetdb",
        },
    },
    "mysql8": {
        "service_name": "database",
        "image": "mysql:8",
        "port": "3306:3306",
        "env": {
            "MYSQL_ROOT_PASSWORD": "spooler",
            "MYSQL_DATABASE": "targetdb",
        },
    },
    "mongo7": {
        "service_name": "database",
        "image": "mongo:7",
        "port": "27017:27017",
        "env": {},
    },
}


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def sanitize_run_id(run_id: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9_.-]+", "-", run_id.strip())
    cleaned = cleaned.strip("-._")
    return cleaned or "spool-ci"


def bool_text(value: bool) -> str:
    return "true" if value else "false"


def infer_language_from_filename(filename: str) -> str | None:
    return FILE_EXTENSION_TO_LANGUAGE.get(Path(filename).suffix.lower())


def default_target_path_for_language(language: str) -> str:
    if language == "python":
        return "/workspace/injected/main.py"
    if language == "node":
        return "/workspace/injected/main.js"
    return "/workspace/injected/main.sh"


def default_run_command_for_language(language: str) -> str:
    if language == "python":
        return "python /workspace/injected/main.py"
    if language == "node":
        return "node /workspace/injected/main.js"
    return "sh /workspace/injected/main.sh"


def to_yaml_map_lines(data: dict[str, str], indent: int = 6) -> list[str]:
    spaces = " " * indent
    lines: list[str] = []
    for key, value in data.items():
        escaped = str(value).replace('"', '\\"')
        lines.append(f'{spaces}{key}: "{escaped}"')
    return lines


def build_database_service_yaml(db_key: str) -> list[str]:
    if db_key == "sqlite":
        return []
    config = DB_SERVICE_CONFIG[db_key]
    lines = [
        f"  {config['service_name']}:",
        f"    image: {config['image']}",
        "    restart: unless-stopped",
        "    ports:",
        f"      - \"{config['port']}\"",
    ]
    if config["env"]:
        lines.append("    environment:")
        lines.extend(to_yaml_map_lines(config["env"], indent=6))
    return lines


def build_third_party_sim_service_yaml(run_id: str, outage_enabled: str, chaos_mode: str) -> list[str]:
    sim_script = str((ROOT / "docker" / "third-party-sim" / "server.py").resolve()).replace("\\", "\\\\").replace('"', '\\"')
    return [
        "  third-party-sim:",
        "    image: python:3.12-slim",
        f"    container_name: {run_id}-third-party-sim",
        "    restart: unless-stopped",
        "    environment:",
        f'      OUTAGE_ENABLED: "{outage_enabled}"',
        f'      CHAOS_MODE: "{chaos_mode}"',
        '      SIM_PORT: "18080"',
        "    volumes:",
        "      - type: bind",
        f'        source: "{sim_script}"',
        "        target: /opt/spooler/third-party/server.py",
        "        read_only: true",
        "    command: >",
        "      python /opt/spooler/third-party/server.py",
    ]


def build_compose_yaml(run_id: str, env_vars: dict[str, str], injection_source: Path) -> str:
    source = str(injection_source.resolve()).replace("\\", "\\\\").replace('"', '\\"')
    lines = [
        'version: "3.9"',
        "services:",
        "  spool-target:",
        "    image: spooler/target-agent:latest",
        f"    container_name: {run_id}",
        "    restart: unless-stopped",
        "    depends_on:",
        "      - third-party-sim",
        "    cap_add:",
        "      - NET_ADMIN",
        f'    cpus: "{env_vars["CPU_BUDGET"]}"',
        f'    mem_limit: "{env_vars["MEMORY_BUDGET"]}"',
        "    ports:",
        '      - "8080:80"',
        "    environment:",
    ]
    lines.extend(to_yaml_map_lines(env_vars, indent=6))
    lines.extend(
        [
            "    volumes:",
            "      - type: bind",
            f'        source: "{source}"',
            "        target: /opt/spooler/injection",
            "    command: >",
            "      sh -c \"if [ -f /opt/spooler/injection/bootstrap.sh ]; then sh /opt/spooler/injection/bootstrap.sh; fi; tail -f /dev/null\"",
        ]
    )
    lines.extend(
        build_third_party_sim_service_yaml(
            run_id=run_id,
            outage_enabled=env_vars["THIRD_PARTY_OUTAGE"],
            chaos_mode=env_vars["CHAOS_MODE"],
        )
    )
    lines.extend(build_database_service_yaml(env_vars["DB_ENGINE"]))
    return "\n".join(lines) + "\n"


def write_injection_files(run_id: str, payload_text: str, language: str) -> Path:
    extension = INJECTION_EXTENSIONS[language]
    injection_dir = INJECTIONS_DIR / run_id
    injection_dir.mkdir(parents=True, exist_ok=True)

    payload_path = injection_dir / f"payload{extension}"
    payload_path.write_text(payload_text.strip() + "\n", encoding="utf-8")

    bootstrap = (
        "#!/usr/bin/env sh\n"
        "set -eu\n"
        "TARGET_PATH=\"${SPOOLER_TARGET_PATH:-/workspace/injected/main" + extension + "}\"\n"
        "mkdir -p \"$(dirname \"$TARGET_PATH\")\"\n"
        f"cp /opt/spooler/injection/{payload_path.name} \"$TARGET_PATH\"\n"
        "chmod +x \"$TARGET_PATH\" || true\n"
        "if [ -x /opt/spooler/runtime/apply_netem.sh ]; then\n"
        "  /opt/spooler/runtime/apply_netem.sh\n"
        "fi\n"
        "if [ -n \"${SPOOLER_RUN_COMMAND:-}\" ]; then\n"
        "  echo \"SPOOLER_RUN_COMMAND=$SPOOLER_RUN_COMMAND\"\n"
        "  set +e\n"
        "  if [ -x /opt/spooler/runtime/runtime_controller.py ]; then\n"
        "    python3 /opt/spooler/runtime/runtime_controller.py \"$SPOOLER_RUN_COMMAND\"\n"
        "  else\n"
        "    sh -lc \"$SPOOLER_RUN_COMMAND\"\n"
        "  fi\n"
        "  RUN_EXIT_CODE=$?\n"
        "  set -e\n"
        "  echo \"SPOOLER_RUN_COMMAND_EXIT_CODE:$RUN_EXIT_CODE\"\n"
        "  exit \"$RUN_EXIT_CODE\"\n"
        "fi\n"
        "echo \"SPOOLER_RUN_COMMAND_SKIPPED\"\n"
    )
    bootstrap_path = injection_dir / "bootstrap.sh"
    bootstrap_path.write_text(bootstrap, encoding="utf-8")
    bootstrap_path.chmod(0o755)
    return injection_dir


def run_cmd(cmd: list[str], timeout: int | None = None) -> tuple[int, str]:
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=False, timeout=timeout)
    except FileNotFoundError:
        return 127, f"command not found: {cmd[0]}"
    except subprocess.TimeoutExpired as exc:
        stdout = exc.stdout or ""
        stderr = exc.stderr or ""
        out = (stdout + "\n" + stderr).strip()
        return 124, out or f"command timed out after {timeout}s"
    output = (result.stdout + "\n" + result.stderr).strip()
    return result.returncode, output


def parse_last_prefixed_line(log_text: str, prefix: str) -> str | None:
    last: str | None = None
    for line in log_text.splitlines():
        if line.startswith(prefix):
            last = line[len(prefix) :].strip()
    return last


def resolve_path(candidate: str) -> Path:
    path = Path(candidate).expanduser()
    if not path.is_absolute():
        path = (ROOT / path).resolve()
    return path.resolve()


def generate_recipe_from_args(args: argparse.Namespace, run_id: str) -> tuple[Path, bool]:
    payload_path = resolve_path(args.payload)
    if not payload_path.exists() or not payload_path.is_file():
        raise FileNotFoundError(f"payload file not found: {payload_path}")

    payload_text = payload_path.read_text(encoding="utf-8")
    language = args.language or infer_language_from_filename(payload_path.name)
    if language is None:
        raise ValueError(f"could not infer language from extension: {payload_path.name}")
    if language not in INJECTION_EXTENSIONS:
        raise ValueError(f"unsupported language: {language}")

    run_command = args.run_command.strip() if args.run_command else default_run_command_for_language(language)
    target_path = args.target_path.strip() if args.target_path else default_target_path_for_language(language)

    injection_dir = write_injection_files(run_id=run_id, payload_text=payload_text, language=language)
    env_vars = {
        "INTENT": args.intent,
        "NETWORK_PROFILE": args.network_profile,
        "LATENCY_MS": str(args.latency_ms),
        "PACKET_LOSS_PCT": str(args.packet_loss_pct),
        "CPU_BUDGET": args.cpu_budget,
        "MEMORY_BUDGET": args.memory_budget,
        "DB_ENGINE": args.db_engine,
        "THIRD_PARTY_ENDPOINT": "http://third-party-sim:18080/third-party",
        "SPOOLER_TARGET_PATH": target_path,
        "SPOOLER_RUN_COMMAND": run_command,
        "CHAOS_MODE": bool_text(args.chaos_mode),
        "VULNERABLE_DOM": bool_text(args.vulnerable_dom),
        "SQL_INJECTION": bool_text(args.sql_injection),
        "AUTH_BYPASS": bool_text(args.auth_bypass),
        "THIRD_PARTY_OUTAGE": bool_text(args.third_party_outage),
        "STRICT_RATE_LIMIT": bool_text(args.strict_rate_limit),
    }

    recipe_path = RECIPES_DIR / f"{run_id}.yml"
    recipe_path.write_text(build_compose_yaml(run_id, env_vars, injection_dir), encoding="utf-8")
    return recipe_path, True


def write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text((content or "") + ("\n" if content and not content.endswith("\n") else ""), encoding="utf-8")


def collect_execution_artifacts(
    recipe_path: Path,
    run_id: str,
    timeout_seconds: int,
    artifact_dir: Path,
    keep_resources: bool,
) -> tuple[int, Path]:
    artifact_dir.mkdir(parents=True, exist_ok=True)
    compose_up_log = artifact_dir / f"{run_id}.compose-up.log"
    spool_log_path = artifact_dir / f"{run_id}.spool-target.log"
    upstream_log_path = artifact_dir / f"{run_id}.third-party-sim.log"
    compose_down_log = artifact_dir / f"{run_id}.compose-down.log"
    result_path = artifact_dir / f"{run_id}.result.json"

    started_at = utc_now_iso()
    compose_up_rc, compose_up_out = run_cmd(
        ["docker", "compose", "-f", str(recipe_path), "up", "-d", "--remove-orphans"],
        timeout=180,
    )
    write_text(compose_up_log, compose_up_out)

    status = "compose_failed"
    run_exit_code: int | None = None
    run_command: str | None = None
    spool_container_id = ""
    spool_logs = ""
    upstream_logs = ""
    inspect_output = ""

    if compose_up_rc == 0:
        status = "running"
        ps_rc, ps_out = run_cmd(["docker", "compose", "-f", str(recipe_path), "ps", "-q", "spool-target"], timeout=30)
        if ps_rc == 0:
            spool_container_id = ps_out.strip()
        if spool_container_id:
            deadline = time.time() + max(timeout_seconds, 10)
            while time.time() < deadline:
                log_rc, log_out = run_cmd(["docker", "logs", spool_container_id], timeout=30)
                if log_rc == 0:
                    spool_logs = log_out
                    run_command = parse_last_prefixed_line(spool_logs, "SPOOLER_RUN_COMMAND=")
                    marker = parse_last_prefixed_line(spool_logs, "SPOOLER_RUN_COMMAND_EXIT_CODE:")
                    if marker is not None:
                        try:
                            run_exit_code = int(marker)
                        except ValueError:
                            run_exit_code = None
                        status = "success" if run_exit_code == 0 else "failure"
                        break
                    if "SPOOLER_RUN_COMMAND_SKIPPED" in spool_logs:
                        run_exit_code = 0
                        status = "skipped"
                        break
                time.sleep(2)

            if status == "running":
                status = "timeout"
                log_rc, log_out = run_cmd(["docker", "logs", spool_container_id], timeout=30)
                if log_rc == 0:
                    spool_logs = log_out

            inspect_rc, inspect_out = run_cmd(
                [
                    "docker",
                    "inspect",
                    "--format",
                    "status={{.State.Status}} running={{.State.Running}} exit_code={{.State.ExitCode}}",
                    spool_container_id,
                ],
                timeout=30,
            )
            if inspect_rc == 0:
                inspect_output = inspect_out

        _, up_log = run_cmd(["docker", "logs", f"{run_id}-third-party-sim"], timeout=30)
        upstream_logs = up_log

    write_text(spool_log_path, spool_logs)
    write_text(upstream_log_path, upstream_logs)

    compose_down_rc = 0
    compose_down_out = ""
    if not keep_resources:
        compose_down_rc, compose_down_out = run_cmd(
            ["docker", "compose", "-f", str(recipe_path), "down", "-v"],
            timeout=120,
        )
        write_text(compose_down_log, compose_down_out)

    finished_at = utc_now_iso()
    result = {
        "run_id": run_id,
        "recipe_path": str(recipe_path),
        "started_at_utc": started_at,
        "finished_at_utc": finished_at,
        "status": status,
        "run_command": run_command or "",
        "run_exit_code": run_exit_code,
        "spool_target_container_id": spool_container_id,
        "spool_target_state": inspect_output,
        "compose_up_return_code": compose_up_rc,
        "compose_down_return_code": compose_down_rc,
        "artifacts": {
            "result_json": str(result_path),
            "compose_up_log": str(compose_up_log),
            "compose_down_log": str(compose_down_log),
            "spool_target_log": str(spool_log_path),
            "third_party_sim_log": str(upstream_log_path),
        },
    }
    result_path.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    if status in {"success", "skipped"}:
        return 0, result_path
    return 1, result_path


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run SPOOLER scenario in noninteractive CI mode.")
    parser.add_argument("--run-id", default="spool-ci", help="Deterministic run id for recipe/container/artifacts.")
    parser.add_argument("--recipe", help="Existing compose recipe path to execute. If omitted, a recipe is generated.")
    parser.add_argument("--payload", default="payload_probes/templates/python_retry_probe.py", help="Payload file path for generated runs.")
    parser.add_argument("--language", choices=["python", "node", "shell"], help="Payload language override for generated runs.")
    parser.add_argument("--intent", default="ci_noninteractive_run", help="Intent string for generated runs.")
    parser.add_argument("--network-profile", default="3g_degraded")
    parser.add_argument("--latency-ms", type=int, default=180)
    parser.add_argument("--packet-loss-pct", type=int, default=8)
    parser.add_argument("--cpu-budget", default="2")
    parser.add_argument("--memory-budget", default="1g")
    parser.add_argument("--db-engine", choices=["postgres15", "mysql8", "mongo7", "sqlite"], default="sqlite")
    parser.add_argument("--target-path", default="")
    parser.add_argument("--run-command", default="")
    parser.add_argument("--chaos-mode", action="store_true", default=False)
    parser.add_argument("--third-party-outage", action="store_true", default=False)
    parser.add_argument("--auth-bypass", action="store_true", default=False)
    parser.add_argument("--sql-injection", action="store_true", default=False)
    parser.add_argument("--vulnerable-dom", action="store_true", default=False)
    parser.add_argument("--strict-rate-limit", dest="strict_rate_limit", action="store_true", default=True)
    parser.add_argument("--no-strict-rate-limit", dest="strict_rate_limit", action="store_false")
    parser.add_argument("--timeout-seconds", type=int, default=180)
    parser.add_argument("--artifact-dir", default="logs/ci")
    parser.add_argument("--keep-resources", action="store_true", default=False)
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    run_id = sanitize_run_id(args.run_id)
    artifact_dir = resolve_path(args.artifact_dir)

    if args.recipe:
        recipe_path = resolve_path(args.recipe)
        if not recipe_path.exists():
            print(f"[spooler-ci] recipe not found: {recipe_path}", file=sys.stderr)
            return 2
        if run_id == "spool-ci":
            run_id = sanitize_run_id(recipe_path.stem)
    else:
        try:
            recipe_path, _ = generate_recipe_from_args(args, run_id=run_id)
        except Exception as exc:
            print(f"[spooler-ci] failed to generate recipe: {exc}", file=sys.stderr)
            return 2

    exit_code, result_path = collect_execution_artifacts(
        recipe_path=recipe_path,
        run_id=run_id,
        timeout_seconds=args.timeout_seconds,
        artifact_dir=artifact_dir,
        keep_resources=args.keep_resources,
    )
    print(f"[spooler-ci] result artifact: {result_path}")
    return exit_code


if __name__ == "__main__":
    sys.exit(main())
