# -*- coding: utf-8 -*-
"""Resolve per-user sandbox directory roots under an agent workspace."""
from __future__ import annotations

import logging
import os
import re
from pathlib import Path

logger = logging.getLogger(__name__)

_DEFAULT_USER_IDS = frozenset({"", "default"})

_SAFE_USER_ID_RE = re.compile(r"^[A-Za-z0-9._-]+$")


def sanitize_user_id(user_id: str) -> str:
    """Return a filesystem-safe user id segment."""
    raw = (user_id or "").strip()
    if not raw or raw in _DEFAULT_USER_IDS:
        return ""
    if _SAFE_USER_ID_RE.fullmatch(raw):
        return raw
    # Fallback: replace unsafe chars with underscore.
    return re.sub(r"[^A-Za-z0-9._-]", "_", raw) or "user"


def _configured_readonly_rel_paths() -> list[str]:
    """Return workspace-relative readonly directory names from config."""
    try:
        from aiwork.config import load_config

        cfg = load_config().security.execution_sandbox
        return [
            str(rel or "").strip().strip("/\\")
            for rel in (cfg.sandbox_readonly_roots or ["skills"])
            if str(rel or "").strip().strip("/\\")
        ]
    except Exception:
        return ["skills"]


def ensure_sandbox_readonly_links(
    sandbox_root: Path,
    workspace_dir: Path,
    *,
    readonly_rel_paths: list[str] | None = None,
) -> None:
    """Expose workspace readonly dirs inside a per-user sandbox via symlinks.

    Per-user sandboxes live at ``workspace/users/{user_id}/``, but Skill
    docs and scripts use workspace-relative paths such as
    ``skills/resume-matcher/generate_report.py``.  Without a link, those
    paths do not exist from the shell cwd even though the readonly policy
    allows reading ``workspace/skills``.
    """
    root = Path(workspace_dir).expanduser().resolve(strict=False)
    sandbox = Path(sandbox_root).expanduser().resolve(strict=False)
    if sandbox == root:
        return

    rel_paths = readonly_rel_paths or _configured_readonly_rel_paths()
    linked_tops: set[str] = set()
    for rel_path in rel_paths:
        top = Path(rel_path).parts[0] if Path(rel_path).parts else rel_path
        if not top or top in linked_tops:
            continue
        linked_tops.add(top)

        target = (root / top).resolve(strict=False)
        if not target.exists():
            continue

        link_path = sandbox / top
        if link_path.exists() or link_path.is_symlink():
            try:
                if link_path.is_symlink() and link_path.resolve() == target:
                    continue
            except OSError:
                pass
            if link_path.is_dir() and not link_path.is_symlink():
                # Do not replace a real user-created directory.
                logger.debug(
                    "Skip sandbox readonly link %s: path already exists",
                    link_path,
                )
                continue
            try:
                link_path.unlink(missing_ok=True)
            except OSError as exc:
                logger.warning(
                    "Failed to replace existing sandbox link %s: %s",
                    link_path,
                    exc,
                )
                continue

        try:
            rel_target = os.path.relpath(target, link_path.parent)
            link_path.symlink_to(
                rel_target,
                target_is_directory=target.is_dir(),
            )
            logger.debug(
                "Linked sandbox readonly path %s -> %s",
                link_path,
                target,
            )
        except OSError as exc:
            logger.warning(
                "Failed to create sandbox readonly link %s -> %s: %s",
                link_path,
                target,
                exc,
            )


def resolve_sandbox_root(
    workspace_dir: Path,
    user_id: str,
    *,
    use_user_subdir: bool = True,
) -> Path:
    """Resolve the sandbox root directory for tool execution.

    When ``use_user_subdir`` is enabled and *user_id* is a real user,
    returns ``workspace_dir/users/{user_id}/``. Otherwise returns the
    agent workspace root.
    """
    root = Path(workspace_dir).expanduser().resolve()
    safe_uid = sanitize_user_id(user_id)
    if use_user_subdir and safe_uid:
        sandbox = root / "users" / safe_uid
    else:
        sandbox = root
    sandbox.mkdir(parents=True, exist_ok=True)
    resolved = sandbox.resolve()
    ensure_sandbox_readonly_links(resolved, root)
    return resolved
