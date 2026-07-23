# -*- coding: utf-8 -*-
"""agentscope.pipeline shim (1.x stream_printing_messages)."""
from __future__ import annotations

from typing import Any, AsyncIterator


async def stream_printing_messages(
    messages: Any,
    *,
    end: str = "\n",
    **kwargs: Any,
) -> AsyncIterator[Any]:
    """Compatibility shim — yield through messages unchanged."""
    _ = end, kwargs
    if hasattr(messages, "__aiter__"):
        async for msg in messages:
            yield msg
    elif hasattr(messages, "__iter__"):
        for msg in messages:
            yield msg


__all__ = ["stream_printing_messages"]
