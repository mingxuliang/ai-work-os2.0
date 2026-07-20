# -*- coding: utf-8 -*-
"""Tests for security_bridge, cron_bridge, auto_model."""
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


# ─── Security Bridge ──────────────────────────────────────────────────────────


def test_guard_tool_call_no_engine():
    """guard_tool_call returns safe=True when engine unavailable."""
    from aiwork_enterprise.security_bridge import guard_tool_call

    result = guard_tool_call("execute_shell_command", {"command": "ls"})
    assert result["safe"] is True
    assert result["findings"] == []


def test_guard_tool_call_returns_dict():
    from aiwork_enterprise.security_bridge import guard_tool_call

    r = guard_tool_call("read_file", {"path": "/tmp/test.txt"})
    assert "safe" in r
    assert "findings" in r
    assert "requires_approval" in r


def test_sev_rank():
    from aiwork_enterprise.security_bridge import _sev_rank

    assert _sev_rank("HIGH") > _sev_rank("MEDIUM") > _sev_rank("LOW")


def test_sandbox_backend_default():
    from aiwork_enterprise.security_bridge import sandbox_backend

    assert sandbox_backend() == "path_jail"


def test_sandbox_backend_env(monkeypatch):
    monkeypatch.setenv("AIWORK_SANDBOX_BACKEND", "docker")
    # Reimport to pick up env
    import importlib
    import aiwork_enterprise.security_bridge as sb
    importlib.reload(sb)
    assert sb.sandbox_backend() == "docker"


def test_assert_tool_path_safe_no_raise():
    """Should not raise when sandbox disabled."""
    from aiwork_enterprise.security_bridge import assert_tool_path_safe
    assert_tool_path_safe("/tmp/safe_path.txt")


def test_mount_security_layer(monkeypatch, tmp_path):
    from fastapi import FastAPI
    from aiwork_enterprise.security_bridge import mount_security_layer

    app = FastAPI()
    status = mount_security_layer(app)
    assert isinstance(status, dict)
    assert "tool_guard" in status
    assert "path_jail" in status
    assert "docker" in status
    assert "skill_scanner" in status


# ─── Cron Bridge ──────────────────────────────────────────────────────────────


def test_cron_status_returns_dict():
    from aiwork_enterprise.cron_bridge import cron_status

    s = cron_status()
    assert "heartbeat_enabled" in s
    assert "dream_enabled" in s


def test_get_cron_manager_no_workspace():
    from aiwork_enterprise.cron_bridge import get_cron_manager

    # Without workspace, should return None without raising
    result = get_cron_manager("non-existent-agent")
    assert result is None


def test_mount_cron_router():
    from fastapi import FastAPI
    from aiwork_enterprise.cron_bridge import mount_cron_router

    app = FastAPI()
    result = mount_cron_router(app)
    assert isinstance(result, bool)


@pytest.mark.asyncio
async def test_trigger_heartbeat_no_workspace():
    from aiwork_enterprise.cron_bridge import trigger_heartbeat

    result = await trigger_heartbeat("no-such-agent")
    assert result is False  # Graceful failure


@pytest.mark.asyncio
async def test_trigger_dream_no_workspace():
    from aiwork_enterprise.cron_bridge import trigger_dream

    result = await trigger_dream("no-such-agent")
    assert result is False


# ─── Auto Model ───────────────────────────────────────────────────────────────


def test_resolve_model_returns_none_or_str():
    from aiwork_enterprise.auto_model import resolve_model

    result = resolve_model()
    assert result is None or isinstance(result, str)


def test_resolve_model_env_override(monkeypatch):
    monkeypatch.setenv("AIWORK_DEFAULT_MODEL", "gpt-4o-enterprise")
    from aiwork_enterprise.auto_model import resolve_model

    result = resolve_model()
    assert result == "gpt-4o-enterprise"


def test_resolve_model_vision_context(monkeypatch):
    monkeypatch.setenv("AIWORK_DEFAULT_MODEL", "gpt-4-vision")
    from aiwork_enterprise.auto_model import resolve_model

    result = resolve_model(requires_vision=True)
    assert result == "gpt-4-vision"


def test_auto_model_for_request(monkeypatch):
    monkeypatch.setenv("AIWORK_DEFAULT_MODEL", "claude-3-opus")
    from aiwork_enterprise.auto_model import auto_model_for_request

    result = auto_model_for_request({"has_image": True})
    assert result == "claude-3-opus"


def test_auto_model_empty_context():
    from aiwork_enterprise.auto_model import auto_model_for_request

    result = auto_model_for_request({})
    assert result is None or isinstance(result, str)


# ─── Integrated: mount summary keys ──────────────────────────────────────────


def test_mount_enterprise_has_security_and_cron_keys():
    from fastapi import FastAPI
    from aiwork_enterprise.mount import mount_enterprise

    app = FastAPI()
    summary = mount_enterprise(app, include_jwt=False, include_security_headers=False)
    assert "security_layers" in summary
    assert "cron_router" in summary
    assert "cron_status" in summary
    assert "approval" in summary
