# -*- coding: utf-8 -*-
"""Thin mapper for QwenPaw 2.0 stream events → AIWork Console expectations."""
from __future__ import annotations

from typing import Any, Mapping


def normalize_stream_event(event: Mapping[str, Any]) -> dict:
    """Pass-through with light key aliases for Console Chat.

    Extend here when Phase 1 protocol checklist finds drift.
    """
    out = dict(event)
    # Common aliases observed across 1.x → 2.0 migrations
    if "type" not in out and "event" in out:
        out["type"] = out["event"]
    if "content" not in out and "text" in out:
        out["content"] = out["text"]
    if "delta" not in out and "content_delta" in out:
        out["delta"] = out["content_delta"]
    return out
