# -*- coding: utf-8 -*-
"""Phase 3 — RAG migration + extended governance + skills tests."""
from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

_repo = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(_repo / "packages" / "aiwork-enterprise"))
sys.path.insert(0, str(_repo / "src"))


@pytest.fixture(autouse=True)
def _clean(monkeypatch):
    for k in list(os.environ):
        if k.startswith(("AIWORK_", "QWENPAW_", "COPAW_")):
            monkeypatch.delenv(k, raising=False)
    yield


# ─── Governance: RAG paths present ───────────────────────────────────────────


def test_governance_has_rag_rules(tmp_path, monkeypatch):
    monkeypatch.setenv("AIWORK_WORKING_DIR", str(tmp_path))
    from aiwork_enterprise.governance.presets import ensure_enterprise_policy

    seed = ensure_enterprise_policy()
    text = seed.read_text(encoding="utf-8")
    assert "WORKSPACE_DIR/rag/**" in text
    assert "WORKSPACE_DIR/vector_index/**" in text


def test_governance_creates_rag_dirs(tmp_path, monkeypatch):
    monkeypatch.setenv("AIWORK_WORKING_DIR", str(tmp_path))
    from aiwork_enterprise.governance.presets import ensure_enterprise_policy

    ensure_enterprise_policy()
    assert (tmp_path / "rag").is_dir()
    assert (tmp_path / "vector_index").is_dir()
    assert (tmp_path / "cache" / "biaoshumuban").is_dir()


def test_governance_bidding_rules(tmp_path, monkeypatch):
    monkeypatch.setenv("AIWORK_WORKING_DIR", str(tmp_path))
    from aiwork_enterprise.governance.presets import ensure_enterprise_policy

    seed = ensure_enterprise_policy()
    text = seed.read_text(encoding="utf-8")
    assert "biaoshumuban" in text


def test_governance_env_guard_rules(tmp_path, monkeypatch):
    monkeypatch.setenv("AIWORK_WORKING_DIR", str(tmp_path))
    from aiwork_enterprise.governance.presets import ensure_enterprise_policy

    seed = ensure_enterprise_policy()
    text = seed.read_text(encoding="utf-8")
    assert ".env" in text


# ─── RAG migration helper ─────────────────────────────────────────────────────


def test_rag_migrate_no_sources(tmp_path, monkeypatch):
    monkeypatch.setenv("AIWORK_WORKING_DIR", str(tmp_path))
    from aiwork_enterprise.rag_migrate import migrate_rag_assets

    stats = migrate_rag_assets(source_roots=[])
    assert stats == {"rag_files": 0, "vector_files": 0}
    assert (tmp_path / "rag").is_dir()
    assert (tmp_path / "vector_index").is_dir()


def test_rag_migrate_copies_index(tmp_path, monkeypatch):
    monkeypatch.setenv("AIWORK_WORKING_DIR", str(tmp_path))
    src_dir = tmp_path / "_src"
    src_dir.mkdir()
    (src_dir / "my_index.faiss").write_bytes(b"\x00" * 16)
    (src_dir / "embeddings.json").write_text('{"docs": []}', encoding="utf-8")

    from aiwork_enterprise.rag_migrate import migrate_rag_assets

    stats = migrate_rag_assets(source_roots=[src_dir])
    assert stats["vector_files"] == 1
    assert stats["rag_files"] == 1
    assert (tmp_path / "vector_index" / "my_index.faiss").exists()
    assert (tmp_path / "rag" / "embeddings.json").exists()


def test_rag_migrate_bridges_pgvector(tmp_path, monkeypatch):
    monkeypatch.setenv("AIWORK_WORKING_DIR", str(tmp_path))
    monkeypatch.setenv("AIWORK_PGVECTOR_DB_URL", "postgresql+asyncpg://u:p@db/rag")
    monkeypatch.delenv("QWENPAW_PGVECTOR_DB_URL", raising=False)

    from aiwork_enterprise.rag_migrate import migrate_rag_assets

    migrate_rag_assets(source_roots=[])
    assert os.environ.get("QWENPAW_PGVECTOR_DB_URL") == "postgresql+asyncpg://u:p@db/rag"


# ─── Skills migration with bidding dir ───────────────────────────────────────


def test_skills_migrate_bidding_dir_created(tmp_path, monkeypatch):
    monkeypatch.setenv("AIWORK_WORKING_DIR", str(tmp_path))
    from aiwork_enterprise.skills.migrate import migrate_workspace_skills

    migrate_workspace_skills(source_roots=[])
    assert (tmp_path / "cache" / "biaoshumuban").is_dir()


def test_skills_migrate_copies_skill(tmp_path, monkeypatch):
    monkeypatch.setenv("AIWORK_WORKING_DIR", str(tmp_path))
    src = tmp_path / "_src"
    src.mkdir()
    skill = src / "online-learning-bidding"
    skill.mkdir()
    (skill / "skill.py").write_text("# bidding skill", encoding="utf-8")

    from aiwork_enterprise.skills.migrate import migrate_workspace_skills

    copied = migrate_workspace_skills(source_roots=[src])
    assert len(copied) >= 1
    assert any("online-learning-bidding" in str(p) for p in copied)
