# -*- coding: utf-8 -*-
"""Context variables for execution sandbox runtime overrides."""
from __future__ import annotations

from contextvars import ContextVar
from pathlib import Path

current_sandbox_root: ContextVar[Path | None] = ContextVar(
    "current_sandbox_root",
    default=None,
)
current_sandbox_enabled_override: ContextVar[bool | None] = ContextVar(
    "current_sandbox_enabled_override",
    default=None,
)
current_skill_requires_sandbox: ContextVar[bool] = ContextVar(
    "current_skill_requires_sandbox",
    default=False,
)
current_session_container_key: ContextVar[str | None] = ContextVar(
    "current_session_container_key",
    default=None,
)
current_readonly_roots: ContextVar[tuple[str, ...]] = ContextVar(
    "current_readonly_roots",
    default=(),
)

_TRUE_STRINGS = frozenset({"true", "1", "yes", "on"})
_FALSE_STRINGS = frozenset({"false", "0", "no", "off"})


def get_current_sandbox_root() -> Path | None:
    """Return the active sandbox root for the current tool execution."""
    return current_sandbox_root.get()


def set_current_sandbox_root(root: Path | None) -> None:
    """Set the sandbox root for the current async context."""
    current_sandbox_root.set(root)


def get_sandbox_enabled_override() -> bool | None:
    """Return per-request sandbox override, if any."""
    return current_sandbox_enabled_override.get()


def set_sandbox_enabled_override(enabled: bool | None) -> None:
    """Set per-request sandbox override for the current async context."""
    current_sandbox_enabled_override.set(enabled)


def get_current_skill_requires_sandbox() -> bool:
    """Return whether the active skill invocation requires sandbox."""
    return current_skill_requires_sandbox.get()


def set_current_skill_requires_sandbox(required: bool) -> None:
    """Mark the current skill invocation as requiring sandbox."""
    current_skill_requires_sandbox.set(required)


def get_current_session_container_key() -> str | None:
    """Return the active session container key, if any."""
    return current_session_container_key.get()


def set_current_session_container_key(session_key: str | None) -> None:
    """Set the session container key for the current async context."""
    current_session_container_key.set(session_key)


def get_current_readonly_roots() -> tuple[str, ...]:
    """Return extra readonly roots registered for the current request."""
    return current_readonly_roots.get()


def set_current_readonly_roots(roots: list[str] | tuple[str, ...] | None) -> None:
    """Register extra readonly directory roots for the current request."""
    if not roots:
        current_readonly_roots.set(())
        return
    normalized = tuple(
        str(Path(str(root)).expanduser().resolve(strict=False))
        for root in roots
        if str(root or "").strip()
    )
    current_readonly_roots.set(normalized)


def parse_sandbox_enabled_value(value: object) -> bool | None:
    """Parse a request payload value into a sandbox enabled flag."""
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in _TRUE_STRINGS:
            return True
        if normalized in _FALSE_STRINGS:
            return False
    return None
