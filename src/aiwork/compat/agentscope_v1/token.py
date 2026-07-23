# -*- coding: utf-8 -*-
"""agentscope.token shim (1.x TokenCounterBase)."""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


class TokenCounterBase(ABC):
    """Minimal agentscope 1.x TokenCounterBase."""

    @abstractmethod
    async def count(self, text: str, **kwargs: Any) -> int:
        """Count tokens in *text*."""

    async def count_messages(self, messages: list[dict], **kwargs: Any) -> int:
        total = 0
        for msg in messages:
            content = msg.get("content", "")
            if isinstance(content, str):
                total += await self.count(content, **kwargs)
            elif isinstance(content, list):
                for part in content:
                    if isinstance(part, dict) and "text" in part:
                        total += await self.count(part["text"], **kwargs)
        return total


__all__ = ["TokenCounterBase"]
