# -*- coding: utf-8 -*-
"""agentscope.session shim (1.x SessionBase)."""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Optional


class SessionBase(ABC):
    """Minimal agentscope 1.x SessionBase."""

    session_id: str = ""
    agent_id: str = ""
    user_id: Optional[str] = None

    @abstractmethod
    async def start(self) -> None:
        """Start the session."""

    @abstractmethod
    async def stop(self) -> None:
        """Stop the session."""

    async def send_message(self, content: str, **kwargs: Any) -> Any:
        """Send a message (no-op stub)."""

    async def get_history(self) -> list[dict]:
        return []


__all__ = ["SessionBase"]
