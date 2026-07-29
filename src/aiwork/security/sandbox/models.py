# -*- coding: utf-8 -*-
"""Dataclasses for execution sandbox runs."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class SandboxRunResult:
    """Result of a sandboxed shell execution."""

    returncode: int
    stdout: str
    stderr: str
    backend: str
    duration_seconds: float = 0.0
