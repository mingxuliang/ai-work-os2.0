# -*- coding: utf-8 -*-
"""RAG migration helper for Phase 3.

Copies existing AIWork pgvector embeddings config and FAISS index files
into WORKING_DIR/rag and WORKING_DIR/vector_index so QwenPaw 2.0 RAG can
find them at startup.

When ``AIWORK_PGVECTOR_DB_URL`` is set, we emit a migration note; the
vector table itself stays in the same Postgres DB and QwenPaw shares it
via the same URL.
"""
from __future__ import annotations

import logging
import shutil
from pathlib import Path

from aiwork_enterprise.env import get_env

logger = logging.getLogger(__name__)


def _wd() -> Path:
    raw = get_env("AIWORK_WORKING_DIR") or get_env("QWENPAW_WORKING_DIR")
    if raw:
        return Path(raw).expanduser().resolve()
    return Path("~/.aiwork").expanduser().resolve()


def migrate_rag_assets(*, source_roots: list[Path] | None = None) -> dict:
    """Copy local RAG index files into QwenPaw working dir.

    Returns a dict with counts of files copied per target.
    """
    wd = _wd()
    rag_dir = wd / "rag"
    vec_dir = wd / "vector_index"
    rag_dir.mkdir(parents=True, exist_ok=True)
    vec_dir.mkdir(parents=True, exist_ok=True)

    pgvector_url = get_env("AIWORK_PGVECTOR_DB_URL", "").strip()
    if pgvector_url:
        # Mirror into QwenPaw env var so its RAG picks up the same DB
        import os

        os.environ.setdefault("QWENPAW_PGVECTOR_DB_URL", pgvector_url)
        logger.info(
            "pgvector URL bridged: AIWORK_PGVECTOR_DB_URL → QWENPAW_PGVECTOR_DB_URL"
        )

    repo = Path(__file__).resolve().parents[4]
    roots = list(source_roots or [])
    roots.extend(
        [
            repo / "rag",
            wd / "rag",
            Path("~/.aiwork/rag").expanduser(),
        ]
    )

    stats: dict = {"rag_files": 0, "vector_files": 0}
    for root in roots:
        if not root.exists():
            continue
        for src in root.iterdir():
            # vector index files (FAISS .bin / .index)
            if src.suffix in (".bin", ".index", ".faiss"):
                dest = vec_dir / src.name
                if not dest.exists():
                    shutil.copy2(src, dest)
                    stats["vector_files"] += 1
                    logger.info("RAG vector file %s → %s", src.name, dest)
            elif src.suffix in (".json", ".yaml", ".yml", ".pkl"):
                dest = rag_dir / src.name
                if not dest.exists():
                    shutil.copy2(src, dest)
                    stats["rag_files"] += 1
                    logger.info("RAG config/index %s → %s", src.name, dest)

    logger.info("RAG migration done: %s", stats)
    return stats
