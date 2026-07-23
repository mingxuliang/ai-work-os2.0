# -*- coding: utf-8 -*-
"""agentscope.memory shim (1.x InMemoryMemory)."""
from __future__ import annotations

from typing import Any


class InMemoryMemory:
    """Minimal in-memory message store — agentscope 1.x compatible."""

    def __init__(self) -> None:
        self._messages: list[dict[str, Any]] = []

    def add(self, message: Any) -> None:
        if hasattr(message, "model_dump"):
            self._messages.append(message.model_dump())
        elif isinstance(message, dict):
            self._messages.append(message)

    def get_messages(self) -> list[dict[str, Any]]:
        return list(self._messages)

    def clear(self) -> None:
        self._messages.clear()

    async def dream(self) -> None:
        """Memory consolidation no-op (ReMe handles this in QW2)."""

    def __len__(self) -> int:
        return len(self._messages)


__all__ = ["InMemoryMemory"]
