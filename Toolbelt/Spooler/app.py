import base64
import json
import subprocess
from datetime import datetime
from html import escape
from pathlib import Path

import streamlit as st
from spooler_modules import get_fault_modules, get_preset_scenarios

ROOT = Path(__file__).resolve().parent
ASSETS_DIR = ROOT / "assets"
RECIPES_DIR = ROOT / "recipes"
INJECTIONS_DIR = ROOT / "injections"
LOGS_DIR = ROOT / "logs"
RUN_HISTORY_FILE = LOGS_DIR / "run_history.jsonl"
MAX_PERSISTED_OUTPUT_CHARS = 20_000

RECIPES_DIR.mkdir(parents=True, exist_ok=True)
INJECTIONS_DIR.mkdir(parents=True, exist_ok=True)
LOGS_DIR.mkdir(parents=True, exist_ok=True)

NETWORK_OPTIONS = {
    "5G Stable": "5g_stable",
    "WiFi Office": "wifi_office",
    "3G Degraded": "3g_degraded",
    "Edge Failure": "edge_failure",
}

CPU_OPTIONS = {
    "1 vCPU": "1",
    "2 vCPU": "2",
    "4 vCPU": "4",
}

MEMORY_OPTIONS = {
    "512 MB": "512m",
    "1 GB": "1g",
    "2 GB": "2g",
    "4 GB": "4g",
}

DB_OPTIONS = {
    "Postgres 15": "postgres15",
    "MySQL 8": "mysql8",
    "MongoDB 7": "mongo7",
    "SQLite (No DB Container)": "sqlite",
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

SUPPORTED_INGEST_EXTENSIONS = {
    ".py",
    ".js",
    ".ts",
    ".tsx",
    ".sh",
    ".bash",
    ".zsh",
    ".txt",
    ".json",
    ".md",
}

SCENARIO_SCHEMA_NAME = "spooler-scenario"
SCENARIO_SCHEMA_VERSION = 1

PRESET_SCENARIOS = get_preset_scenarios()
FAULT_MODULES = get_fault_modules()
FAULT_STATE_KEYS = tuple(module.key for module in FAULT_MODULES)
FAULT_DEFAULTS = {module.key: module.default_enabled for module in FAULT_MODULES}
FAULT_ENV_VARS = {module.key: module.env_var for module in FAULT_MODULES}

SCENARIO_EXPORT_KEYS = [
    "selected_preset",
    "difficulty_profile",
    "quick_prompt",
    "intent_text",
    "advanced_mode",
    "network_profile_label",
    "latency_ms",
    "packet_loss_pct",
    "cpu_budget_label",
    "memory_budget_label",
    "db_engine_label",
    *FAULT_STATE_KEYS,
    "injection_language",
    "target_path",
    "run_command",
]

PRESET_AI_SECURITY_LENS = {
    "Slow Mobile + Vulnerable DOM": (
        "Tests AI-generated front-end resilience when degraded network and DOM-risk conditions overlap."
    ),
    "Auth Chaos Drill": (
        "Stresses token lifecycle and auth edge cases, a common weak point in generated services."
    ),
    "SQL Storm + Tight Limits": (
        "Simulates injection pressure plus rate limits to expose unsafe query generation and brittle retries."
    ),
    "Third-Party Timeout Cascade": (
        "Checks how generated integrations handle dependency timeouts, fallback logic, and retry storms."
    ),
    "CPU Spike Recovery": (
        "Validates backoff and queue behavior when generated code runs under CPU starvation."
    ),
    "Memory Pressure Leak Hunt": (
        "Surfaces hidden memory leaks and crash paths in generated code under tight RAM constraints."
    ),
    "Packet Loss Retry Trap": (
        "Focuses on retry correctness and idempotency when packets drop and requests duplicate."
    ),
    "Offline-First Failover": (
        "Verifies degraded-mode behavior when generated services lose reliable network access."
    ),
    "No-DB Fallback Path": (
        "Tests fallback correctness when generated code must run without external DB container support."
    ),
    "Full Chaos Fire Drill": (
        "Combines auth, SQL, outage, and loss vectors where generated systems most often break."
    ),
}

DIFFICULTY_PROFILES = {
    "Preset Default": {},
    "Mild": {
        "network_profile_label": "WiFi Office",
        "latency_ms": 90,
        "packet_loss_pct": 0,
        "cpu_budget_label": "4 vCPU",
        "memory_budget_label": "2 GB",
        "chaos_mode": False,
        "third_party_outage": False,
        "strict_rate_limit": False,
    },
    "Balanced": {
        "network_profile_label": "3G Degraded",
        "latency_ms": 280,
        "packet_loss_pct": 3,
        "cpu_budget_label": "2 vCPU",
        "memory_budget_label": "1 GB",
        "chaos_mode": False,
        "third_party_outage": False,
        "strict_rate_limit": True,
    },
    "Hard": {
        "network_profile_label": "Edge Failure",
        "latency_ms": 520,
        "packet_loss_pct": 8,
        "cpu_budget_label": "1 vCPU",
        "memory_budget_label": "512 MB",
        "chaos_mode": True,
        "third_party_outage": True,
        "strict_rate_limit": True,
    },
    "Extreme": {
        "network_profile_label": "Edge Failure",
        "latency_ms": 760,
        "packet_loss_pct": 18,
        "cpu_budget_label": "1 vCPU",
        "memory_budget_label": "512 MB",
        "chaos_mode": True,
        "third_party_outage": True,
        "strict_rate_limit": True,
        "vulnerable_dom": True,
        "sql_injection": True,
        "auth_bypass": True,
    },
}

DIFFICULTY_DETAILS = {
    "Preset Default": "Uses the exact values bundled with the selected preset.",
    "Mild": "Fast network, low loss, and higher resources. Good for baseline validation.",
    "Balanced": "Realistic moderate stress. Good default for day-to-day patch checks.",
    "Hard": "High latency + outages + tighter resources. Surfaces brittle assumptions.",
    "Extreme": "Very hostile conditions plus multiple vulnerability toggles. Break-things mode.",
}

CHALLENGE_LEVEL_HELP = (
    "Preset Default: Use preset values as-is.\n"
    "Mild: Easy environment, baseline confidence.\n"
    "Balanced: Realistic stress profile for routine checks.\n"
    "Hard: High friction conditions with likely failure edges.\n"
    "Extreme: Aggressive chaos + vulnerability pressure test."
)

DEFAULT_STATE = {
    "selected_preset": next(iter(PRESET_SCENARIOS)),
    "difficulty_profile": "Preset Default",
    "advanced_mode": False,
    "show_guides": False,
    "show_guides_toggle": False,
    "ticker_reset_key": 0,
    "quick_prompt": "",
    "preset_initialized": False,
    "intent_text": "",
    "network_profile_label": "3G Degraded",
    "latency_ms": 300,
    "packet_loss_pct": 2,
    "cpu_budget_label": "2 vCPU",
    "memory_budget_label": "1 GB",
    "db_engine_label": "Postgres 15",
    **FAULT_DEFAULTS,
    "injection_language": "python",
    "target_path": "/workspace/injected/main.py",
    "run_command": "",
    "payload_text": "",
    "spin_now": False,
    "payload_file_name": "",
    "last_upload_size": 0,
    "ide_choice": "VS Code",
    "ide_ingest_path": "",
}

MANUAL_SECTIONS = [
    {
        "title": "What SPOOLER Does",
        "overview": "SPOOLER is a scenario packaging workbench for testing code under controlled runtime pressure.",
        "items": [
            "Define a runtime scenario, choose pressure level, and generate reproducible artifacts.",
            "Package both environment settings and injection payload into a single run definition.",
            "Use the same scenario repeatedly for regression checks, patch validation, and handoff review.",
            "Treat each run as a named experiment with clear intent and measurable stress conditions.",
            "Use quick setup for speed, then switch to advanced controls for exact edge-case shaping.",
        ],
        "examples": [
            "Validate auth refresh logic under high latency plus strict rate limiting.",
            "Replay SQL guardrail testing under resource pressure and outage assumptions.",
            "Package a reproducible outage drill for team-wide patch verification.",
        ],
        "action_label": "Start With Presets",
        "action_id": "quick_setup",
    },
    {
        "title": "Preset Scenarios",
        "overview": "Presets are the fastest way to load a complete baseline with coherent defaults.",
        "items": [
            "Preset Scenario loads network profile, resources, risk posture, and payload defaults together.",
            "Use presets when onboarding a run quickly or sharing a known testing pattern.",
            "Preset selection should encode scenario theme first, then challenge level tunes pressure.",
            "Changing preset updates intent context and baseline parameters as a bundle.",
            "After preset load, use advanced controls only for targeted deviations.",
        ],
        "examples": [
            "Use Slow Mobile + Vulnerable DOM to test frontend resilience under weak network conditions.",
            "Use Full Chaos Fire Drill for stress-heavy reliability and fault tolerance checks.",
            "Use No-DB Fallback Path to verify behavior when external DB container is absent.",
        ],
        "action_label": "Try Preset Setup In Tool",
        "action_id": "quick_setup",
    },
    {
        "title": "Challenge Levels",
        "overview": "Challenge Level scales stress intensity on top of the selected preset.",
        "items": [
            "Preset Default keeps bundled preset values unchanged.",
            "Mild lowers friction for baseline confidence checks.",
            "Balanced applies realistic pressure suitable for routine validation.",
            "Hard increases latency, instability, and reduced resources to surface brittle assumptions.",
            "Extreme stacks hostile conditions and additional vulnerability pressure for break-point drills.",
            "Use challenge changes to compare behavior across stress tiers without rebuilding everything.",
        ],
        "examples": [
            "Run the same payload through Mild, Balanced, and Hard to map failure onset.",
            "Use Extreme after a fix to verify no hidden brittle dependency remains.",
            "Keep preset constant while changing challenge for apples-to-apples stress comparison.",
        ],
        "action_label": "Try Challenge Levels In Tool",
        "action_id": "challenge_levels",
    },
    {
        "title": "Advanced Mode and Core Controls",
        "overview": "Advanced mode exposes full control over environment shape and execution context.",
        "items": [
            "Environment Intent defines the exact objective sentence embedded in run context.",
            "Injection Language sets payload runtime family and default path/command templates.",
            "Network Profile sets baseline transport context; latency and packet loss provide numeric pressure.",
            "CPU Budget and Memory Budget control resource ceilings for reproducible performance stress.",
            "DB Engine selects service flavor, including SQLite mode without a dedicated DB container.",
            "Target Path Inside Container controls where injected payload is copied.",
            "Optional Command After Injection controls post-copy execution behavior.",
        ],
        "examples": [
            "Set Intent to 'validate retry backoff under outage and auth churn' for explicit traceability.",
            "Pair Edge Failure + high packet loss with 1 vCPU to stress timeout logic.",
            "Use SQLite mode and no run command when generating artifact-only packages for review.",
        ],
        "action_label": "Open Advanced Controls In Tool",
        "action_id": "advanced_controls",
    },
    {
        "title": "Security Toggles",
        "overview": "Security and fault toggles mark the threat posture and instability assumptions for the run.",
        "items": [
            "Chaos Mode broadens instability assumptions for aggressive resilience testing.",
            "Vulnerable DOM highlights client-side exploit-risk context.",
            "SQL Injection Surface marks query-handling risk and sanitization pressure.",
            "Auth Bypass Path stresses authn/authz boundary and token flow assumptions.",
            "Third-Party Outage simulates unstable upstream dependencies.",
            "Strict Rate Limiting enforces constrained request pacing assumptions.",
        ],
        "examples": [
            "Combine SQL Injection Surface + Strict Rate Limiting to evaluate guardrails under pressure.",
            "Enable Auth Bypass Path + Third-Party Outage to test fallback trust boundaries.",
            "Use Chaos Mode to force broader resilience behavior before release.",
        ],
        "action_label": "Open Security Controls In Tool",
        "action_id": "security_toggles",
    },
    {
        "title": "Injection Zone and Payload Workflow",
        "overview": "Injection Zone defines what code is injected and how it is prepared for runtime execution.",
        "items": [
            "Upload file to import existing code directly into the payload editor.",
            "Injected Code Payload is the final editable content written to generated artifacts.",
            "Language mapping can auto-adjust target path and command defaults from uploaded extension.",
            "Use payload editor for quick modifications without leaving SPOOLER.",
            "Treat payload as the executable experiment unit tied to your scenario profile.",
        ],
        "examples": [
            "Upload a Python patch candidate, tweak logic inline, then build and run.",
            "Paste a shell validation script for one-off degraded-mode smoke testing.",
            "Use Node payload with explicit command override for custom runtime invocation.",
        ],
        "action_label": "Try Injection Workflow In Tool",
        "action_id": "injection_zone",
    },
    {
        "title": "IDE Connect (Local Read-Only)",
        "overview": "IDE Connect can import a local workspace file path into the payload editor in read-only mode.",
        "items": [
            "Provide a workspace-relative or absolute path inside the current repository.",
            "Imported file contents are copied into Injected Code Payload without modifying source files.",
            "Language mapping still auto-adjusts target path and command defaults when extension is recognized.",
        ],
        "examples": [
            "Import payload_probes/spooler_qa_probe.py directly from workspace path input.",
            "Point to a local patch file generated in your IDE and ingest it without drag-and-drop.",
        ],
    },
    {
        "title": "Build It and Local Spin-Up",
        "overview": "Build It freezes current state into reproducible artifacts; optional spin-up executes immediately.",
        "items": [
            "Build It writes compose recipe, payload artifact, and bootstrap script with timestamped run id.",
            "Attempt local spin-up now triggers docker compose up -d after artifact generation.",
            "Disable local spin-up when packaging runs for handoff, review, or deferred execution.",
            "Even with spin-up off, artifacts remain complete and runnable later.",
            "Always verify ticker and intent before Build It to avoid stale assumptions.",
        ],
        "examples": [
            "Artifact-only mode for QA handoff: build with spin-up disabled.",
            "Rapid local validation loop: enable spin-up and inspect generated output status.",
            "Failure triage: keep run id and artifacts from failing build for replay.",
        ],
        "action_label": "Prepare Build Controls In Tool",
        "action_id": "build_zone",
    },
    {
        "title": "Effective Settings Ticker",
        "overview": "Ticker is the live serialized truth of your currently effective run configuration.",
        "items": [
            "Shows preset, challenge, network, latency, packet loss, CPU, memory, DB, and toggles.",
            "Updates live as controls change, making it a pre-flight validation surface.",
            "Use ticker to catch mismatch between intended and actual effective config before build.",
            "Treat ticker as the final readout before committing Build It.",
        ],
        "examples": [
            "If challenge changed but ticker does not match expectation, adjust controls before building.",
            "Use ticker in reviews to confirm run context quickly without scanning every control.",
            "Copy ticker context into release notes for reproducible validation evidence.",
        ],
        "action_label": "Review Ticker In Tool",
        "action_id": "ticker",
    },
    {
        "title": "Guide Overlays",
        "overview": "Guide overlays explain controls inline and can be toggled without changing run values.",
        "items": [
            "Show guides enables explanatory overlays near controls.",
            "Close all guides and Show guides toggle both only affect overlay visibility.",
            "Overlay state does not alter scenario configuration by itself.",
            "Use overlays while learning the tool, then hide for clean production runs.",
        ],
        "examples": [
            "Turn guides on while configuring advanced controls for the first time.",
            "Turn guides off before screenshot/export to reduce visual noise.",
            "Toggle overlays during onboarding to explain each control step-by-step.",
        ],
        "action_label": "Turn On Guides In Tool",
        "action_id": "guide_overlays",
    },
]


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


def infer_language_from_filename(filename: str) -> str | None:
    suffix = Path(filename).suffix.lower()
    return FILE_EXTENSION_TO_LANGUAGE.get(suffix)


def initialize_state() -> None:
    for key, value in DEFAULT_STATE.items():
        st.session_state.setdefault(key, value)

    if not st.session_state["preset_initialized"]:
        apply_preset(st.session_state["selected_preset"])
        st.session_state["preset_initialized"] = True


def get_query_param_values(name: str) -> list[str]:
    try:
        return [str(value) for value in st.query_params.get_all(name)]
    except Exception:
        try:
            legacy_values = st.experimental_get_query_params().get(name, [])
            return [str(value) for value in legacy_values]
        except Exception:
            return []


def set_query_param_value(name: str, value: str | None) -> None:
    try:
        if value is None:
            if name in st.query_params:
                del st.query_params[name]
        else:
            st.query_params[name] = value
    except Exception:
        params = st.experimental_get_query_params()
        if value is None:
            params.pop(name, None)
        else:
            params[name] = [value]
        st.experimental_set_query_params(**params)


def get_view_mode() -> str:
    values = get_query_param_values("view")
    if not values:
        return ""
    return values[-1].strip().lower()


def apply_manual_action(action_id: str) -> None:
    if action_id in {"advanced_controls", "security_toggles", "build_zone"}:
        st.session_state["advanced_mode"] = True
    if action_id in {"quick_setup", "challenge_levels", "injection_zone", "ticker"}:
        st.session_state["advanced_mode"] = False
    if action_id == "guide_overlays":
        st.session_state["show_guides"] = True
        st.session_state["show_guides_toggle"] = True


def on_show_guides_toggle_change() -> None:
    show_guides_enabled = st.session_state.get("show_guides_toggle", False)
    st.session_state["show_guides"] = bool(show_guides_enabled)


def consume_close_guides_request() -> None:
    def has_truthy_flag(values: list[str]) -> bool:
        truthy = {"1", "true", "yes", "on"}
        for value in values:
            if str(value).strip().lower() in truthy:
                return True
        return False

    close_requested = False
    try:
        close_requested = has_truthy_flag(st.query_params.get_all("close_guides"))
    except Exception:
        try:
            legacy_values = st.experimental_get_query_params().get("close_guides", [])
            close_requested = has_truthy_flag(legacy_values)
        except Exception:
            close_requested = False

    if not close_requested:
        return

    st.session_state["show_guides"] = False
    st.session_state["show_guides_toggle"] = False

    try:
        if "close_guides" in st.query_params:
            del st.query_params["close_guides"]
    except Exception:
        try:
            params = st.experimental_get_query_params()
            params.pop("close_guides", None)
            st.experimental_set_query_params(**params)
        except Exception:
            pass


def apply_preset(name: str) -> None:
    preset = PRESET_SCENARIOS[name]
    st.session_state["selected_preset"] = name
    for key, value in preset.items():
        st.session_state[key] = value


def apply_difficulty(profile_name: str) -> None:
    overrides = DIFFICULTY_PROFILES[profile_name]
    for key, value in overrides.items():
        st.session_state[key] = value


def on_preset_change() -> None:
    apply_preset(st.session_state["selected_preset"])
    if st.session_state["difficulty_profile"] != "Preset Default":
        apply_difficulty(st.session_state["difficulty_profile"])


def on_difficulty_change() -> None:
    profile = st.session_state["difficulty_profile"]
    if profile == "Preset Default":
        apply_preset(st.session_state["selected_preset"])
        return
    apply_difficulty(profile)


def decode_text_bytes(raw: bytes) -> str:
    for encoding in ("utf-8", "utf-16", "latin-1"):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace")


def apply_payload_source(source_name: str, source_size: int, content: str) -> None:
    st.session_state["payload_text"] = content
    st.session_state["payload_file_name"] = source_name
    st.session_state["last_upload_size"] = source_size

    inferred = infer_language_from_filename(source_name)
    if inferred:
        st.session_state["injection_language"] = inferred
        st.session_state["target_path"] = default_target_path_for_language(inferred)
        st.session_state["run_command"] = default_run_command_for_language(inferred)


def decode_uploaded_file(uploaded_file) -> str:
    raw = uploaded_file.getvalue()
    return decode_text_bytes(raw)


def sync_uploaded_file(uploaded_file) -> None:
    if uploaded_file is None:
        return

    current_name = uploaded_file.name
    current_size = uploaded_file.size
    if (
        st.session_state.get("payload_file_name") == current_name
        and st.session_state.get("last_upload_size") == current_size
    ):
        return

    content = decode_uploaded_file(uploaded_file)
    apply_payload_source(current_name, current_size, content)


def ingest_payload_from_local_path(raw_path: str) -> tuple[bool, str]:
    candidate = raw_path.strip()
    if not candidate:
        return False, "Enter a file path to import."

    source_path = Path(candidate).expanduser()
    if not source_path.is_absolute():
        source_path = (ROOT / source_path).resolve()
    else:
        source_path = source_path.resolve()

    workspace_root = ROOT.resolve()
    try:
        source_path.relative_to(workspace_root)
    except ValueError:
        return False, f"Path must be inside workspace: `{workspace_root}`"

    if not source_path.exists():
        return False, f"File not found: `{source_path}`"
    if not source_path.is_file():
        return False, f"Path is not a file: `{source_path}`"

    suffix = source_path.suffix.lower()
    if suffix not in SUPPORTED_INGEST_EXTENSIONS:
        allowed = ", ".join(sorted(SUPPORTED_INGEST_EXTENSIONS))
        return False, f"Unsupported extension `{suffix or '(none)'}`. Allowed: {allowed}"

    raw = source_path.read_bytes()
    content = decode_text_bytes(raw)
    apply_payload_source(source_path.name, source_path.stat().st_size, content)
    return True, f"Imported `{source_path}` into payload editor."


def scenario_snapshot() -> dict[str, object]:
    return {key: st.session_state.get(key) for key in SCENARIO_EXPORT_KEYS}


def build_scenario_export_document() -> dict[str, object]:
    return {
        "schema": SCENARIO_SCHEMA_NAME,
        "version": SCENARIO_SCHEMA_VERSION,
        "exported_at": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "scenario": scenario_snapshot(),
    }


def coerce_bool(value: object, fallback: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on"}
    return fallback


def apply_imported_scenario(document: dict[str, object]) -> tuple[bool, str]:
    if not isinstance(document, dict):
        return False, "Scenario import failed: expected a JSON object."

    schema = str(document.get("schema", "")).strip()
    if schema and schema != SCENARIO_SCHEMA_NAME:
        return False, f"Scenario import failed: unsupported schema `{schema}`."

    version_raw = document.get("version", SCENARIO_SCHEMA_VERSION)
    try:
        version = int(version_raw)
    except (TypeError, ValueError):
        return False, "Scenario import failed: invalid version value."
    if version > SCENARIO_SCHEMA_VERSION:
        return False, f"Scenario import failed: version `{version}` is newer than supported."

    scenario = document.get("scenario", document)
    if not isinstance(scenario, dict):
        return False, "Scenario import failed: `scenario` payload must be an object."

    applied: list[str] = []

    selected_preset = scenario.get("selected_preset")
    if isinstance(selected_preset, str) and selected_preset in PRESET_SCENARIOS:
        apply_preset(selected_preset)
        applied.append("selected_preset")

    difficulty = scenario.get("difficulty_profile")
    if isinstance(difficulty, str) and difficulty in DIFFICULTY_PROFILES and difficulty != "Preset Default":
        apply_difficulty(difficulty)
        applied.append("difficulty_profile")

    for key in SCENARIO_EXPORT_KEYS:
        if key not in scenario:
            continue
        value = scenario[key]

        if key == "selected_preset":
            if isinstance(value, str) and value in PRESET_SCENARIOS:
                st.session_state[key] = value
            continue

        if key == "difficulty_profile":
            if isinstance(value, str) and value in DIFFICULTY_PROFILES:
                st.session_state[key] = value
                if value == "Preset Default":
                    apply_preset(st.session_state["selected_preset"])
            continue

        if key == "advanced_mode" or key in FAULT_STATE_KEYS:
            st.session_state[key] = coerce_bool(value, fallback=bool(st.session_state.get(key, False)))
            applied.append(key)
            continue

        if key in {"latency_ms", "packet_loss_pct"}:
            try:
                st.session_state[key] = int(value)
                applied.append(key)
            except (TypeError, ValueError):
                pass
            continue

        if key == "network_profile_label":
            if isinstance(value, str) and value in NETWORK_OPTIONS:
                st.session_state[key] = value
                applied.append(key)
            continue

        if key == "cpu_budget_label":
            if isinstance(value, str) and value in CPU_OPTIONS:
                st.session_state[key] = value
                applied.append(key)
            continue

        if key == "memory_budget_label":
            if isinstance(value, str) and value in MEMORY_OPTIONS:
                st.session_state[key] = value
                applied.append(key)
            continue

        if key == "db_engine_label":
            if isinstance(value, str) and value in DB_OPTIONS:
                st.session_state[key] = value
                applied.append(key)
            continue

        if key == "injection_language":
            if isinstance(value, str) and value in INJECTION_EXTENSIONS:
                st.session_state[key] = value
                applied.append(key)
            continue

        if key in {"quick_prompt", "intent_text", "target_path", "run_command"}:
            if value is not None:
                st.session_state[key] = str(value)
                applied.append(key)
            continue

    if not applied:
        return False, "No recognized scenario fields were imported."
    return True, f"Scenario imported ({len(set(applied))} fields applied)."


def get_base64(path: Path) -> str:
    with path.open("rb") as file:
        return base64.b64encode(file.read()).decode("utf-8")


def find_background_asset() -> Path | None:
    candidates = [
        ASSETS_DIR / "SPOOLER_background.png",
        ASSETS_DIR / "SPOOLER_background.jpg",
        ASSETS_DIR / "SPOOLER_background.jpeg",
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return None


def apply_theme(background_path: Path | None) -> None:
    bg_css = ""
    if background_path:
        encoded_bg = get_base64(background_path)
        bg_css = f"background-image: url('data:image/png;base64,{encoded_bg}');"

    led_viewport_bg_css = "background: linear-gradient(110deg, rgba(11, 24, 40, 0.82), rgba(8, 19, 32, 0.72));"
    led_scroller_path = ASSETS_DIR / "Spooler_led_scroller.png"
    if led_scroller_path.exists():
        encoded_led_scroller = get_base64(led_scroller_path)
        led_viewport_bg_css = (
            f"background-image: url('data:image/png;base64,{encoded_led_scroller}');"
            "background-repeat: no-repeat;"
            "background-position: center;"
            "background-size: 100% 100%;"
        )

    st.markdown(
        f"""
        <style>
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700&family=Share+Tech+Mono&display=swap');

        :root {{
            --glass-bg: rgba(10, 20, 34, 0.62);
            --glass-bg-strong: rgba(8, 16, 28, 0.82);
            --glass-border: rgba(162, 206, 255, 0.34);
            --glass-glow: rgba(118, 181, 255, 0.28);
            --text-strong: #f7fbff;
            --text-soft: #dcefff;
        }}

        .stApp {{
            {bg_css}
            background-size: cover;
            background-attachment: fixed;
            color: #d7ffd0;
        }}

        .stApp::before {{
            content: "";
            position: fixed;
            inset: 0;
            background: radial-gradient(circle at top, rgba(52, 255, 120, 0.18), rgba(0, 0, 0, 0.95) 45%);
            z-index: -1;
        }}

        h1, h2, h3 {{
            font-family: 'Orbitron', 'Share Tech Mono', monospace !important;
            letter-spacing: 0.06em;
            text-transform: uppercase;
            color: #93ff69 !important;
            text-shadow: 0 0 12px rgba(112, 255, 77, 0.55);
        }}

        p, label, li, input, textarea {{
            font-family: 'Share Tech Mono', monospace !important;
            font-size: 1.03rem;
        }}

        /* Preserve Streamlit icon glyphs so labels don't render as text tokens like "upload" or "arrow_right". */
        .material-symbols-rounded,
        .material-symbols-outlined,
        .material-icons {{
            font-family: "Material Symbols Rounded", "Material Symbols Outlined", "Material Icons" !important;
            font-style: normal !important;
            font-weight: 400 !important;
            letter-spacing: normal !important;
            text-transform: none !important;
            white-space: nowrap !important;
            word-wrap: normal !important;
        }}

        .stTextInput label,
        .stTextArea label,
        .stSelectbox label,
        .stCheckbox label,
        .stSlider label,
        .stFileUploader label,
        .stToggle label {{
            color: #cbffc2 !important;
            font-size: 1.03rem !important;
            font-weight: 700 !important;
            letter-spacing: 0.03em;
        }}

        .stCaption {{
            font-size: 0.97rem !important;
        }}

        .stTextInput input,
        .stTextArea textarea,
        .stSelectbox div[data-baseweb='select'] > div,
        .stSlider [data-baseweb='slider'],
        .stFileUploader section {{
            background: var(--glass-bg) !important;
            border: 1px solid var(--glass-border) !important;
            color: var(--text-strong) !important;
            border-radius: 12px !important;
            backdrop-filter: blur(10px) saturate(130%);
            transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
        }}

        .stTextInput input:hover,
        .stTextArea textarea:hover,
        .stSelectbox div[data-baseweb='select'] > div:hover,
        .stFileUploader section:hover {{
            border-color: rgba(189, 221, 255, 0.7) !important;
            box-shadow: 0 0 0 1px rgba(189, 221, 255, 0.2), 0 8px 24px rgba(43, 104, 173, 0.22) !important;
            transform: translateY(-1px);
        }}

        .stTextInput input:focus,
        .stTextArea textarea:focus,
        .stSelectbox div[data-baseweb='select'] > div:focus-within {{
            border-color: rgba(204, 230, 255, 0.9) !important;
            box-shadow: 0 0 0 2px rgba(149, 203, 255, 0.25), 0 10px 28px rgba(54, 123, 201, 0.3) !important;
        }}

        .stButton > button,
        .stDownloadButton > button,
        button[kind='primary'] {{
            background: linear-gradient(115deg, #dff4ff, #a8daff 55%, #88c8ff) !important;
            color: #06223a !important;
            border: 1px solid rgba(213, 236, 255, 0.95) !important;
            border-radius: 999px !important;
            font-family: 'Orbitron', 'Share Tech Mono', monospace !important;
            letter-spacing: 0.07em;
            text-transform: uppercase;
            font-weight: 700 !important;
            box-shadow: 0 8px 22px rgba(60, 129, 199, 0.35);
            transition: transform 0.18s ease, box-shadow 0.18s ease, filter 0.18s ease;
        }}

        .stButton > button:hover,
        .stDownloadButton > button:hover,
        button[kind='primary']:hover {{
            filter: brightness(1.04);
            transform: translateY(-2px);
            box-shadow: 0 12px 28px rgba(67, 141, 219, 0.45), 0 0 18px rgba(155, 210, 255, 0.5);
        }}

        section[data-testid='stSidebar'] {{
            display: none !important;
        }}

        header[data-testid='stHeader'],
        [data-testid='stToolbar'],
        [data-testid='stStatusWidget'],
        [data-testid='stDecoration'] {{
            display: none !important;
        }}

        [data-testid='collapsedControl'] {{
            display: none !important;
        }}

        .block-container {{
            padding-top: 1.24rem;
            padding-bottom: 2.9rem;
        }}

        .hero-card {{
            border: 1px solid rgba(173, 214, 255, 0.42);
            border-radius: 16px;
            padding: 14px 18px;
            margin-bottom: 12px;
            background: linear-gradient(145deg, rgba(13, 24, 40, 0.78), rgba(8, 16, 28, 0.65));
            backdrop-filter: blur(12px) saturate(130%);
            box-shadow: 0 16px 40px rgba(16, 47, 84, 0.38), inset 0 1px 0 rgba(228, 242, 255, 0.12);
            transition: border-color 0.2s ease, box-shadow 0.2s ease;
        }}

        .hero-card:hover {{
            border-color: rgba(200, 228, 255, 0.72);
            box-shadow: 0 18px 44px rgba(21, 66, 118, 0.42), inset 0 1px 0 rgba(244, 251, 255, 0.2);
        }}

        .spooler-top-meta h3 {{
            margin-top: 0.02rem !important;
            margin-bottom: 0.2rem !important;
            font-size: clamp(1.22rem, 2.02vw, 1.74rem) !important;
            letter-spacing: 0.055em !important;
            line-height: 1.04 !important;
            white-space: nowrap;
        }}

        .spooler-top-meta .stCaption {{
            margin-top: 0 !important;
            margin-bottom: 0.1rem !important;
        }}

        .hero-content-width {{
            width: min(56vw, 860px);
            max-width: 100%;
        }}

        .st-key-close_guides_button,
        [class*="st-key-close_guides_button"] {{
            position: fixed;
            top: 4.05rem;
            right: 0.95rem;
            z-index: 1405;
            margin: 0 !important;
        }}

        .st-key-close_guides_button .stButton,
        [class*="st-key-close_guides_button"] .stButton {{
            margin: 0 !important;
        }}

        .st-key-close_guides_button .stButton > button,
        [class*="st-key-close_guides_button"] .stButton > button {{
            width: auto;
            color: #041b0b !important;
            font-family: 'Orbitron', 'Share Tech Mono', monospace;
            font-size: 0.64rem;
            letter-spacing: 0.06em;
            text-transform: uppercase;
            border: 1px solid rgba(211, 255, 192, 0.95) !important;
            border-radius: 8px;
            padding: 0.3rem 0.56rem;
            white-space: nowrap;
            min-height: 1.5rem !important;
            background: linear-gradient(120deg, #8bff6e, #c7ff98) !important;
            box-shadow: 0 0 14px rgba(126, 255, 94, 0.42), 0 8px 18px rgba(17, 55, 35, 0.34) !important;
        }}

        .st-key-close_guides_button .stButton > button:hover,
        [class*="st-key-close_guides_button"] .stButton > button:hover {{
            color: #021407 !important;
            border-color: rgba(225, 255, 211, 1) !important;
            background: linear-gradient(120deg, #a4ff84, #ddffb4) !important;
        }}

        @media (max-width: 840px) {{
            .st-key-close_guides_button,
            [class*="st-key-close_guides_button"] {{
                top: 3.75rem;
                right: 0.6rem;
            }}
        }}

        .st-key-open_manual_button,
        [class*="st-key-open_manual_button"] {{
            margin-top: 1.02rem;
        }}

        .st-key-open_manual_button .stButton > button,
        [class*="st-key-open_manual_button"] .stButton > button {{
            color: #9eff7d !important;
            border: 2px solid rgba(170, 255, 140, 0.96) !important;
            background: #050b08 !important;
            box-shadow: 0 0 14px rgba(127, 255, 94, 0.4), inset 0 0 8px rgba(127, 255, 94, 0.15) !important;
            font-size: 0.54rem !important;
            letter-spacing: 0.03em !important;
            padding: 0.22rem 0.56rem !important;
            min-height: 1.32rem !important;
            line-height: 1 !important;
            border-radius: 6px !important;
            white-space: nowrap !important;
        }}

        .manual-return-button .stButton > button {{
            color: #a5ff87 !important;
            border: 1px solid rgba(165, 255, 135, 0.64) !important;
            background: rgba(10, 24, 16, 0.7) !important;
            box-shadow: 0 8px 18px rgba(20, 56, 36, 0.34) !important;
        }}

        .st-key-open_manual_button .stButton > button:hover,
        [class*="st-key-open_manual_button"] .stButton > button:hover {{
            color: #d8ffca !important;
            border-color: rgba(221, 255, 199, 1) !important;
            background: #08150f !important;
        }}

        .manual-return-button .stButton > button:hover {{
            color: #cdffbf !important;
            border-color: rgba(205, 255, 191, 0.86) !important;
            background: rgba(13, 32, 20, 0.78) !important;
        }}

        .manual-shell {{
            border: 1px solid rgba(160, 220, 255, 0.4);
            border-radius: 16px;
            padding: 14px 18px;
            background: linear-gradient(150deg, rgba(10, 21, 37, 0.84), rgba(8, 16, 28, 0.74));
            backdrop-filter: blur(10px) saturate(125%);
            box-shadow: 0 18px 42px rgba(16, 47, 84, 0.34);
            margin-bottom: 12px;
        }}

        .manual-header-title {{
            font-family: 'Orbitron', 'Share Tech Mono', monospace;
            color: #a5ff87;
            text-transform: uppercase;
            letter-spacing: 0.07em;
            font-size: clamp(1.34rem, 2.6vw, 2.2rem);
            text-shadow: 0 0 12px rgba(114, 255, 83, 0.56);
            margin-bottom: 4px;
        }}

        .manual-header-subtitle {{
            color: #ffffff;
            font-size: 0.92rem;
            line-height: 1.5;
            margin-bottom: 12px;
            max-width: min(980px, 100%);
        }}

        .manual-controls {{
            border: 1px solid rgba(162, 216, 255, 0.36);
            border-radius: 12px;
            background: rgba(8, 17, 30, 0.78);
            padding: 10px 12px 6px;
            margin-bottom: 12px;
        }}

        .manual-section {{
            border: 1px solid rgba(137, 203, 255, 0.32);
            border-radius: 12px;
            background: rgba(7, 15, 26, 0.8);
            padding: 11px 13px 10px;
            margin-bottom: 10px;
        }}

        .manual-section-title {{
            font-family: 'Orbitron', 'Share Tech Mono', monospace;
            color: #9eff7d;
            text-transform: uppercase;
            letter-spacing: 0.07em;
            font-size: 0.93rem;
            text-shadow: 0 0 10px rgba(114, 255, 83, 0.44);
            margin-bottom: 6px;
        }}

        .manual-section-overview {{
            color: #ffffff;
            font-size: 0.86rem;
            line-height: 1.52;
            margin-bottom: 8px;
        }}

        .manual-subhead {{
            font-family: 'Orbitron', 'Share Tech Mono', monospace;
            color: #a6ff88;
            text-transform: uppercase;
            letter-spacing: 0.06em;
            font-size: 0.72rem;
            margin: 8px 0 4px;
        }}

        .manual-section ul {{
            margin: 0;
            padding-left: 20px;
        }}

        .manual-section li {{
            color: #ffffff;
            font-size: 0.84rem;
            line-height: 1.48;
            margin-bottom: 5px;
        }}

        .manual-example-list li {{
            color: #d8ffcd;
        }}

        .manual-action-button .stButton {{
            display: flex;
            justify-content: flex-end;
            margin-top: 6px;
            margin-bottom: 12px;
        }}

        .manual-action-button .stButton > button {{
            color: #a5ff87 !important;
            border: 1px solid rgba(169, 255, 141, 0.78) !important;
            background: rgba(10, 25, 16, 0.76) !important;
            box-shadow: 0 0 12px rgba(116, 255, 86, 0.2), 0 7px 16px rgba(15, 44, 29, 0.3) !important;
            font-size: 0.66rem !important;
            letter-spacing: 0.05em !important;
            padding: 0.28rem 0.62rem !important;
            min-height: 1.45rem !important;
        }}

        .manual-action-button .stButton > button:hover {{
            color: #d4ffc2 !important;
            border-color: rgba(210, 255, 196, 0.94) !important;
            background: rgba(13, 32, 21, 0.84) !important;
        }}

        .manual-empty {{
            border: 1px solid rgba(148, 203, 255, 0.38);
            border-radius: 10px;
            background: rgba(9, 19, 33, 0.82);
            color: #ffffff;
            padding: 10px 12px;
            font-size: 0.84rem;
            margin-top: 4px;
        }}

        .section-label {{
            font-family: 'Orbitron', 'Share Tech Mono', monospace;
            color: #a5ff87;
            letter-spacing: 0.08em;
            font-size: 1.18rem;
            font-weight: 700;
            margin-top: 9px;
            margin-bottom: 8px;
            text-transform: uppercase;
            text-shadow: 0 0 14px rgba(130, 255, 103, 0.48);
        }}

        .preset-ai-lens {{
            margin-top: 6px;
            margin-bottom: 4px;
            padding: 7px 10px 8px;
            border: 1px solid rgba(160, 213, 255, 0.38);
            border-left: 3px solid rgba(143, 255, 112, 0.9);
            border-radius: 10px;
            background: linear-gradient(120deg, rgba(10, 23, 39, 0.86), rgba(8, 17, 30, 0.76));
            min-height: 2.45rem;
            box-shadow: inset 0 0 0 1px rgba(108, 170, 238, 0.08);
        }}

        .preset-ai-lens-label {{
            font-family: 'Orbitron', 'Share Tech Mono', monospace;
            color: #a5ff87;
            letter-spacing: 0.06em;
            text-transform: uppercase;
            font-size: 0.62rem;
            line-height: 1.1;
            margin-bottom: 3px;
            text-shadow: 0 0 10px rgba(130, 255, 103, 0.34);
        }}

        .preset-ai-lens-text {{
            color: #ffffff;
            font-size: 0.76rem;
            line-height: 1.34;
        }}

        .preset-ticker-shell {{
            position: relative;
            margin-top: 3px;
            margin-bottom: 12px;
        }}

        .preset-ticker-viewport {{
            position: relative;
            width: 100%;
            aspect-ratio: 3550 / 170;
            min-height: 44px;
            max-height: 92px;
            border-radius: 12px;
            overflow: hidden;
            {led_viewport_bg_css}
            filter: drop-shadow(0 8px 18px rgba(33, 89, 151, 0.28));
            transition: transform 0.2s ease, filter 0.2s ease;
        }}

        .preset-ticker-shell:hover .preset-ticker-viewport {{
            transform: translateY(-1px);
            filter: drop-shadow(0 12px 24px rgba(45, 115, 187, 0.34));
        }}

        .preset-ticker-lane {{
            position: absolute;
            left: calc(4.45% - 10px);
            right: 3.45%;
            top: 33.2%;
            height: 34.2%;
            overflow: hidden;
            display: flex;
            align-items: center;
            pointer-events: none;
        }}

        .preset-ticker-track {{
            display: inline-block;
            white-space: nowrap;
            color: #a5ff87;
            text-shadow: 0 0 8px rgba(130, 255, 103, 0.65), 0 0 14px rgba(116, 255, 91, 0.35);
            font-family: 'Orbitron', 'Share Tech Mono', monospace;
            letter-spacing: 0.05em;
            font-size: clamp(0.5rem, 0.74vw, 1.2rem);
            line-height: 1;
            padding-left: 100%;
            animation: spooler-marquee 76s linear infinite;
        }}

        .define-title-wrap {{
            position: relative;
            display: inline-block;
            margin-bottom: 4px;
        }}

        .define-title-glow {{
            position: absolute;
            left: 0;
            top: 0;
            color: rgba(118, 255, 103, 0.38);
            filter: blur(3px);
            transform: translate(0, 1px);
            pointer-events: none;
        }}

        .define-title-main {{
            position: relative;
            color: #a5ff87;
            text-shadow: 0 0 9px rgba(130, 255, 103, 0.62), 0 0 16px rgba(111, 255, 90, 0.32);
        }}

        .define-title-main,
        .define-title-glow {{
            font-family: 'Orbitron', 'Share Tech Mono', monospace;
            font-size: clamp(1.78rem, 3.65vw, 3.15rem);
            line-height: 0.98;
            letter-spacing: 0.07em;
            text-transform: uppercase;
            font-weight: 700;
            white-space: normal;
        }}

        .define-subline {{
            color: #ffffff;
            font-size: 0.98rem;
            line-height: 1.4;
            margin-bottom: 8px;
            letter-spacing: 0.012em;
        }}

        textarea[aria-label="Environment Prompt"],
        input[aria-label="Environment Prompt"] {{
            background: rgba(255, 255, 255, 0.96) !important;
            color: #0b1b2a !important;
            border: 1px solid rgba(187, 220, 255, 0.85) !important;
            border-radius: 10px !important;
            box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.9), 0 8px 20px rgba(43, 104, 173, 0.16);
            font-family: 'Share Tech Mono', monospace !important;
            min-height: 2.15rem !important;
            padding-top: 0.25rem !important;
            padding-bottom: 0.25rem !important;
        }}

        textarea[aria-label="Environment Prompt"]::placeholder,
        input[aria-label="Environment Prompt"]::placeholder {{
            color: rgba(16, 36, 58, 0.58) !important;
        }}

        .ticker-hover-intent {{
            position: absolute;
            inset: 0;
            z-index: 4;
            opacity: 0;
            visibility: hidden;
            pointer-events: auto;
            background: transparent;
            transition: visibility 0s linear 650ms;
        }}

        .preset-ticker-shell:hover .ticker-hover-intent,
        .preset-ticker-shell:focus-within .ticker-hover-intent {{
            visibility: visible;
        }}

        .ticker-hover-intent:hover ~ .preset-ticker-viewport .preset-ticker-track,
        .settings-popover:hover ~ .preset-ticker-viewport .preset-ticker-track {{
            animation-play-state: paused;
        }}

        .preset-ticker-shell.ticker-disabled .ticker-hover-intent {{
            display: none;
        }}

        .preset-ticker-shell.ticker-disabled .settings-popover {{
            opacity: 0 !important;
            visibility: hidden !important;
            pointer-events: none !important;
            transform: translate(-50%, 6px) scale(0.985) !important;
        }}

        .preset-ticker-shell.ticker-disabled .preset-ticker-track {{
            animation-play-state: running !important;
        }}

        .settings-popover {{
            position: absolute;
            left: 50%;
            bottom: calc(100% + 10px);
            transform: translate(-50%, 6px) scale(0.985);
            width: min(820px, 100%);
            margin: 0;
            border: 1px solid rgba(130, 255, 103, 0.56);
            border-radius: 14px;
            background: linear-gradient(140deg, rgba(7, 16, 30, 0.9), rgba(8, 20, 36, 0.82));
            backdrop-filter: blur(14px) saturate(140%);
            box-shadow: 0 14px 30px rgba(18, 49, 88, 0.44), 0 0 15px rgba(130, 255, 103, 0.2);
            padding: 12px 14px;
            z-index: 3;
            opacity: 0;
            visibility: hidden;
            pointer-events: none;
            transition: opacity 0.16s ease, transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease, visibility 0s linear 0.16s;
        }}

        .settings-popover::before {{
            content: none;
        }}

        .ticker-hover-intent:hover + .settings-popover,
        .settings-popover:hover,
        .preset-ticker-shell:focus-within .settings-popover {{
            opacity: 1;
            visibility: visible;
            pointer-events: auto;
            transform: translate(-50%, 0) scale(1);
            border-color: rgba(144, 255, 123, 0.68);
            box-shadow: 0 16px 34px rgba(17, 48, 83, 0.45), 0 0 20px rgba(130, 255, 103, 0.28);
        }}

        .settings-popover-title {{
            color: #a5ff87;
            font-family: 'Orbitron', 'Share Tech Mono', monospace;
            font-size: 0.82rem;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            margin-bottom: 10px;
        }}

        .settings-popover-grid {{
            display: grid;
            grid-template-columns: repeat(2, minmax(240px, 1fr));
            gap: 7px 18px;
        }}

        .settings-popover-row {{
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 10px;
            border-bottom: 1px dashed rgba(130, 255, 103, 0.26);
            padding-bottom: 4px;
        }}

        .settings-popover-key {{
            color: #a5ff87;
            font-size: 0.76rem;
            letter-spacing: 0.04em;
            text-transform: uppercase;
            flex: 0 0 auto;
        }}

        .settings-popover-value {{
            color: #ffffff;
            font-size: 0.78rem;
            line-height: 1.35;
            text-align: right;
            max-width: 62%;
            overflow-wrap: anywhere;
        }}

        @media (max-width: 840px) {{
            .hero-content-width {{
                width: 100%;
            }}

            .settings-popover {{
                width: 100%;
            }}

            .settings-popover-grid {{
                grid-template-columns: 1fr;
            }}

            .settings-popover-value {{
                max-width: 70%;
            }}

            .guide-drawer {{
                width: calc(100% - 24px);
                min-width: 0;
                max-width: calc(100% - 24px);
            }}
        }}

        .advanced-controls-shell {{
            margin-top: 8px;
            margin-bottom: 10px;
        }}

        .guide-anchor-row {{
            display: flex;
            align-items: flex-start;
            gap: 8px;
            margin-top: 4px;
            margin-bottom: 3px;
        }}

        .guide-line {{
            width: 16px;
            min-width: 16px;
            min-height: 42px;
            display: flex;
            align-items: stretch;
            justify-content: center;
            margin-top: 0;
            pointer-events: none;
        }}

        .guide-line-stem {{
            display: block;
            position: relative;
            width: 2px;
            min-height: 42px;
            border-radius: 999px;
            background: linear-gradient(
                180deg,
                rgba(237, 246, 255, 0.9),
                rgba(186, 219, 255, 0.78)
            );
            filter: drop-shadow(0 0 8px rgba(200, 230, 255, 0.34));
            transform: none;
        }}

        .guide-line-stem::after {{
            content: "";
            position: absolute;
            left: 0;
            bottom: 0;
            width: 16px;
            height: 2px;
            border-radius: 999px;
            background: rgba(225, 239, 255, 0.9);
        }}

        .guide-brief-wrap {{
            display: block;
            max-width: min(760px, 100%);
        }}

        .guide-anchor-title {{
            color: #f3f7ff;
            font-size: 0.76rem;
            letter-spacing: 0.06em;
            text-transform: uppercase;
            margin-bottom: 2px;
        }}

        .guide-brief-text {{
            color: #ffffff;
            font-size: 0.8rem;
            line-height: 1.35;
        }}

        .guide-drawer {{
            margin: 0 0 10px 24px;
            border: 1px solid rgba(144, 194, 255, 0.45);
            border-radius: 8px;
            background: rgba(8, 15, 28, 0.78);
            overflow: hidden;
            position: relative;
            z-index: 1301;
            width: min(760px, calc(100% - 24px));
            min-width: min(420px, calc(100% - 24px));
            max-width: calc(100% - 24px);
        }}

        .guide-drawer-body {{
            padding: 8px 10px 10px;
        }}

        .guide-drawer-body p {{
            color: #ffffff;
            font-size: 0.82rem;
            line-height: 1.45;
            margin: 0 0 8px 0;
        }}

        .guide-drawer-body p:last-child {{
            margin-bottom: 0;
        }}

        @keyframes spooler-marquee {{
            0% {{ transform: translateX(0%); }}
            100% {{ transform: translateX(calc(-100% - 360px)); }}
        }}
        </style>
        """,
        unsafe_allow_html=True,
    )


def to_env_bool(value: bool) -> str:
    return "true" if value else "false"


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


def build_third_party_sim_service_yaml(
    run_id: str,
    outage_enabled: str,
    chaos_mode: str,
) -> list[str]:
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


def build_compose_yaml(run_id: str, env_vars: dict[str, str]) -> str:
    injection_source = str((INJECTIONS_DIR / run_id).resolve()).replace("\\", "\\\\").replace('"', '\\"')
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
            f'        source: "{injection_source}"',
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


def write_injection_files(
    run_id: str,
    payload: str,
    language: str,
) -> tuple[Path, Path, str]:
    injection_dir = INJECTIONS_DIR / run_id
    injection_dir.mkdir(parents=True, exist_ok=True)

    extension = INJECTION_EXTENSIONS[language]
    payload_filename = f"payload{extension}"
    payload_path = injection_dir / payload_filename

    content = payload.strip()
    if not content:
        if language == "python":
            content = "print('spooler injection placeholder')"
        elif language == "node":
            content = "console.log('spooler injection placeholder');"
        else:
            content = "echo 'spooler injection placeholder'"

    payload_path.write_text(content + "\n", encoding="utf-8")

    bootstrap = (
        "#!/usr/bin/env sh\n"
        "set -eu\n"
        "TARGET_PATH=\"${SPOOLER_TARGET_PATH:-/workspace/injected/main" + extension + "}\"\n"
        "mkdir -p \"$(dirname \"$TARGET_PATH\")\"\n"
        f"cp /opt/spooler/injection/{payload_filename} \"$TARGET_PATH\"\n"
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

    return payload_path, bootstrap_path, extension


def run_local_compose(recipe_file: Path) -> tuple[bool, str]:
    command = ["docker", "compose", "-f", str(recipe_file), "up", "-d", "--remove-orphans"]
    try:
        result = subprocess.run(command, capture_output=True, text=True, check=False, timeout=120)
    except FileNotFoundError:
        return False, "Docker CLI not found. Install Docker Desktop, then run the generated compose command."
    except subprocess.TimeoutExpired:
        return False, "Docker compose timed out after 120s."

    output = (result.stdout + "\n" + result.stderr).strip()
    if result.returncode == 0:
        return True, output or "Environment started successfully."
    return False, output or "Docker compose failed with a non-zero exit code."


def inspect_container_state(container_name: str) -> tuple[bool, str]:
    command = [
        "docker",
        "inspect",
        "--format",
        "status={{.State.Status}} exit_code={{.State.ExitCode}} error={{.State.Error}}",
        container_name,
    ]
    try:
        result = subprocess.run(command, capture_output=True, text=True, check=False, timeout=20)
    except FileNotFoundError:
        return False, "Docker CLI not found."
    except subprocess.TimeoutExpired:
        return False, "Container inspect timed out after 20s."

    output = (result.stdout + "\n" + result.stderr).strip()
    if result.returncode == 0:
        return True, output
    return False, output or f"Container `{container_name}` not found."


def get_container_logs(container_name: str, tail_lines: int = 200) -> tuple[bool, str]:
    command = ["docker", "logs", "--tail", str(tail_lines), container_name]
    try:
        result = subprocess.run(command, capture_output=True, text=True, check=False, timeout=20)
    except FileNotFoundError:
        return False, "Docker CLI not found."
    except subprocess.TimeoutExpired:
        return False, "Docker logs timed out after 20s."

    output = (result.stdout + "\n" + result.stderr).strip()
    if result.returncode == 0:
        return True, output
    return False, output or f"Could not read logs for container `{container_name}`."


def parse_payload_exit_code(log_output: str) -> int | None:
    marker = "SPOOLER_RUN_COMMAND_EXIT_CODE:"
    last_exit_code: int | None = None
    for line in log_output.splitlines():
        if marker not in line:
            continue
        value = line.split(marker, 1)[1].strip()
        try:
            last_exit_code = int(value)
        except ValueError:
            continue
    return last_exit_code


def clamp_persisted_output(text: str, max_chars: int = MAX_PERSISTED_OUTPUT_CHARS) -> str:
    normalized = (text or "").strip()
    if len(normalized) <= max_chars:
        return normalized
    return f"{normalized[:max_chars]}\n...[truncated]..."


def to_history_path(path: Path) -> str:
    try:
        return str(path.resolve().relative_to(ROOT.resolve()))
    except ValueError:
        return str(path.resolve())


def resolve_history_path(path_text: str) -> Path:
    candidate = Path(path_text.strip())
    if candidate.is_absolute():
        return candidate
    return (ROOT / candidate).resolve()


def append_run_history_record(record: dict[str, object]) -> tuple[bool, str]:
    try:
        with RUN_HISTORY_FILE.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(record, ensure_ascii=False) + "\n")
    except OSError as exc:
        return False, f"Failed to persist run history: {exc}"
    return True, ""


def load_run_history_records(limit: int = 200) -> list[dict[str, object]]:
    if not RUN_HISTORY_FILE.exists():
        return []

    records: list[dict[str, object]] = []
    for raw_line in RUN_HISTORY_FILE.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line:
            continue
        try:
            item = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(item, dict):
            records.append(item)

    if not records:
        return []
    return records[-limit:][::-1]


def format_run_status(status: str) -> str:
    normalized = status.strip().lower()
    if normalized == "pass":
        return "Pass"
    if normalized == "fail":
        return "Fail"
    if normalized == "recipe_only":
        return "Recipe Only"
    if normalized == "unknown":
        return "Unknown"
    return "Unknown"


def render_run_history_panel() -> None:
    st.subheader("Run Results & History")
    records = load_run_history_records(limit=300)
    if not records:
        st.info("No persisted runs yet. Build a scenario to create the first history record.")
        return

    status_filter = st.selectbox(
        "Status Filter",
        ["All", "Pass", "Fail", "Recipe Only", "Unknown"],
        key="history_status_filter",
    )
    run_query = st.text_input(
        "Find Run ID",
        key="history_run_query",
        placeholder="spool-20260408-103045",
    ).strip()

    filter_value = {
        "Pass": "pass",
        "Fail": "fail",
        "Recipe Only": "recipe_only",
        "Unknown": "unknown",
    }.get(status_filter, "")

    filtered_records: list[dict[str, object]] = []
    for record in records:
        run_id = str(record.get("run_id", "")).strip()
        if not run_id:
            continue
        status = str(record.get("status", "unknown")).strip().lower()
        if filter_value and status != filter_value:
            continue
        if run_query and run_query.lower() not in run_id.lower():
            continue
        filtered_records.append(record)

    if not filtered_records:
        st.info("No runs match the active filters.")
        return

    preview_rows = [
        {
            "Run ID": str(record.get("run_id", "")),
            "Status": format_run_status(str(record.get("status", "unknown"))),
            "Created (UTC)": str(record.get("created_at_utc", "")),
            "Preset": str(record.get("selected_preset", "")),
        }
        for record in filtered_records[:25]
    ]
    st.dataframe(preview_rows, hide_index=True, use_container_width=True)

    selected_index = st.selectbox(
        "Run Detail",
        options=list(range(len(filtered_records))),
        format_func=lambda i: (
            f"{filtered_records[i].get('run_id', '')} | "
            f"{format_run_status(str(filtered_records[i].get('status', 'unknown')))} | "
            f"{filtered_records[i].get('created_at_utc', '')}"
        ),
        key="history_selected_run_index",
    )
    selected = filtered_records[selected_index]
    selected_status = str(selected.get("status", "unknown"))
    selected_status_label = format_run_status(selected_status)
    if selected_status == "pass":
        st.success(f"Status: {selected_status_label}")
    elif selected_status == "fail":
        st.error(f"Status: {selected_status_label}")
    else:
        st.info(f"Status: {selected_status_label}")

    st.write(f"Run ID / Container: `{selected.get('run_id', '')}`")
    st.write(f"Created (UTC): `{selected.get('created_at_utc', '')}`")
    st.write(f"Scenario: `{selected.get('selected_preset', '')}`")
    st.write(f"Challenge: `{selected.get('difficulty_profile', '')}`")
    run_command = str(selected.get("run_command", "")).strip()
    st.write(f"Run command: `{run_command}`" if run_command else "Run command: `(none)`")

    summary = str(selected.get("scenario_summary", "")).strip()
    if summary:
        st.caption("Scenario Summary")
        st.code(summary, language="text")

    run_id_for_key = str(selected.get("run_id", "unknown"))
    artifact_paths = [
        ("Recipe", str(selected.get("recipe_path", "")).strip()),
        ("Payload", str(selected.get("payload_path", "")).strip()),
        ("Bootstrap", str(selected.get("bootstrap_path", "")).strip()),
    ]
    for artifact_label, path_text in artifact_paths:
        if not path_text:
            continue
        resolved = resolve_history_path(path_text)
        exists = resolved.exists()
        st.write(f"{artifact_label}: `{resolved}` ({'found' if exists else 'missing'})")
        if exists and resolved.is_file():
            try:
                data = resolved.read_text(encoding="utf-8")
            except OSError:
                data = ""
            if data:
                st.download_button(
                    f"Download {artifact_label}",
                    data=data,
                    file_name=resolved.name,
                    mime="text/plain",
                    key=f"history-download-{artifact_label.lower()}-{run_id_for_key}",
                )

    compose_output = str(selected.get("compose_output", "")).strip()
    if compose_output:
        st.caption("Compose Output")
        st.code(compose_output, language="bash")

    inspect_output = str(selected.get("inspect_output", "")).strip()
    if inspect_output:
        st.caption("Container State")
        st.code(inspect_output, language="bash")

    logs_output = str(selected.get("logs_output", "")).strip()
    if logs_output:
        st.caption("Container Logs")
        st.code(logs_output, language="bash")

def build_effective_settings_line() -> str:
    toggle_text = " | ".join(
        [
            f"{module.ticker_name}:{'on' if st.session_state[module.key] else 'off'}"
            for module in FAULT_MODULES
        ]
    )
    return (
        f"preset={st.session_state['selected_preset']} | "
        f"level={st.session_state['difficulty_profile']} | "
        f"network={NETWORK_OPTIONS[st.session_state['network_profile_label']]} | "
        f"latency={st.session_state['latency_ms']}ms | "
        f"loss={st.session_state['packet_loss_pct']}% | "
        f"cpu={CPU_OPTIONS[st.session_state['cpu_budget_label']]} | "
        f"memory={MEMORY_OPTIONS[st.session_state['memory_budget_label']]} | "
        f"db={DB_OPTIONS[st.session_state['db_engine_label']]} | "
        f"{toggle_text}"
    )


def build_effective_settings_rows() -> list[tuple[str, str]]:
    rows = [
        ("Preset", st.session_state["selected_preset"]),
        ("Challenge", st.session_state["difficulty_profile"]),
        ("Network", NETWORK_OPTIONS[st.session_state["network_profile_label"]]),
        ("Latency", f"{st.session_state['latency_ms']} ms"),
        ("Packet Loss", f"{st.session_state['packet_loss_pct']}%"),
        ("CPU Budget", CPU_OPTIONS[st.session_state["cpu_budget_label"]]),
        ("Memory Budget", MEMORY_OPTIONS[st.session_state["memory_budget_label"]]),
        ("Database", DB_OPTIONS[st.session_state["db_engine_label"]]),
    ]
    rows.extend(
        [
            (module.label, "On" if st.session_state[module.key] else "Off")
            for module in FAULT_MODULES
        ]
    )
    return rows


def render_preset_ticker() -> None:
    ticker_disabled = st.session_state.get("show_guides", False)
    ticker_reset_key = st.session_state.get("ticker_reset_key", 0)
    shell_class = "preset-ticker-shell ticker-disabled" if ticker_disabled else "preset-ticker-shell"

    summary = escape(build_effective_settings_line())
    ticker_gap = "&nbsp;" * 28
    marquee_text = f"{summary}{ticker_gap}{summary}"
    popover_rows = "".join(
        (
            '<div class="settings-popover-row">'
            f'<span class="settings-popover-key">{escape(name)}</span>'
            f'<span class="settings-popover-value">{escape(value)}</span>'
            "</div>"
        )
        for name, value in build_effective_settings_rows()
    )
    st.markdown(
        (
            f'<div class="{shell_class}" data-ticker-reset="{ticker_reset_key}">'
            '<div class="ticker-hover-intent" aria-hidden="true"></div>'
            '<div class="settings-popover">'
            '<div class="settings-popover-title">Active Environment Profile</div>'
            f'<div class="settings-popover-grid">{popover_rows}</div>'
            "</div>"
            '<div class="preset-ticker-viewport">'
            '<div class="preset-ticker-lane">'
            f'<div class="preset-ticker-track">{marquee_text}</div>'
            "</div>"
            "</div>"
            "</div>"
        ),
        unsafe_allow_html=True,
    )


def render_guide(anchor_label: str, brief: str, details: list[str]) -> None:
    detail_blocks = "".join(f"<p>{escape(line)}</p>" for line in details)
    guide_line_markup = '<div class="guide-line"><span class="guide-line-stem"></span></div>'

    st.markdown(
        (
            '<div class="guide-anchor-row">'
            f"{guide_line_markup}"
            '<div class="guide-brief-wrap">'
            f'<div class="guide-anchor-title">{escape(anchor_label)}</div>'
            f'<div class="guide-brief-text">{escape(brief)}</div>'
            "</div>"
            "</div>"
            '<div class="guide-drawer">'
            f'<div class="guide-drawer-body">{detail_blocks}</div>'
            "</div>"
        ),
        unsafe_allow_html=True,
    )


def render_preset_ai_lens() -> None:
    preset_name = st.session_state.get("selected_preset", "")
    lens_text = PRESET_AI_SECURITY_LENS.get(
        preset_name,
        "Maps the selected scenario to AI-security-relevant failure pressure before build.",
    )
    st.markdown(
        (
            '<div class="preset-ai-lens">'
            '<div class="preset-ai-lens-label">AI Security Lens</div>'
            f'<div class="preset-ai-lens-text">{escape(lens_text)}</div>'
            "</div>"
        ),
        unsafe_allow_html=True,
    )


def render_manual_page() -> None:
    st.markdown('<div class="manual-shell">', unsafe_allow_html=True)
    header_left, header_right = st.columns([6, 1.25])
    with header_left:
        st.markdown('<div class="manual-header-title">SPOOLER Field Guide</div>', unsafe_allow_html=True)
        st.markdown(
            (
                '<div class="manual-header-subtitle">'
                "Deep operator reference for every major control in SPOOLER: what it does, when to use it, "
                "example scenarios, and practical action paths back into the tool."
                "</div>"
            ),
            unsafe_allow_html=True,
        )
    with header_right:
        st.markdown('<div class="manual-return-button">', unsafe_allow_html=True)
        if st.button("Return to SPOOLER", key="manual_return_button"):
            set_query_param_value("view", None)
            st.rerun()
        st.markdown("</div>", unsafe_allow_html=True)

    st.markdown('<div class="manual-controls">', unsafe_allow_html=True)
    jump_options = ["All sections"] + [section["title"] for section in MANUAL_SECTIONS]
    selected_section = st.selectbox(
        "Jump to section",
        jump_options,
        key="manual_jump_section",
        help="Jump directly to a feature chapter in the field guide.",
    )
    st.markdown("</div>", unsafe_allow_html=True)

    visible_sections = []
    for section in MANUAL_SECTIONS:
        if selected_section != "All sections" and section["title"] != selected_section:
            continue
        visible_sections.append(section)

    for idx, section in enumerate(visible_sections):
        bullets = "".join(f"<li>{escape(item)}</li>" for item in section["items"])
        examples = section.get("examples", [])
        example_markup = ""
        if examples:
            example_bullets = "".join(f"<li>{escape(example)}</li>" for example in examples)
            example_markup = (
                '<div class="manual-subhead">Example Scenarios</div>'
                f'<ul class="manual-example-list">{example_bullets}</ul>'
            )
        st.markdown(
            (
                '<div class="manual-section">'
                f'<div class="manual-section-title">{escape(section["title"])}</div>'
                f'<div class="manual-section-overview">{escape(section.get("overview", ""))}</div>'
                '<div class="manual-subhead">Playbook</div>'
                f"<ul>{bullets}</ul>"
                f"{example_markup}"
                "</div>"
            ),
            unsafe_allow_html=True,
        )
        action_label = section.get("action_label")
        action_id = section.get("action_id")
        if action_label and action_id:
            st.markdown('<div class="manual-action-button">', unsafe_allow_html=True)
            if st.button(str(action_label), key=f"manual_action_{idx}_{action_id}"):
                apply_manual_action(str(action_id))
                set_query_param_value("view", None)
                st.rerun()
            st.markdown("</div>", unsafe_allow_html=True)

    st.markdown("</div>", unsafe_allow_html=True)


def maybe_render_guide(anchor_label: str, brief: str, details: list[str]) -> None:
    if st.session_state.get("show_guides"):
        render_guide(anchor_label, brief, details)


def render_advanced_controls() -> None:
    st.markdown('<div class="section-label">Advanced Controls</div>', unsafe_allow_html=True)

    top_left, top_right = st.columns(2)
    with top_left:
        st.text_input(
            "Environment Intent",
            key="intent_text",
            placeholder="e.g. stress generated code behavior under 3G + auth edge-cases",
        )
        maybe_render_guide(
            "Environment Intent",
            "Free-text objective for the current run package.",
            [
                "Write a plain-language outcome statement that explains what this run is meant to prove. Keep it specific enough that someone else can understand the objective without seeing the rest of the setup.",
                "This value is written into the generated environment contract and travels with the artifacts. If you leave it empty, SPOOLER falls back to the selected preset name so the package still has a clear operational label.",
            ],
        )
    with top_right:
        st.selectbox("Injection Language", ["python", "node", "shell"], key="injection_language")
        maybe_render_guide(
            "Injection Language",
            "Selects payload extension and default execution path.",
            [
                "Pick the runtime family that matches the file you plan to inject. This controls payload extension selection and the default execution template used for path and command suggestions.",
                "Python maps to .py paths and python execution defaults, Node maps to .js and node defaults, and Shell maps to .sh with sh defaults. You can still override target path and command manually when needed.",
            ],
        )

    c1, c2, c3 = st.columns(3)
    with c1:
        st.selectbox("1. Network Profile", list(NETWORK_OPTIONS.keys()), key="network_profile_label")
        maybe_render_guide(
            "Network Profile",
            "Sets a coarse network condition profile for scenario context.",
            [
                "Use this selector to establish the baseline operating network for the run. It gives you a fast way to switch between stable and degraded conditions without manually editing every field.",
                "The chosen profile is serialized into the run contract as a stable context label. Combined with latency and packet loss values, it helps downstream logic and reviewers interpret why certain runtime behavior occurred.",
            ],
        )
        st.slider("2. Base Latency (ms)", min_value=0, max_value=900, step=10, key="latency_ms")
        maybe_render_guide(
            "Base Latency",
            "Defines baseline delay injected into the generated environment settings.",
            [
                "Base latency sets the expected request delay floor for this scenario. Increasing it is useful when you want to expose timeout sensitivity, retry behavior, and sequencing assumptions.",
                "Treat this as the main timing pressure dial. Higher values amplify race conditions and brittle timeout defaults, while lower values help you validate nominal behavior before layering on harsher conditions.",
            ],
        )
    with c2:
        st.slider("3. Packet Loss (%)", min_value=0, max_value=40, step=1, key="packet_loss_pct")
        maybe_render_guide(
            "Packet Loss",
            "Models dropped request pressure for retry and idempotency checks.",
            [
                "Packet loss introduces random transport failure pressure so you can evaluate retry logic, duplicate handling, and fallback behavior under imperfect connectivity.",
                "Use lower percentages for routine validation and higher percentages for stress scenarios where resilience is the primary objective. This is one of the most effective controls for surfacing hidden reliability defects.",
            ],
        )
        st.selectbox("4. CPU Budget", list(CPU_OPTIONS.keys()), key="cpu_budget_label")
        maybe_render_guide(
            "CPU Budget",
            "Sets CPU constraint metadata for the environment package.",
            [
                "CPU budget defines available processing headroom for the run. Lower allocations create contention faster and expose latency amplification in compute-heavy code paths.",
                "When failures only appear under constrained throughput, reducing CPU budget is often the fastest way to reproduce them. Pair this with higher latency or strict rate limiting for stronger pressure profiles.",
            ],
        )
    with c3:
        st.selectbox("5. Memory Budget", list(MEMORY_OPTIONS.keys()), key="memory_budget_label")
        maybe_render_guide(
            "Memory Budget",
            "Sets memory constraint metadata for runtime pressure scenarios.",
            [
                "Memory budget controls the runtime footprint allowance used in the scenario package. Tight memory profiles make allocation spikes, leak behavior, and large-buffer assumptions easier to detect.",
                "Use conservative memory limits during hardening passes to surface OOM-adjacent issues early. For baseline checks, increase the budget to isolate logic issues from resource starvation noise.",
            ],
        )
        st.selectbox("6. DB Engine", list(DB_OPTIONS.keys()), key="db_engine_label")
        maybe_render_guide(
            "DB Engine",
            "Chooses which database sidecar is emitted in the compose recipe.",
            [
                "This selector determines which persistence dependency is represented in the generated compose stack. It lets you test compatibility and fallback behavior across different backing data services.",
                "Selecting SQLite keeps the run single-service with no database sidecar, while Postgres, MySQL, and Mongo emit dedicated sidecar services. Choose the option that best matches the integration path you want to validate.",
            ],
        )

    st.markdown("#### Fault + Security Toggles")
    maybe_render_guide(
        "Fault + Security Toggles",
        "Applies boolean switches that shape hostile-path scenario behavior.",
        [
            "These toggles let you compose targeted stress behavior without rewriting presets. Each switch activates a specific class of pressure so you can model realistic failure paths quickly.",
            "Every toggle is serialized into the emitted environment contract for traceable replay. Combine multiple toggles with challenge levels when you want reproducible, high-intensity scenarios.",
        ],
    )
    st.checkbox("7. Chaos Mode", key="chaos_mode")
    maybe_render_guide(
        "Chaos Mode",
        "Enables generalized instability for stress-oriented runs.",
        [
            "Chaos Mode is a broad instability flag used when you want the entire scenario interpreted as hostile rather than nominal. It is useful for resilience-focused validation sessions.",
            "Use this with elevated latency, packet loss, and constrained resources to expose assumptions that only fail under sustained operational turbulence.",
        ],
    )
    st.checkbox("8. Vulnerable DOM", key="vulnerable_dom")
    maybe_render_guide(
        "Vulnerable DOM",
        "Flags DOM risk scenario context for client-side defensive checks.",
        [
            "Enable this when your objective includes client-side rendering safety and DOM-related trust boundaries. It signals that UI-facing paths should be treated with stricter validation expectations.",
            "This is most useful when verifying sanitization, output encoding, and safe rendering behavior across untrusted content flows.",
        ],
    )
    st.checkbox("9. SQL Injection Surface", key="sql_injection")
    maybe_render_guide(
        "SQL Injection Surface",
        "Flags SQL-risk context to test parameterization and query guardrails.",
        [
            "Use this toggle to classify the run as SQL-risk oriented so query handling and input boundaries are tested under stricter assumptions.",
            "Pairing this with strict rate limiting and elevated failure pressure can reveal brittle query retry behavior and weak guardrails in data-access paths.",
        ],
    )
    st.checkbox("10. Auth Bypass Path", key="auth_bypass")
    maybe_render_guide(
        "Auth Bypass Path",
        "Signals authentication edge-case pressure in the scenario package.",
        [
            "Turn this on when you want authentication and authorization flows to be evaluated under bypass-like edge conditions.",
            "It is especially useful for validating token lifecycle handling, boundary checks, and fallback behavior when trust assumptions are stressed.",
        ],
    )
    st.checkbox("11. Third-Party Outage", key="third_party_outage")
    maybe_render_guide(
        "Third-Party Outage",
        "Simulates upstream dependency instability in scenario context.",
        [
            "This toggle marks the scenario as dependency-outage sensitive so external service failure behavior becomes a first-class validation target.",
            "Use it to evaluate timeout handling, circuit-breaker posture, degraded-mode operation, and recovery behavior when upstream systems are unavailable.",
        ],
    )
    st.checkbox("12. Strict Rate Limiting", key="strict_rate_limit")
    maybe_render_guide(
        "Strict Rate Limiting",
        "Applies tighter request-throttling assumptions for the run.",
        [
            "Enable strict rate limiting when you need to pressure request pacing logic and ensure clients do not thrash under constrained throughput policies.",
            "This works well with retry-heavy scenarios where backoff discipline and request budgeting are critical to stability.",
        ],
    )

    bottom_left, bottom_right = st.columns(2)
    with bottom_left:
        st.text_input("Target Path Inside Container", key="target_path")
        maybe_render_guide(
            "Target Path",
            "Destination path where bootstrap copies the payload in-container.",
            [
                "Target path is the exact in-container file location that receives the generated payload at startup. It should align with how your runtime discovers executable entry files.",
                "If the path does not reflect the real execution flow, runs may appear healthy while validating the wrong surface. Keep this aligned with your actual application entrypoint strategy.",
            ],
        )
    with bottom_right:
        st.text_input("Optional Command After Injection", key="run_command")
        maybe_render_guide(
            "Run Command",
            "Optional command executed after payload copy.",
            [
                "Run command is optional and controls whether the payload is executed automatically after injection. Leave it empty when you only need artifact packaging.",
                "Set a command when you want startup-time execution for quick validation loops. Ensure it matches the selected runtime and target path to avoid false negatives.",
            ],
        )


st.set_page_config(page_title="SPOOLER | Environment Builder", page_icon="⚡", layout="wide")
initialize_state()
consume_close_guides_request()
apply_theme(find_background_asset())

if get_view_mode() == "manual":
    render_manual_page()
    st.stop()

logo_path = ASSETS_DIR / "Spooler_logo.png"
top_logo_col, top_meta_col, top_help_col = st.columns([1, 3.05, 0.55])
with top_logo_col:
    if logo_path.exists():
        st.image(str(logo_path), width="stretch")
with top_meta_col:
    st.markdown('<div class="spooler-top-meta">', unsafe_allow_html=True)
    st.markdown("### SPOOLER // Deterministic Failure Testing")
    st.caption("v1.4.0 · streamlined quick setup with optional deep control")
    st.markdown("</div>", unsafe_allow_html=True)
with top_help_col:
    if st.button("Playbook", key="open_manual_button"):
        set_query_param_value("view", "manual")
        st.rerun()

if st.session_state["show_guides"]:
    if st.button("Close Guides", key="close_guides_button"):
        st.session_state["show_guides"] = False
        st.session_state["show_guides_toggle"] = False

st.markdown('<div class="hero-card">', unsafe_allow_html=True)
st.markdown('<div class="hero-content-width">', unsafe_allow_html=True)
st.markdown(
    (
        '<div class="define-title-wrap">'
        '<div class="define-title-glow">Define Your Runtime Scenario</div>'
        '<div class="define-title-main">Define Your Runtime Scenario</div>'
        "</div>"
    ),
    unsafe_allow_html=True,
)
st.markdown(
    (
        '<div class="define-subline">'
        "Start with a custom scenario description or choose a preset, set the challenge level, and build. "
        "Advanced mode provides complete configuration control."
        "</div>"
    ),
    unsafe_allow_html=True,
)

st.text_input(
    "Environment Prompt",
    key="quick_prompt",
    placeholder="Example: validate generated patch behavior under high latency, packet loss, and auth edge-case pressure.",
)
maybe_render_guide(
    "Environment Prompt",
    "Describe the outcome you want in plain language.",
    [
        "This prompt is the fastest way to describe run intent without opening advanced controls. Write one clear statement of what behavior you want to validate, and SPOOLER will carry it into the generated environment contract.",
        "If both prompt and advanced intent are set, the prompt is used as the primary intent value. If prompt is empty, SPOOLER falls back to advanced intent and then preset name, so every package still has a meaningful objective label.",
    ],
)

with st.expander("Scenario Export / Import"):
    scenario_doc = build_scenario_export_document()
    st.download_button(
        "Export Scenario JSON",
        data=json.dumps(scenario_doc, indent=2, sort_keys=True),
        file_name=f"spooler-scenario-{datetime.now().strftime('%Y%m%d-%H%M%S')}.json",
        mime="application/json",
    )
    imported_scenario_file = st.file_uploader(
        "Import Scenario JSON",
        type=["json"],
        key="scenario_import_file",
    )
    if st.button("Apply Imported Scenario"):
        if imported_scenario_file is None:
            st.error("Select a scenario JSON file to import.")
        else:
            try:
                imported_text = decode_text_bytes(imported_scenario_file.getvalue())
                imported_doc = json.loads(imported_text)
            except Exception as exc:
                st.error(f"Scenario import failed: {exc}")
            else:
                ok, message = apply_imported_scenario(imported_doc)
                if ok:
                    st.success(message)
                else:
                    st.error(message)

st.markdown("</div>", unsafe_allow_html=True)
st.markdown("</div>", unsafe_allow_html=True)

st.markdown('<div class="section-label">Quick Setup (Simple Mode)</div>', unsafe_allow_html=True)
setup_col_1, setup_col_2, setup_col_3, setup_col_4 = st.columns([2, 1, 1, 1])
with setup_col_1:
    st.selectbox(
        "Preset Scenario",
        list(PRESET_SCENARIOS.keys()),
        key="selected_preset",
        on_change=on_preset_change,
    )
    render_preset_ai_lens()
    maybe_render_guide(
        "Preset Scenario",
        "Loads a full baseline profile for environment settings and payload defaults.",
        [
            "A preset is the fastest way to load a complete scenario profile with coherent defaults. It sets network, resource, and fault posture in one step so setup stays consistent across runs.",
            "Use presets when you want repeatability and fast onboarding. You can still layer challenge-level overrides or advanced control edits on top without losing the baseline profile intent.",
        ],
    )
with setup_col_2:
    st.selectbox(
        "Challenge Level",
        list(DIFFICULTY_PROFILES.keys()),
        key="difficulty_profile",
        help=CHALLENGE_LEVEL_HELP,
        on_change=on_difficulty_change,
    )
    maybe_render_guide(
        "Challenge Level",
        "Applies preconfigured stress overrides on top of the current preset.",
        [
            "Challenge level adjusts operational stress intensity while preserving the scenario theme selected by the preset. It is the quickest way to scale pressure up or down.",
            "Use Preset Default to keep baseline values unchanged, then move to Hard or Extreme when validating robustness under heavier latency, loss, and fault pressure.",
        ],
    )
with setup_col_3:
    st.toggle("Advanced mode", key="advanced_mode")
    maybe_render_guide(
        "Advanced Mode",
        "Reveals full control over network, compute, database, and fault toggles.",
        [
            "Advanced mode expands the full control plane so you can tune every environment variable directly. This is useful when presets are close but not exact for your target condition.",
            "Keep this off for fast, standardized runs and turn it on when you need precise shaping for a specific edge case or reproduction workflow.",
        ],
    )
with setup_col_4:
    st.session_state["show_guides_toggle"] = bool(st.session_state.get("show_guides", False))
    st.toggle("Show guides", key="show_guides_toggle", on_change=on_show_guides_toggle_change)

if st.session_state["advanced_mode"]:
    st.markdown('<div class="advanced-controls-shell">', unsafe_allow_html=True)
    render_advanced_controls()
    st.checkbox("Attempt local spin-up now (docker compose up -d)", key="spin_now")
    maybe_render_guide(
        "Local Spin-Up",
        "Immediately attempts docker compose start after artifact generation.",
        [
            "Enable this when you want SPOOLER to execute compose startup right after writing artifacts. It shortens feedback time for end-to-end checks.",
            "Disable it when you are generating packages for handoff, versioning, or later execution in another environment.",
        ],
    )
    st.markdown("</div>", unsafe_allow_html=True)
else:
    st.session_state["spin_now"] = False

st.caption(f"Challenge note: {DIFFICULTY_DETAILS[st.session_state['difficulty_profile']]}")
render_preset_ticker()
maybe_render_guide(
    "Effective Settings Ticker",
    "Real-time summary of the exact effective environment profile.",
    [
        "The ticker gives an immediate serialized summary of the currently effective configuration. It is useful as a pre-flight checkpoint before generating artifacts.",
        "Because it updates live as controls change, it helps you verify that overrides were applied as expected and prevents accidental builds with stale assumptions.",
    ],
)

st.markdown('<div class="section-label">Injection Zone</div>', unsafe_allow_html=True)
uploaded_file = st.file_uploader(
    "Drag + drop a code file here, or click to browse",
    type=[extension.lstrip(".") for extension in sorted(SUPPORTED_INGEST_EXTENSIONS)],
)
sync_uploaded_file(uploaded_file)
maybe_render_guide(
    "File Upload",
    "Imports a source file and syncs it into the payload editor.",
    [
        "Upload lets you bring in an existing file directly from your workstation for immediate packaging. The file contents are copied into the payload editor so you can inspect or modify before build.",
        "When extension mapping is recognized, language-specific defaults are updated automatically for target path and run command. This reduces manual setup mistakes during repeated runs.",
    ],
)

if uploaded_file is not None:
    st.caption(
        f"Loaded `{uploaded_file.name}` ({uploaded_file.size} bytes). "
        "The file content was copied into the payload editor below."
    )

st.text_area(
    "Injected Code Payload",
    key="payload_text",
    placeholder="Paste code here if you are not uploading a file...",
    height=190,
)
maybe_render_guide(
    "Injected Code Payload",
    "Editable payload content that gets written into generated injection artifacts.",
    [
        "This editor is the exact source that becomes the injected payload artifact. Use it for quick iteration when you want to adjust behavior without switching tools.",
        "If no payload content is provided, SPOOLER writes a language-matched placeholder so the package remains executable and structurally complete.",
    ],
)

with st.expander("IDE Connect (Local Read-Only)"):
    st.write("Import a file from your local workspace path in read-only mode and copy it into the payload editor.")
    st.selectbox("IDE", ["VS Code", "Cursor", "JetBrains"], key="ide_choice")
    st.text_input(
        "Workspace File Path",
        key="ide_ingest_path",
        placeholder="payload_probes/spooler_qa_probe.py",
    )
    if st.button("Import Workspace File"):
        ok, message = ingest_payload_from_local_path(st.session_state["ide_ingest_path"])
        if ok:
            st.success(message)
        else:
            st.error(message)
    maybe_render_guide(
        "IDE Connect",
        "Read-only local workspace file import into Injection Zone.",
        [
            "Provide a local workspace path to import file contents directly into the payload editor without editing the source file.",
            "Current implementation is local-path based and intentionally avoids remote IDE APIs or OAuth complexity.",
        ],
    )

maybe_render_guide(
    "Build It",
    "Generates a timestamped compose recipe plus injection artifacts for this run.",
    [
        "Build It freezes the current control state into a deterministic environment package. The output includes compose recipe, payload artifact, and bootstrap script for reproducible execution.",
        "When Local Spin-Up is enabled, startup is attempted immediately after artifact generation. Otherwise, the package is still complete and ready for manual execution.",
    ],
)

if st.button("Build It", type="primary"):
    run_id = f"spool-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
    recipe_path = RECIPES_DIR / f"{run_id}.yml"

    prompt_value = st.session_state["quick_prompt"].strip()
    intent_value = prompt_value or st.session_state["intent_text"].strip()
    if not intent_value:
        intent_value = st.session_state["selected_preset"]
    if st.session_state["difficulty_profile"] != "Preset Default":
        intent_value = f"{intent_value} | difficulty={st.session_state['difficulty_profile'].lower()}"

    env_vars = {
        "INTENT": intent_value,
        "NETWORK_PROFILE": NETWORK_OPTIONS[st.session_state["network_profile_label"]],
        "LATENCY_MS": str(st.session_state["latency_ms"]),
        "PACKET_LOSS_PCT": str(st.session_state["packet_loss_pct"]),
        "CPU_BUDGET": CPU_OPTIONS[st.session_state["cpu_budget_label"]],
        "MEMORY_BUDGET": MEMORY_OPTIONS[st.session_state["memory_budget_label"]],
        "DB_ENGINE": DB_OPTIONS[st.session_state["db_engine_label"]],
        "THIRD_PARTY_ENDPOINT": "http://third-party-sim:18080/third-party",
        "SPOOLER_TARGET_PATH": st.session_state["target_path"].strip() or "/workspace/injected/main.py",
        "SPOOLER_RUN_COMMAND": st.session_state["run_command"].strip(),
    }
    for fault_key, env_var_name in FAULT_ENV_VARS.items():
        env_vars[env_var_name] = to_env_bool(st.session_state[fault_key])

    injection_language = st.session_state["injection_language"]
    payload = st.session_state["payload_text"]
    run_command_used = env_vars["SPOOLER_RUN_COMMAND"].strip()
    scenario_summary = build_effective_settings_line()
    run_status = "recipe_only"
    compose_ok: bool | None = None
    compose_output = ""
    inspect_ok: bool | None = None
    inspect_output = ""
    logs_ok: bool | None = None
    logs_output = ""
    payload_exit_code: int | None = None

    with st.status("Spooling environment...", expanded=True) as status:
        st.write("Generating compose recipe...")
        compose_yaml = build_compose_yaml(run_id, env_vars)
        recipe_path.write_text(compose_yaml, encoding="utf-8")

        st.write("Creating injection files...")
        payload_path, bootstrap_path, extension = write_injection_files(
            run_id=run_id,
            payload=payload,
            language=injection_language,
        )

        if not st.session_state["target_path"].strip().endswith(extension):
            st.warning(
                f"Target path extension does not match selected language ({extension}). "
                "This is allowed, but can be confusing during live walkthroughs."
            )

        if st.session_state["spin_now"]:
            st.write("Attempting local docker compose spin-up...")
            compose_ok, compose_output = run_local_compose(recipe_path)
            if compose_ok:
                st.write("Docker compose spin-up succeeded.")
                status.update(label="Environment Ready", state="complete", expanded=False)
                st.success("Local environment is up.")
            else:
                status.update(label="Recipe Ready (Spin-up failed)", state="error", expanded=True)
                st.error("Recipe and injection files were created, but local spin-up failed.")
            st.code(compose_output, language="bash")

            st.caption("Local Run Result")
            st.write(f"Run ID / Container: `{run_id}`")
            st.write(
                f"Run command used: `{run_command_used}`"
                if run_command_used
                else "Run command used: `(none)`"
            )

            inspect_ok, inspect_output = inspect_container_state(run_id)
            if inspect_ok:
                st.write(f"Container state: `{inspect_output}`")
            else:
                st.warning("Unable to inspect container state.")
                st.code(inspect_output, language="bash")

            logs_ok, logs_output = get_container_logs(run_id)
            if run_command_used:
                payload_exit_code = parse_payload_exit_code(logs_output if logs_ok else "")
                if payload_exit_code is None:
                    st.warning("Payload execution status is not yet available in container logs.")
                elif payload_exit_code == 0:
                    st.success("Payload execution succeeded (exit code 0).")
                else:
                    st.error(f"Payload execution failed (exit code {payload_exit_code}).")
            else:
                st.info("Payload execution skipped because run command is empty.")

            if logs_ok:
                st.caption("Container Logs (last 200 lines)")
                st.code(logs_output or "<no log output>", language="bash")
            else:
                st.warning("Unable to fetch container logs.")
                st.code(logs_output, language="bash")

            if not compose_ok:
                run_status = "fail"
            elif run_command_used:
                if payload_exit_code == 0:
                    run_status = "pass"
                elif payload_exit_code is None:
                    run_status = "unknown"
                else:
                    run_status = "fail"
            else:
                run_status = "pass"
        else:
            status.update(label="Environment Recipe Ready", state="complete", expanded=False)

    persisted_ok, persist_message = append_run_history_record(
        {
            "run_id": run_id,
            "created_at_utc": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
            "status": run_status,
            "selected_preset": st.session_state["selected_preset"],
            "difficulty_profile": st.session_state["difficulty_profile"],
            "scenario_summary": scenario_summary,
            "spin_requested": bool(st.session_state["spin_now"]),
            "run_command": run_command_used,
            "container_name": run_id,
            "recipe_path": to_history_path(recipe_path),
            "payload_path": to_history_path(payload_path),
            "bootstrap_path": to_history_path(bootstrap_path),
            "compose_ok": compose_ok,
            "compose_output": clamp_persisted_output(compose_output),
            "inspect_ok": inspect_ok,
            "inspect_output": clamp_persisted_output(inspect_output),
            "logs_ok": logs_ok,
            "logs_output": clamp_persisted_output(logs_output),
            "payload_exit_code": payload_exit_code,
        }
    )
    if not persisted_ok:
        st.warning(persist_message)

    st.success(f"Environment package written: `{run_id}`")

    up_command = f"docker compose -f {recipe_path} up -d --remove-orphans"
    down_command = f"docker compose -f {recipe_path} down -v"

    command_col_1, command_col_2 = st.columns(2)
    with command_col_1:
        st.caption("Spin Up")
        st.code(up_command, language="bash")
    with command_col_2:
        st.caption("Tear Down")
        st.code(down_command, language="bash")

    st.caption("Generated Compose Recipe")
    st.code(compose_yaml, language="yaml")

    st.caption("Injected Payload")
    preview_lang = "python" if injection_language == "python" else "bash"
    st.code(payload_path.read_text(encoding="utf-8"), language=preview_lang)

    st.download_button(
        "Download Recipe",
        data=compose_yaml,
        file_name=recipe_path.name,
        mime="text/yaml",
    )

    st.info(
        "Inject files are mounted into `/opt/spooler/injection` and copied by `bootstrap.sh` to `SPOOLER_TARGET_PATH` "
        "when the container starts."
    )

    st.caption(f"Files created: `{recipe_path}` | `{payload_path}` | `{bootstrap_path}`")

st.divider()
render_run_history_panel()
