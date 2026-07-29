# -*- coding: utf-8 -*-
"""Request-scoped chat user isolation helpers (AIWork 1.0-style hard isolation)."""
from __future__ import annotations

from contextvars import ContextVar
from typing import Any

from fastapi import HTTPException, Request

_chat_user_id: ContextVar[str] = ContextVar("aiwork_chat_user_id", default="")


def get_scoped_chat_user_id() -> str:
    return (_chat_user_id.get() or "").strip()


def set_scoped_chat_user_id(user_id: str) -> None:
    _chat_user_id.set((user_id or "").strip())


def get_request_user_id(request: Request) -> str:
    """JWT user id from auth middleware (sub / user_id)."""
    uid = getattr(request.state, "user_id", None)
    if uid is None or str(uid).strip() == "":
        raise HTTPException(status_code=401, detail="Authentication required")
    return str(uid).strip()


def get_request_roles(request: Request) -> list[str]:
    roles = getattr(request.state, "roles", None) or []
    return [str(r) for r in roles]


def is_admin_request(request: Request) -> bool:
    roles = {r.lower() for r in get_request_roles(request)}
    return "admin" in roles


def assert_chat_owner(
    chat_spec: Any,
    *,
    user_id: str,
    allow_admin: bool = False,
    is_admin: bool = False,
) -> None:
    owner = str(getattr(chat_spec, "user_id", "") or "").strip()
    if owner == user_id:
        return
    if allow_admin and is_admin:
        return
    raise HTTPException(status_code=404, detail="Chat not found")
