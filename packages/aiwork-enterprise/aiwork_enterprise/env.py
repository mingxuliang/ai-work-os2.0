# -*- coding: utf-8 -*-
"""Dual-read env: AIWORK_* → QWENPAW_* → COPAW_* → default."""
from __future__ import annotations

import os
from pathlib import Path
from typing import Optional


def get_env(key: str, default: str = "") -> str:
    """Resolve env with AIWork / QwenPaw / CoPaw precedence.

    Accepts either ``AIWORK_*`` or ``QWENPAW_*`` keys.
    """
    if key in os.environ and os.environ[key] != "":
        return os.environ[key]

    suffixes: list[str] = []
    if key.startswith("AIWORK_"):
        suffixes.append(key[len("AIWORK_") :])
    elif key.startswith("QWENPAW_"):
        suffixes.append(key[len("QWENPAW_") :])
    elif key.startswith("COPAW_"):
        suffixes.append(key[len("COPAW_") :])
    else:
        return os.environ.get(key, default)

    for suffix in suffixes:
        for prefix in ("AIWORK_", "QWENPAW_", "COPAW_"):
            candidate = prefix + suffix
            if candidate in os.environ and os.environ[candidate] != "":
                return os.environ[candidate]
    return default


def get_bool(key: str, default: bool = False) -> bool:
    val = get_env(key, str(default)).lower()
    return val in ("true", "1", "yes", "on")


def apply_working_dir_bridge() -> Optional[str]:
    """Ensure QwenPaw sees the same working dir as AIWork.

    If only AIWORK_WORKING_DIR is set, mirror into QWENPAW_WORKING_DIR
    before qwenpaw.constant is imported.
    """
    aiwork_wd = os.environ.get("AIWORK_WORKING_DIR", "").strip()
    qwen_wd = os.environ.get("QWENPAW_WORKING_DIR", "").strip()
    copaw_wd = os.environ.get("COPAW_WORKING_DIR", "").strip()

    if aiwork_wd and not qwen_wd:
        os.environ["QWENPAW_WORKING_DIR"] = aiwork_wd
        return aiwork_wd
    if qwen_wd and not aiwork_wd:
        os.environ["AIWORK_WORKING_DIR"] = qwen_wd
        return qwen_wd
    if copaw_wd and not aiwork_wd and not qwen_wd:
        os.environ["AIWORK_WORKING_DIR"] = copaw_wd
        os.environ["QWENPAW_WORKING_DIR"] = copaw_wd
        return copaw_wd
    return aiwork_wd or qwen_wd or copaw_wd or None


def kernel_mode() -> str:
    """Return ``qwenpaw2`` or ``legacy``."""
    mode = get_env("AIWORK_KERNEL", "qwenpaw2").strip().lower()
    if mode in ("qwenpaw2", "qw2", "2", "2.0"):
        return "qwenpaw2"
    return "legacy"


def apply_console_static_bridge() -> Optional[str]:
    """Point QwenPaw static dir at AIWork Console (keep AIWork UI)."""
    aiwork_static = os.environ.get("AIWORK_CONSOLE_STATIC_DIR", "").strip()
    qwen_static = os.environ.get("QWENPAW_CONSOLE_STATIC_DIR", "").strip()

    if not aiwork_static:
        # Prefer built AIWork console in-repo / package
        candidates = []
        try:
            from aiwork.utils.console_static import resolve_console_static_dir

            candidates.append(resolve_console_static_dir())
        except Exception:  # noqa: BLE001
            pass
        repo_guess = Path(__file__).resolve().parents[3] / "console" / "dist"
        candidates.append(str(repo_guess))
        for c in candidates:
            if c and (Path(c) / "index.html").is_file():
                aiwork_static = c
                break

    if aiwork_static:
        os.environ["AIWORK_CONSOLE_STATIC_DIR"] = aiwork_static
        if not qwen_static:
            os.environ["QWENPAW_CONSOLE_STATIC_DIR"] = aiwork_static
        return aiwork_static
    return qwen_static or None
