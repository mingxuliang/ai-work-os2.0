# -*- coding: utf-8 -*-
"""Migrate AIWork custom / bidding skills into QwenPaw Workspace Resources."""
from __future__ import annotations

import logging
import shutil
from pathlib import Path

from aiwork_enterprise.env import get_env

logger = logging.getLogger(__name__)

_DEFAULT_SKILL_NAMES = (
    "online-learning-bidding",
    "bidding",
)


def _wd() -> Path:
    raw = get_env("AIWORK_WORKING_DIR") or get_env("QWENPAW_WORKING_DIR")
    if raw:
        return Path(raw).expanduser().resolve()
    p = Path("~/.aiwork").expanduser()
    return p.resolve()


def migrate_workspace_skills(
    *,
    source_roots: list[Path] | None = None,
    skill_names: tuple[str, ...] = _DEFAULT_SKILL_NAMES,
) -> list[Path]:
    """Copy known business skills into WORKING_DIR/skills and custom-skills.

    Returns list of destination paths created/updated.
    """
    wd = _wd()
    dest_skills = wd / "skills"
    dest_custom = wd / "custom-skills"
    dest_skills.mkdir(parents=True, exist_ok=True)
    dest_custom.mkdir(parents=True, exist_ok=True)

    roots = source_roots or []
    # Repo-relative candidates
    repo = Path(__file__).resolve().parents[4]
    roots.extend(
        [
            repo / "custom-skills",
            repo / "src" / "aiwork" / "agents" / "skills",
            wd / "custom-skills",
            Path("cache/biaoshumuban"),
        ],
    )

    copied: list[Path] = []
    for root in roots:
        if not root.exists():
            continue
        for name in skill_names:
            src = root / name
            if not src.is_dir():
                continue
            for dest_root in (dest_skills, dest_custom):
                dest = dest_root / name
                if dest.resolve() == src.resolve():
                    continue
                if dest.exists():
                    shutil.rmtree(dest)
                shutil.copytree(src, dest)
                copied.append(dest)
                logger.info("Migrated skill %s → %s", name, dest)

    # Ensure template cache path exists for bidding skill
    cache = wd / "cache" / "biaoshumuban"
    cache.mkdir(parents=True, exist_ok=True)

    return copied
