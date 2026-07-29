# -*- coding: utf-8 -*-
"""Session-scoped Docker sandbox container models and helpers."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


@dataclass
class SessionContainer:
    """A long-lived Docker container bound to one chat session."""

    container_id: str
    container_name: str
    session_key: str
    sandbox_root: Path
    last_used: float
    created_at: float


def build_session_key(
    agent_id: str,
    user_id: str,
    root_session_id: str,
) -> str:
    """Build the canonical session container key."""
    return f"{agent_id}:{user_id}:{root_session_id}"


def build_session_key_from_context() -> str | None:
    """Return the active session container key from context vars."""
    from ...app.agent_context import (
        get_current_agent_id,
        get_current_root_session_id,
        get_current_session_id,
    )
    from .context import get_current_session_container_key

    explicit = get_current_session_container_key()
    if explicit:
        return explicit

    agent_id = get_current_agent_id() or "default"
    root_session_id = (
        get_current_root_session_id() or get_current_session_id() or ""
    )
    if not root_session_id:
        return None
    return build_session_key(agent_id, "", root_session_id)
