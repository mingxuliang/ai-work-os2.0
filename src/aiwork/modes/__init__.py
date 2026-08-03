# -*- coding: utf-8 -*-
"""Mode abstractions.

Each ``AgentMode`` packages the commands / tools / hooks / prompt
contributors that belong to one runtime mode (``coding`` / ``mission``
/ ``plan`` / ``default`` / custom loops).  The base class and the
``ModeGatedHook`` mix-in provide a single registration surface for
mode authors.
"""

from __future__ import annotations

from .base import AgentMode, ModeGatedHook, find_active_explicit_mode
from .custom_loop import (
    CustomLoopController,
    DeclarativeLoopMode,
    LoopModeActivationStore,
    load_custom_loop_modes,
)
from .default import DefaultMode, resolve_max_iterations

__all__ = [
    "AgentMode",
    "ModeGatedHook",
    "find_active_explicit_mode",
    "DefaultMode",
    "resolve_max_iterations",
    "CustomLoopController",
    "DeclarativeLoopMode",
    "LoopModeActivationStore",
    "load_custom_loop_modes",
]
