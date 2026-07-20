# -*- coding: utf-8 -*-
"""Auth helpers re-export from AIWork JWT module when available."""

try:
    from aiwork.app.auth_jwt import get_router
except Exception:  # noqa: BLE001
    get_router = None  # type: ignore

__all__ = ["get_router"]
