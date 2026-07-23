# -*- coding: utf-8 -*-
from .chat_protocol import normalize_stream_event

__all__ = ["normalize_stream_event"]


def install_agentscope_v1_compat():
    """Install AgentScope 1.x shims for AgentScope 2.x (idempotent)."""
    from .agentscope_v1 import install

    return install()
