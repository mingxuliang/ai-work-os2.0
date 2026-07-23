# -*- coding: utf-8 -*-
"""Tests for AgentScope 1.x → 2.x runtime compat layer."""
from __future__ import annotations

import importlib
import sys

import pytest


@pytest.fixture()
def fresh_compat(monkeypatch):
    """Reset install flag between tests (modules may stay cached)."""
    import aiwork.compat.agentscope_v1 as compat

    monkeypatch.setattr(compat, "_INSTALLED", False)
    return compat


def test_install_is_idempotent(fresh_compat):
    pytest.importorskip("agentscope")
    s1 = fresh_compat.install()
    s2 = fresh_compat.install()
    assert s1.get("token") or s1.get("already_installed")
    assert s2.get("already_installed") is True


def test_token_session_memory_pipeline_plan_importable(fresh_compat):
    pytest.importorskip("agentscope")
    fresh_compat.install()

    from agentscope.token import TokenCounterBase
    from agentscope.session import SessionBase
    from agentscope.memory import InMemoryMemory
    from agentscope.pipeline import stream_printing_messages
    from agentscope.plan import Plan, PlanNotebook, InMemoryPlanStorage
    from agentscope.plan._plan_notebook import DefaultPlanToHint
    from agentscope.agent import ReActAgent, Agent
    from agentscope.mcp import StatefulClientBase
    from agentscope.message import ToolUseBlock, ImageBlock, AudioBlock
    from agentscope.tool import execute_python_code, view_text_file, write_text_file

    assert TokenCounterBase is not None
    assert SessionBase is not None
    assert InMemoryMemory is not None
    assert callable(stream_printing_messages)
    assert Plan is not None
    assert PlanNotebook is not None
    assert InMemoryPlanStorage is not None
    assert DefaultPlanToHint is not None
    assert ReActAgent is Agent
    assert StatefulClientBase is not None
    assert ToolUseBlock is not None
    assert ImageBlock is not None
    assert AudioBlock is not None
    assert callable(execute_python_code)
    assert callable(view_text_file)
    assert callable(write_text_file)


def test_doctor_check_rows(fresh_compat):
    pytest.importorskip("agentscope")
    rows = fresh_compat.doctor_check()
    assert any(k.startswith("agentscope") for k, _ in rows)
    assert all(not v.startswith("FAIL") for _, v in rows if "agentscope." in _)
