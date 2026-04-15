from __future__ import annotations

from .registry import FaultModule, register_fault_modules


BUILTIN_FAULT_MODULES = (
    FaultModule(
        key="chaos_mode",
        env_var="CHAOS_MODE",
        ticker_name="chaos",
        label="Chaos Mode",
        default_enabled=False,
    ),
    FaultModule(
        key="vulnerable_dom",
        env_var="VULNERABLE_DOM",
        ticker_name="vuln_dom",
        label="Vulnerable DOM",
        default_enabled=True,
    ),
    FaultModule(
        key="sql_injection",
        env_var="SQL_INJECTION",
        ticker_name="sqli",
        label="SQL Injection Surface",
        default_enabled=False,
    ),
    FaultModule(
        key="auth_bypass",
        env_var="AUTH_BYPASS",
        ticker_name="auth_bypass",
        label="Auth Bypass Path",
        default_enabled=False,
    ),
    FaultModule(
        key="third_party_outage",
        env_var="THIRD_PARTY_OUTAGE",
        ticker_name="outage",
        label="Third-Party Outage",
        default_enabled=False,
    ),
    FaultModule(
        key="strict_rate_limit",
        env_var="STRICT_RATE_LIMIT",
        ticker_name="rate_limit",
        label="Strict Rate Limiting",
        default_enabled=True,
    ),
)


def register_builtin_fault_modules() -> None:
    register_fault_modules(BUILTIN_FAULT_MODULES)
