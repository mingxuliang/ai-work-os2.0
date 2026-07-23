# -*- coding: utf-8 -*-
"""Dual-read env helpers for enterprise mounts (AIWORK_ / QWENPAW_ / COPAW_)."""
from __future__ import annotations

import os
from typing import Optional


def get_env(key: str, default: str = "") -> str:
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


def apply_console_static_defaults() -> Optional[str]:
    """Ensure console static env points at AIWork ``console/dist`` when unset."""
    from pathlib import Path

    if get_env("AIWORK_CONSOLE_STATIC_DIR") or get_env("QWENPAW_CONSOLE_STATIC_DIR"):
        return get_env("AIWORK_CONSOLE_STATIC_DIR") or get_env(
            "QWENPAW_CONSOLE_STATIC_DIR",
        )

    root = Path(__file__).resolve().parents[2].parent  # src/aiwork/app -> repo
    # Path: src/aiwork/app/enterprise_env.py -> parents[0]=app, [1]=aiwork, [2]=src, [3]=repo
    repo = Path(__file__).resolve().parents[3]
    candidate = repo / "console" / "dist"
    if (candidate / "index.html").is_file():
        os.environ.setdefault("AIWORK_CONSOLE_STATIC_DIR", str(candidate))
        os.environ.setdefault("QWENPAW_CONSOLE_STATIC_DIR", str(candidate))
        return str(candidate)
    return None
