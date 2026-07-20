# -*- coding: utf-8 -*-
"""Memory strategy for Phase 3: mem0 vs ReMe 0.4 / Scroll Context."""
from __future__ import annotations

import logging
from dataclasses import dataclass

from aiwork_enterprise.env import get_env

logger = logging.getLogger(__name__)


@dataclass
class MemoryPlan:
    backend: str  # remé | mem0 | scroll | hybrid
    notes: str


def resolve_memory_plan() -> MemoryPlan:
    """Decide long-term memory backend for QwenPaw 2.0.

    Default: use QwenPaw ReMe 0.4 + Scroll Context; keep mem0 read-only
    until operators set ``AIWORK_MEMORY_BACKEND=mem0``.
    """
    raw = get_env("AIWORK_MEMORY_BACKEND", "reme").strip().lower()
    if raw in ("mem0", "memory0"):
        return MemoryPlan(
            backend="mem0",
            notes="Legacy mem0 kept; ensure MEM0_* / AIWORK_PGVECTOR aligned",
        )
    if raw in ("hybrid", "both"):
        return MemoryPlan(
            backend="hybrid",
            notes="ReMe/Scroll primary; mem0 queried as secondary index",
        )
    if raw in ("scroll", "scroll_context"):
        return MemoryPlan(
            backend="scroll",
            notes="Scroll Context only (no long-term ReMe)",
        )
    return MemoryPlan(
        backend="reme",
        notes="QwenPaw ReMe 0.4 + Scroll Context (recommended)",
    )


def log_memory_plan() -> MemoryPlan:
    plan = resolve_memory_plan()
    logger.info("Memory plan: backend=%s (%s)", plan.backend, plan.notes)
    return plan
