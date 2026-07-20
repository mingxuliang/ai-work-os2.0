# -*- coding: utf-8 -*-
"""Unit tests for QW2 dual-read env helper."""
from __future__ import annotations

import os

import pytest


@pytest.fixture(autouse=True)
def _clean_env(monkeypatch):
    for key in list(os.environ):
        if key.startswith(("AIWORK_", "QWENPAW_", "COPAW_")):
            monkeypatch.delenv(key, raising=False)
    yield


def test_aiwork_preferred_over_qwenpaw(monkeypatch):
    import importlib
    import sys

    root = os.path.join(
        os.path.dirname(__file__),
        "..",
        "..",
        "packages",
        "aiwork-enterprise",
    )
    sys.path.insert(0, os.path.abspath(root))
    from aiwork_enterprise import env as envmod

    importlib.reload(envmod)
    monkeypatch.setenv("QWENPAW_WORKING_DIR", "/tmp/qw")
    monkeypatch.setenv("AIWORK_WORKING_DIR", "/tmp/aw")
    # Explicit AIWORK_* wins when reading AIWORK key
    assert envmod.get_env("AIWORK_WORKING_DIR") == "/tmp/aw"
    # Explicit QWENPAW_* still returns its own value when that key is queried
    assert envmod.get_env("QWENPAW_WORKING_DIR") == "/tmp/qw"


def test_fallback_to_qwenpaw(monkeypatch):
    import sys

    root = os.path.join(
        os.path.dirname(__file__),
        "..",
        "..",
        "packages",
        "aiwork-enterprise",
    )
    sys.path.insert(0, os.path.abspath(root))
    from aiwork_enterprise.env import get_env

    monkeypatch.setenv("QWENPAW_LOG_LEVEL", "debug")
    assert get_env("AIWORK_LOG_LEVEL") == "debug"


def test_apply_working_dir_bridge(monkeypatch):
    import sys

    root = os.path.join(
        os.path.dirname(__file__),
        "..",
        "..",
        "packages",
        "aiwork-enterprise",
    )
    sys.path.insert(0, os.path.abspath(root))
    from aiwork_enterprise.env import apply_working_dir_bridge

    monkeypatch.setenv("AIWORK_WORKING_DIR", "/data/aiwork")
    apply_working_dir_bridge()
    assert os.environ["QWENPAW_WORKING_DIR"] == "/data/aiwork"


def test_normalize_stream_event():
    import sys

    root = os.path.join(
        os.path.dirname(__file__),
        "..",
        "..",
        "packages",
        "aiwork-enterprise",
    )
    sys.path.insert(0, os.path.abspath(root))
    from aiwork_enterprise.compat.chat_protocol import normalize_stream_event

    out = normalize_stream_event({"event": "delta", "text": "hi"})
    assert out["type"] == "delta"
    assert out["content"] == "hi"
