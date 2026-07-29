# -*- coding: utf-8 -*-
"""Compatibility shim — auto_model lives in ``aiwork.providers.auto_model``."""
from aiwork.providers.auto_model import (  # noqa: F401
    auto_model_for_request,
    auto_model_enabled,
    inspect_request_media,
    maybe_auto_model_slot,
    resolve_model,
    resolve_model_slot,
)

__all__ = [
    "auto_model_enabled",
    "auto_model_for_request",
    "inspect_request_media",
    "maybe_auto_model_slot",
    "resolve_model",
    "resolve_model_slot",
]
