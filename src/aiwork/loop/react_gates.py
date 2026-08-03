# -*- coding: utf-8 -*-
"""Compatibility shim for pre-DefaultMode ReAct gate registration.

Upstream #6210 moved default gate ownership to ``DefaultMode``.
``register_react_gates`` is kept as a no-op so older call sites do not
double-register gates. Prefer ``resolve_max_iterations`` from
``aiwork.modes.default``.
"""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

from ..modes.default import resolve_max_iterations
from .gates import StopHandler
from .handler_registry import get_or_create_stop_handler

if TYPE_CHECKING:
    from ..config.config import AgentsRunningConfig

logger = logging.getLogger(__name__)


def register_react_gates(
    workspace: Any,
    running_config: "AgentsRunningConfig",  # noqa: ARG001
) -> StopHandler:
    """No-op compatibility wrapper.

    DefaultMode registers and refreshes the default-scoped handler on
    each turn. Returning the shared handler preserves older tests that
    still call this helper.
    """
    if workspace is None:
        return StopHandler()
    logger.debug(
        "register_react_gates is deprecated; DefaultMode owns default gates",
    )
    return get_or_create_stop_handler(workspace, scope="default")


__all__ = [
    "register_react_gates",
    "resolve_max_iterations",
]
