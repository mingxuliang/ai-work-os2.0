# -*- coding: utf-8 -*-
"""Enterprise Governance presets for business paths (cache/skills/templates)."""
from __future__ import annotations

import logging
from pathlib import Path

import yaml

from aiwork_enterprise.env import get_env

logger = logging.getLogger(__name__)

_ENTERPRISE_RULES = [
    # ── Workspace reads ───────────────────────────────────────────────────────
    {
        "match": "Read(WORKSPACE_DIR/cache/**)",
        "action": "allow",
        "reason": "AIWork: template/cache reads",
    },
    {
        "match": "Read(WORKSPACE_DIR/skills/**)",
        "action": "allow",
        "reason": "AIWork: workspace skills",
    },
    {
        "match": "Read(WORKSPACE_DIR/custom-skills/**)",
        "action": "allow",
        "reason": "AIWork: custom/business skill reads",
    },
    {
        "match": "Read(WORKSPACE_DIR/media/**)",
        "action": "allow",
        "reason": "AIWork: media reads",
    },
    # ── RAG / vector store paths ───────────────────────────────────────────
    {
        "match": "Read(WORKSPACE_DIR/rag/**)",
        "action": "allow",
        "reason": "AIWork RAG: document store",
    },
    {
        "match": "Write(WORKSPACE_DIR/rag/**)",
        "action": "allow",
        "reason": "AIWork RAG: ingest/index writes",
    },
    {
        "match": "Read(WORKSPACE_DIR/vector_index/**)",
        "action": "allow",
        "reason": "AIWork RAG: FAISS/pgvector index reads",
    },
    {
        "match": "Write(WORKSPACE_DIR/vector_index/**)",
        "action": "allow",
        "reason": "AIWork RAG: vector index writes",
    },
    # ── Bidding templates ─────────────────────────────────────────────────
    {
        "match": "Read(WORKSPACE_DIR/cache/biaoshumuban/**)",
        "action": "allow",
        "reason": "AIWork: bidding template cache",
    },
    {
        "match": "Write(WORKSPACE_DIR/cache/biaoshumuban/**)",
        "action": "allow",
        "reason": "AIWork: bidding template writes",
    },
    # ── General workspace writes ───────────────────────────────────────────
    {
        "match": "Write(WORKSPACE_DIR/cache/**)",
        "action": "allow",
        "reason": "AIWork: template/cache writes",
    },
    {
        "match": "Write(WORKSPACE_DIR/media/**)",
        "action": "allow",
        "reason": "AIWork: media writes",
    },
    # ── Shell safety ──────────────────────────────────────────────────────
    {
        "match": "Bash(rm -rf /*)",
        "action": "deny",
        "reason": "Enterprise: block destructive root rm",
    },
    {
        "match": "Bash(rm *)",
        "action": "ask",
        "reason": "Enterprise: ask before rm",
    },
    # ── Sensitive file guard ──────────────────────────────────────────────
    {
        "match": "Read(**/.env)",
        "action": "ask",
        "reason": "Enterprise: confirm reading .env files",
    },
    {
        "match": "Write(**/.env)",
        "action": "ask",
        "reason": "Enterprise: confirm writing .env files",
    },
]


def _working_dir() -> Path:
    raw = get_env("AIWORK_WORKING_DIR") or get_env("QWENPAW_WORKING_DIR")
    if raw:
        return Path(raw).expanduser().resolve()
    # Prefer existing AIWork data root
    aiwork = Path("~/.aiwork").expanduser()
    if aiwork.exists():
        return aiwork.resolve()
    return Path("~/.qwenpaw").expanduser().resolve()


def ensure_enterprise_policy() -> Path:
    """Write a shared enterprise policy seed under WORKING_DIR/governance.

    Per-agent hashed policy dirs are created by QwenPaw at runtime; this
    seed file is also copied into ``governance/enterprise_defaults.yaml``
    for operators to merge.
    """
    root = _working_dir() / "governance"
    root.mkdir(parents=True, exist_ok=True)
    seed = root / "enterprise_defaults.yaml"
    doc = {
        "version": "2.0",
        "execution_level": "smart",
        "audit_level": "all",
        "user_rules": _ENTERPRISE_RULES,
        "sensitive_paths": [
            "~/.ssh/",
            "/etc/shadow",
            "**/credentials*",
            "**/*.pem",
        ],
    }
    if not seed.exists():
        seed.write_text(
            yaml.dump(doc, allow_unicode=True, sort_keys=False),
            encoding="utf-8",
        )
        logger.info("Wrote governance seed %s", seed)
    else:
        logger.debug("Governance seed already present: %s", seed)

    # Also ensure business resource dirs exist
    for sub in ("cache", "cache/biaoshumuban", "skills", "media", "custom-skills",
                "rag", "vector_index"):
        (root.parent / sub).mkdir(parents=True, exist_ok=True)

    return seed
