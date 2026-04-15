from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable


@dataclass(frozen=True)
class FaultModule:
    key: str
    env_var: str
    ticker_name: str
    label: str
    default_enabled: bool


_PRESET_SCENARIOS: dict[str, dict[str, object]] = {}
_FAULT_MODULES: dict[str, FaultModule] = {}


def register_preset(name: str, config: dict[str, object]) -> None:
    _PRESET_SCENARIOS[name] = dict(config)


def register_presets(presets: dict[str, dict[str, object]]) -> None:
    for name, config in presets.items():
        register_preset(name, config)


def get_preset_scenarios() -> dict[str, dict[str, object]]:
    return {name: dict(config) for name, config in _PRESET_SCENARIOS.items()}


def register_fault_module(module: FaultModule) -> None:
    _FAULT_MODULES[module.key] = module


def register_fault_modules(modules: Iterable[FaultModule]) -> None:
    for module in modules:
        register_fault_module(module)


def get_fault_modules() -> tuple[FaultModule, ...]:
    return tuple(_FAULT_MODULES.values())
