# -*- coding: utf-8 -*-
"""Loop engineering infrastructure package.

Core architecture:
    StopHandler + StopGate (in gates/ sub-package)
    ├── LoopGate      — session-safe base for loop plugins
    ├── DoomLoopGate  — multi-stage repetition detection
    ├── RubricGate    — rubric-based evaluation (GoalMode)
    ├── IterationGate — iteration limit (universal)
    └── BudgetGate    — token budget (GoalMode)

DefaultMode owns always-on gate registration for ordinary ReAct turns.
Custom modes are compiled from the gate catalog via ``compiler``.
"""

from .catalog import get_gate_catalog
from .compiler import compile_loop_mode
from .gates import (
    DoomLoopGate,
    GoalStatusRubric,
    LoopGate,
    RubricStrategy,
    RubricVerdict,
    StopAction,
    StopGate,
    StopHandler,
    StopHandlerRegistration,
    StopHandlerResult,
)

__all__ = [
    "DoomLoopGate",
    "GoalStatusRubric",
    "LoopGate",
    "RubricStrategy",
    "RubricVerdict",
    "StopAction",
    "StopGate",
    "StopHandler",
    "StopHandlerRegistration",
    "StopHandlerResult",
    "compile_loop_mode",
    "get_gate_catalog",
]
