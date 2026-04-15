from __future__ import annotations

from .builtin_faults import register_builtin_fault_modules
from .builtin_scenarios import register_builtin_scenarios
from .registry import FaultModule, get_fault_modules, get_preset_scenarios


register_builtin_scenarios()
register_builtin_fault_modules()

__all__ = [
    "FaultModule",
    "get_fault_modules",
    "get_preset_scenarios",
]
