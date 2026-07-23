# -*- coding: utf-8 -*-
"""agentscope.agent._react_agent shim."""


class _MemoryMark:
    """Minimal _MemoryMark shim (agentscope 1.x)."""

    def __init__(self, *args, **kwargs):
        _ = args, kwargs


__all__ = ["_MemoryMark"]
