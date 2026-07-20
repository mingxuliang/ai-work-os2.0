# -*- coding: utf-8 -*-
"""Phase 2 P1 enterprise API mount tests.

Validates MinIO / LLM-output / presale / department / channel / scheduler
bridges without a live network.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

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


# ─── P1-01/02/03 MinIO gate ───────────────────────────────────────────────────


def test_mount_minio_skipped_without_env():
    """mount_minio_routers returns empty list when endpoint not set."""
    from fastapi import FastAPI
    from aiwork_enterprise.mount import mount_minio_routers

    app = FastAPI()
    result = mount_minio_routers(app)
    assert result == []


def test_mount_minio_skipped_env_empty(monkeypatch):
    monkeypatch.setenv("AIWORK_MINIO_ENDPOINT", "")
    from fastapi import FastAPI
    from aiwork_enterprise.mount import mount_minio_routers

    result = mount_minio_routers(FastAPI())
    assert result == []


# ─── P1-04/05 Department + token-usage mount ─────────────────────────────────


def test_mount_department():
    from fastapi import FastAPI
    from aiwork_enterprise.mount import mount_department

    app = FastAPI()
    result = mount_department(app)
    assert isinstance(result, bool)


def test_mount_token_usage():
    from fastapi import FastAPI
    from aiwork_enterprise.mount import mount_token_usage

    app = FastAPI()
    result = mount_token_usage(app)
    assert isinstance(result, bool)


# ─── P1-06 Channel isolation config ──────────────────────────────────────────


def test_channel_isolation_config_keys():
    from aiwork_enterprise.channels_bridge import configure_channel_isolation

    cfg = configure_channel_isolation()
    assert "lock_prefix" in cfg
    assert cfg["lock_prefix"].startswith("aiwork:")
    assert "bus_prefix" in cfg


def test_channel_redis_fallback_warning(monkeypatch, caplog):
    monkeypatch.delenv("AIWORK_REDIS_URL", raising=False)
    import logging
    import aiwork_enterprise.channels_bridge as cb

    with caplog.at_level(logging.WARNING, logger="aiwork_enterprise.channels_bridge"):
        cfg = cb.configure_channel_isolation()
    assert "degrade to local" in caplog.text or cfg["redis_url"] == ""


# ─── P1-07 Scheduler bridge primary ──────────────────────────────────────────


def test_scheduler_bridge_primary_default():
    from aiwork_enterprise.scheduler_bridge import get_scheduler_bridge

    bridge = get_scheduler_bridge()
    assert bridge.primary in ("qwenpaw", "aiwork")


@pytest.mark.asyncio
async def test_scheduler_bridge_list_jobs_empty():
    from aiwork_enterprise.scheduler_bridge import SchedulerBridge

    bridge = SchedulerBridge()
    jobs = await bridge.list_jobs()
    assert isinstance(jobs, list)


# ─── P1-08 Memory plan ───────────────────────────────────────────────────────


def test_memory_plan_default():
    from aiwork_enterprise.memory_bridge import resolve_memory_plan

    plan = resolve_memory_plan()
    assert plan.backend in ("reme", "mem0", "hybrid", "scroll")


def test_memory_plan_override(monkeypatch):
    monkeypatch.setenv("AIWORK_MEMORY_BACKEND", "mem0")
    from aiwork_enterprise import memory_bridge
    import importlib

    importlib.reload(memory_bridge)
    plan = memory_bridge.resolve_memory_plan()
    assert plan.backend == "mem0"


# ─── P1 MinIO startup helpers ────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_minio_startup_skips_without_endpoint(monkeypatch):
    monkeypatch.delenv("AIWORK_MINIO_ENDPOINT", raising=False)
    from aiwork_enterprise.minio_startup import init_minio_clients

    status = await init_minio_clients()
    assert status == {"file_library": False, "llm_output": False, "presale": False}


@pytest.mark.asyncio
async def test_minio_cleanup_no_raise():
    from aiwork_enterprise.minio_startup import cleanup_minio_sessions

    # Must not raise even when aiwork not installed
    await cleanup_minio_sessions()


# ─── Enterprise mount summary keys ───────────────────────────────────────────


def test_mount_enterprise_returns_summary():
    from fastapi import FastAPI
    from aiwork_enterprise.mount import mount_enterprise

    app = FastAPI()
    summary = mount_enterprise(app, include_jwt=False, include_security_headers=False)
    expected_keys = {"jwt", "security_headers", "token_usage", "department", "minio", "rag",
                     "chat_repo_patch", "governance"}
    assert expected_keys.issubset(set(summary.keys()))
