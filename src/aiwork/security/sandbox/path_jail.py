# -*- coding: utf-8 -*-
"""Path jail helpers for execution sandbox enforcement."""
from __future__ import annotations

import os
from pathlib import Path
from typing import Literal

from ...constant import WORKING_DIR, EnvVarLoader
from ...config.context import get_current_workspace_dir
from .context import (
    get_current_readonly_roots,
    get_current_sandbox_root,
    get_sandbox_enabled_override,
    get_current_skill_requires_sandbox,
)

_TRUE_STRINGS = frozenset({"true", "1", "yes", "on"})
_PATH_MODE = Literal["read", "write"]


class SandboxBoundaryError(PermissionError):
    """Raised when a path escapes the configured sandbox root."""


def is_sandbox_enabled() -> bool:
    """Return whether execution sandbox enforcement is active."""
    if get_current_skill_requires_sandbox():
        return True

    override = get_sandbox_enabled_override()
    if override is False:
        return False
    if override is True:
        return True

    if (
        "AIWORK_EXECUTION_SANDBOX_ENABLED" in os.environ
    ):
        env_val = EnvVarLoader.get_str("AIWORK_EXECUTION_SANDBOX_ENABLED")
        return env_val.strip().lower() in _TRUE_STRINGS

    try:
        from aiwork.config import load_config

        cfg = load_config().security.execution_sandbox
        return bool(cfg.enabled and cfg.backend != "off")
    except Exception:
        return False


def load_use_user_subdir() -> bool:
    """Return whether user-scoped sandbox subdirectories are enabled."""
    try:
        from aiwork.config import load_config

        return bool(load_config().security.execution_sandbox.use_user_subdir)
    except Exception:
        return True


def _normalize_compare_path(path: Path) -> str:
    """Normalize a path for stable boundary comparisons."""
    resolved = path.expanduser().resolve(strict=False)
    if os.name == "nt":
        return str(resolved).replace("\\", "/").lower()
    return str(resolved)


def get_workspace_dir_for_jail() -> Path:
    """Return the active agent workspace directory."""
    return Path(get_current_workspace_dir() or WORKING_DIR).expanduser().resolve(
        strict=False,
    )


def load_configured_readonly_roots() -> list[Path]:
    """Return configured workspace-relative readonly roots."""
    try:
        from aiwork.config import load_config

        cfg = load_config().security.execution_sandbox
        rel_paths = list(cfg.sandbox_readonly_roots or ["skills"])
        allow_skill_dirs = bool(getattr(cfg, "allow_enabled_skill_dirs", True))
    except Exception:
        rel_paths = ["skills"]
        allow_skill_dirs = True

    workspace = get_workspace_dir_for_jail()
    roots: list[Path] = []
    seen: set[str] = set()
    for rel in rel_paths:
        rel_text = str(rel or "").strip().strip("/\\")
        if not rel_text:
            continue
        candidate = (workspace / rel_text).resolve(strict=False)
        key = _normalize_compare_path(candidate)
        if key in seen:
            continue
        seen.add(key)
        roots.append(candidate)

    if allow_skill_dirs:
        for extra in get_current_readonly_roots():
            candidate = Path(extra).expanduser().resolve(strict=False)
            key = _normalize_compare_path(candidate)
            if key in seen:
                continue
            seen.add(key)
            roots.append(candidate)
    return roots


def get_active_sandbox_root() -> Path:
    """Return the writable sandbox root for the current context."""
    root = get_current_sandbox_root()
    if root is not None:
        return root.expanduser().resolve(strict=False)
    return get_workspace_dir_for_jail()


def _normalize_skill_relative_path(raw_path: str) -> str:
    normalized = str(raw_path or "").replace("\\", "/").strip()
    while normalized.startswith("./"):
        normalized = normalized[2:]
    return normalized


def _relative_base_for_tool_path(
    raw_path: str,
    *,
    sandbox_root: Path,
    workspace_dir: Path,
) -> Path:
    """Choose the base directory for resolving a relative tool path."""
    normalized = _normalize_skill_relative_path(raw_path)
    if normalized.startswith("skills/") or normalized.startswith("skill/"):
        return workspace_dir
    return sandbox_root


def is_path_in_jail(abs_path: str | Path, sandbox_root: str | Path) -> bool:
    """Return True when *abs_path* is inside *sandbox_root*."""
    if not abs_path or not sandbox_root:
        return False
    try:
        target = Path(abs_path).expanduser().resolve(strict=False)
        root = Path(sandbox_root).expanduser().resolve(strict=False)
    except (OSError, ValueError):
        return False

    if os.name == "nt":
        target_cmp = _normalize_compare_path(target)
        root_cmp = _normalize_compare_path(root)
        if target_cmp == root_cmp:
            return True
        prefix = root_cmp.rstrip("/") + "/"
        return target_cmp.startswith(prefix)

    try:
        target.relative_to(root)
        return True
    except ValueError:
        return False


def is_path_readable(
    abs_path: str | Path,
    sandbox_root: str | Path | None = None,
) -> bool:
    """Return True when *abs_path* is readable in sandbox mode."""
    root = sandbox_root or get_active_sandbox_root()
    if is_path_in_jail(abs_path, root):
        return True
    for readonly_root in load_configured_readonly_roots():
        if is_path_in_jail(abs_path, readonly_root):
            return True
    return False


def is_path_writable(
    abs_path: str | Path,
    sandbox_root: str | Path | None = None,
) -> bool:
    """Return True when *abs_path* is inside the writable sandbox root."""
    root = sandbox_root or get_active_sandbox_root()
    return is_path_in_jail(abs_path, root)


def resolve_tool_path_string(
    raw_path: str,
    *,
    mode: _PATH_MODE,
    workspace_dir: Path | None = None,
) -> str:
    """Resolve a tool path and enforce read/write sandbox policy."""
    if not raw_path or not str(raw_path).strip():
        raise SandboxBoundaryError("Empty path is not allowed in sandbox mode")

    workspace = workspace_dir or get_workspace_dir_for_jail()
    path = Path(raw_path).expanduser()
    if path.is_absolute():
        resolved = str(path.resolve(strict=False))
    else:
        sandbox_root = get_active_sandbox_root()
        base = _relative_base_for_tool_path(
            raw_path,
            sandbox_root=sandbox_root,
            workspace_dir=workspace,
        )
        resolved = str((base / raw_path).resolve(strict=False))

    if mode == "read":
        assert_path_readable(resolved)
    else:
        assert_path_writable(resolved)
    return resolved


def resolve_path_in_jail(
    raw_path: str,
    sandbox_root: Path,
    *,
    workspace_dir: Path | None = None,
) -> Path:
    """Resolve *raw_path* relative to workspace, then validate jail boundary."""
    if not raw_path or not str(raw_path).strip():
        raise SandboxBoundaryError("Empty path is not allowed in sandbox mode")

    path = Path(raw_path).expanduser()
    if path.is_absolute():
        resolved = path.resolve(strict=False)
    else:
        base = workspace_dir or get_current_workspace_dir() or WORKING_DIR
        resolved = (Path(base) / path).resolve(strict=False)

    if not is_path_writable(resolved, sandbox_root):
        raise SandboxBoundaryError(
            f"Path '{resolved}' is outside sandbox boundary '{sandbox_root}'",
        )
    return resolved


def assert_path_in_jail(
    abs_path: str | Path,
    sandbox_root: str | Path,
) -> None:
    """Raise if *abs_path* is outside the writable sandbox root."""
    assert_path_writable(abs_path, sandbox_root)


def assert_path_readable(abs_path: str | Path) -> None:
    """Raise if *abs_path* is outside readable sandbox boundaries."""
    if not is_path_readable(abs_path):
        roots = load_configured_readonly_roots()
        readonly_hint = ", ".join(str(root) for root in roots) or "none"
        raise SandboxBoundaryError(
            f"Path '{abs_path}' is outside sandbox read boundary "
            f"'{get_active_sandbox_root()}' (readonly roots: {readonly_hint})",
        )


def assert_path_writable(
    abs_path: str | Path,
    sandbox_root: str | Path | None = None,
) -> None:
    """Raise if *abs_path* is outside the writable sandbox root."""
    root = sandbox_root or get_active_sandbox_root()
    if not is_path_writable(abs_path, root):
        raise SandboxBoundaryError(
            f"Path '{abs_path}' is outside writable sandbox boundary '{root}'",
        )
