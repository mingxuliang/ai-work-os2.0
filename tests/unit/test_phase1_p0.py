# -*- coding: utf-8 -*-
"""Phase 1 integration smoke tests — run without live MySQL/Redis.

These confirm that the overlay mount logic imports cleanly and the key
integration paths are wired (mocked where network unavailable).
"""
from __future__ import annotations

import os
import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# Make enterprise + aiwork src importable without install
_repo = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(_repo / "packages" / "aiwork-enterprise"))
sys.path.insert(0, str(_repo / "src"))


@pytest.fixture(autouse=True)
def _clean(monkeypatch):
    for k in list(os.environ):
        if k.startswith(("AIWORK_", "QWENPAW_", "COPAW_")):
            monkeypatch.delenv(k, raising=False)
    yield


# ─── P0-07 Dual-read env ──────────────────────────────────────────────────────


def test_working_dir_bridge(monkeypatch, tmp_path):
    monkeypatch.setenv("AIWORK_WORKING_DIR", str(tmp_path))
    from aiwork_enterprise.env import apply_working_dir_bridge

    result = apply_working_dir_bridge()
    assert result == str(tmp_path)
    assert os.environ["QWENPAW_WORKING_DIR"] == str(tmp_path)


def test_env_dual_read_copaw_fallback(monkeypatch):
    monkeypatch.setenv("COPAW_REDIS_URL", "redis://legacy:6379/0")
    from aiwork_enterprise.env import get_env

    assert get_env("AIWORK_REDIS_URL") == "redis://legacy:6379/0"
    assert get_env("QWENPAW_REDIS_URL") == "redis://legacy:6379/0"


# ─── P0-01/P0-04 Mount helpers (no live server needed) ───────────────────────


def test_mount_security_headers_missing_aiwork():
    """Gracefully skip when aiwork is not in path."""
    from aiwork_enterprise.mount import mount_security_headers
    from fastapi import FastAPI

    app = FastAPI()
    # Should not raise even if aiwork not importable in this context
    result = mount_security_headers(app)
    assert isinstance(result, bool)


def test_mount_jwt_auth_missing_aiwork():
    from aiwork_enterprise.mount import mount_jwt_auth
    from fastapi import FastAPI

    app = FastAPI()
    result = mount_jwt_auth(app)
    assert isinstance(result, bool)


# ─── P0-02 MySQL chat repo adapter ───────────────────────────────────────────


@pytest.mark.asyncio
async def test_mysql_repo_fallback_to_json(monkeypatch, tmp_path):
    """When AIWORK_CHAT_MYSQL is unset, repo falls back to JSON."""
    monkeypatch.setenv("AIWORK_WORKING_DIR", str(tmp_path))
    monkeypatch.delenv("AIWORK_CHAT_MYSQL", raising=False)

    from aiwork_enterprise.storage.mysql_chat_repo import MySQLChatRepository

    # Build a minimal fallback with an async load that returns empty
    fallback = MagicMock()
    fallback.path = tmp_path / "chats.json"

    class _EmptyChatsFile:
        def model_dump(self):
            return {"version": 1, "chats": []}

    fallback.load = AsyncMock(return_value=_EmptyChatsFile())
    fallback.save = AsyncMock()

    repo = MySQLChatRepository(
        agent_id="test-agent",
        workspace_dir=tmp_path,
        fallback=fallback,
        db_url="",
    )

    result = await repo.load()
    fallback.load.assert_called_once()
    assert result is not None


@pytest.mark.asyncio
async def test_mysql_repo_save_delegates_to_fallback(tmp_path):
    from aiwork_enterprise.storage.mysql_chat_repo import MySQLChatRepository

    fallback = MagicMock()
    fallback.save = AsyncMock()

    repo = MySQLChatRepository(
        agent_id="a1",
        workspace_dir=tmp_path,
        fallback=fallback,
        db_url="",
    )

    data = MagicMock()
    data.model_dump = lambda: {"version": 1, "chats": []}
    await repo.save(data)
    fallback.save.assert_called_once_with(data)


# ─── P0-06 Console auth token compat ─────────────────────────────────────────


def test_console_config_ts_has_legacy_keys():
    config_ts = _repo / "console" / "src" / "api" / "config.ts"
    content = config_ts.read_text(encoding="utf-8")
    assert "aiwork_auth_token" in content, "Legacy auth token key should be present"
    assert "qwenpaw_auth_token" in content, "Primary auth token key should be present"
    assert "AUTH_TOKEN_KEY_LEGACY" in content


# ─── P0-03 Token usage router importable ─────────────────────────────────────


def test_token_usage_router_importable():
    try:
        from aiwork.app.routers.token_usage import router  # type: ignore

        assert router is not None
    except ImportError:
        pytest.skip("aiwork not installed in this env")


# ─── Chat protocol compat ─────────────────────────────────────────────────────


def test_chat_protocol_normaliser():
    from aiwork_enterprise.compat.chat_protocol import normalize_stream_event

    # File card pass-through
    ev = {"type": "file_card", "url": "http://x/y"}
    assert normalize_stream_event(ev) == ev

    # Legacy alias mapping
    ev2 = {"event": "stop", "content_delta": ""}
    out = normalize_stream_event(ev2)
    assert out["type"] == "stop"
    assert out["delta"] == ""


# ─── Governance seed ─────────────────────────────────────────────────────────


def test_governance_seed_written(tmp_path, monkeypatch):
    monkeypatch.setenv("AIWORK_WORKING_DIR", str(tmp_path))
    from aiwork_enterprise.governance.presets import ensure_enterprise_policy

    seed = ensure_enterprise_policy()
    assert seed.exists()
    text = seed.read_text(encoding="utf-8")
    assert "WORKSPACE_DIR/cache/**" in text
    assert "WORKSPACE_DIR/skills/**" in text


# ─── Skills migration stub ───────────────────────────────────────────────────


def test_skills_migrate_creates_dirs(tmp_path, monkeypatch):
    monkeypatch.setenv("AIWORK_WORKING_DIR", str(tmp_path))
    from aiwork_enterprise.skills.migrate import migrate_workspace_skills

    copied = migrate_workspace_skills(source_roots=[])
    # No skills found is fine; dirs should exist
    skills_dir = tmp_path / "skills"
    custom_dir = tmp_path / "custom-skills"
    assert skills_dir.is_dir()
    assert custom_dir.is_dir()
