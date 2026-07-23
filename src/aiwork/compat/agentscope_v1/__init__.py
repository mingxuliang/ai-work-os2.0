# -*- coding: utf-8 -*-
"""Runtime AgentScope 1.x → 2.x compatibility layer.

QwenPaw 2.0 ships ``agentscope==2.0.x``, which removed several 1.x modules
(``token``, ``session``, ``memory``, ``pipeline``, ``plan``) and renamed
symbols (``ReActAgent`` → ``Agent``, ``ToolUseBlock`` → ``ToolCallBlock``).

AIWork-OS enterprise routers still import the 1.x surface.  Call
:func:`install` **once** before importing those routers.  Injection uses
``sys.modules`` / attribute aliases only — it never writes into site-packages,
so upgrades of ``agentscope`` remain safe.
"""
from __future__ import annotations

import logging
import sys
import types
from typing import Any

logger = logging.getLogger(__name__)

_INSTALLED = False


def install() -> dict[str, bool]:
    """Inject AgentScope 1.x shims into the running process.

    Idempotent.  Returns a status map of what was installed/patched.
    """
    global _INSTALLED
    status: dict[str, bool] = {}

    try:
        import agentscope  # noqa: F401
    except ImportError as exc:
        logger.warning("agentscope not installed — skip v1 compat: %s", exc)
        return {"agentscope": False}

    if _INSTALLED:
        return {"already_installed": True}

    status["token"] = _install_token()
    status["session"] = _install_session()
    status["memory"] = _install_memory()
    status["pipeline"] = _install_pipeline()
    status["plan"] = _install_plan()
    status["agent_aliases"] = _patch_agent()
    status["mcp_aliases"] = _patch_mcp()
    status["message_aliases"] = _patch_message()
    status["tool_aliases"] = _patch_tool()

    _INSTALLED = True
    logger.info("AgentScope 1.x compat installed: %s", status)
    return status


def is_installed() -> bool:
    return _INSTALLED


def doctor_check() -> list[tuple[str, str]]:
    """Return (name, status) rows for ``aiwork-qw2 doctor``."""
    rows: list[tuple[str, str]] = []
    try:
        import agentscope

        ver = getattr(agentscope, "__version__", "?")
        rows.append(("agentscope", str(ver)))
    except Exception as exc:  # noqa: BLE001
        rows.append(("agentscope", f"MISSING ({exc})"))
        return rows

    probes = [
        ("agentscope.token.TokenCounterBase", "agentscope.token", "TokenCounterBase"),
        ("agentscope.session.SessionBase", "agentscope.session", "SessionBase"),
        ("agentscope.memory.InMemoryMemory", "agentscope.memory", "InMemoryMemory"),
        ("agentscope.pipeline.stream_printing_messages", "agentscope.pipeline", "stream_printing_messages"),
        ("agentscope.plan.Plan", "agentscope.plan", "Plan"),
        ("agentscope.agent.ReActAgent", "agentscope.agent", "ReActAgent"),
        ("agentscope.mcp.StatefulClientBase", "agentscope.mcp", "StatefulClientBase"),
        ("agentscope.message.ToolUseBlock", "agentscope.message", "ToolUseBlock"),
        ("agentscope.tool.execute_python_code", "agentscope.tool", "execute_python_code"),
    ]
    # Ensure shims present before probing
    install()
    for label, mod_name, attr in probes:
        try:
            mod = __import__(mod_name, fromlist=[attr])
            obj = getattr(mod, attr)
            rows.append((label, "OK" if obj is not None else "MISSING"))
        except Exception as exc:  # noqa: BLE001
            rows.append((label, f"FAIL ({exc})"))
    return rows


# ── module installers ─────────────────────────────────────────────────────────


def _register_module(name: str, module: types.ModuleType) -> None:
    sys.modules[name] = module
    parent_name, _, child = name.rpartition(".")
    if parent_name:
        parent = sys.modules.get(parent_name)
        if parent is not None:
            setattr(parent, child, module)


def _install_token() -> bool:
    if "agentscope.token" in sys.modules:
        return True
    from . import token as token_mod

    _register_module("agentscope.token", token_mod)
    return True


def _install_session() -> bool:
    if "agentscope.session" in sys.modules:
        return True
    from . import session as session_mod

    _register_module("agentscope.session", session_mod)
    return True


def _install_memory() -> bool:
    if "agentscope.memory" in sys.modules:
        return True
    from . import memory as memory_mod

    _register_module("agentscope.memory", memory_mod)
    return True


def _install_pipeline() -> bool:
    if "agentscope.pipeline" in sys.modules:
        return True
    from . import pipeline as pipeline_mod

    _register_module("agentscope.pipeline", pipeline_mod)
    return True


def _install_plan() -> bool:
    if "agentscope.plan" in sys.modules and hasattr(sys.modules["agentscope.plan"], "Plan"):
        return True
    from . import plan as plan_pkg
    from .plan import _plan_notebook, _plan_stub

    _register_module("agentscope.plan", plan_pkg)
    _register_module("agentscope.plan._plan_notebook", _plan_notebook)
    _register_module("agentscope.plan._plan_stub", _plan_stub)
    return True


def _patch_agent() -> bool:
    import agentscope.agent as agent_mod

    if not hasattr(agent_mod, "ReActAgent"):
        agent_mod.ReActAgent = agent_mod.Agent  # type: ignore[attr-defined]
    if "agentscope.agent._react_agent" not in sys.modules:
        from . import _react_agent as react_shim

        _register_module("agentscope.agent._react_agent", react_shim)
    # Keep public __all__ discoverable
    all_list = list(getattr(agent_mod, "__all__", []))
    if "ReActAgent" not in all_list:
        all_list.append("ReActAgent")
        agent_mod.__all__ = all_list  # type: ignore[attr-defined]
    return True


def _patch_mcp() -> bool:
    import agentscope.mcp as mcp_mod

    if not hasattr(mcp_mod, "StatefulClientBase"):

        class StatefulClientBase:  # noqa: D401
            """Stub for agentscope 1.x StatefulClientBase."""

        mcp_mod.StatefulClientBase = StatefulClientBase  # type: ignore[attr-defined]
    return True


def _patch_message() -> bool:
    import agentscope.message as msg_mod

    if not hasattr(msg_mod, "ToolUseBlock") and hasattr(msg_mod, "ToolCallBlock"):
        msg_mod.ToolUseBlock = msg_mod.ToolCallBlock  # type: ignore[attr-defined]
    data = getattr(msg_mod, "DataBlock", None)
    if data is not None:
        if not hasattr(msg_mod, "ImageBlock"):
            msg_mod.ImageBlock = data  # type: ignore[attr-defined]
        if not hasattr(msg_mod, "VideoBlock"):
            msg_mod.VideoBlock = data  # type: ignore[attr-defined]
        if not hasattr(msg_mod, "AudioBlock"):
            msg_mod.AudioBlock = data  # type: ignore[attr-defined]
    return True


def _patch_tool() -> bool:
    import agentscope.tool as tool_mod

    if not hasattr(tool_mod, "execute_python_code"):

        async def execute_python_code(code: str, **_kwargs: Any) -> str:
            import os
            import subprocess
            import tempfile

            with tempfile.NamedTemporaryFile(
                suffix=".py",
                delete=False,
                mode="w",
                encoding="utf-8",
            ) as fh:
                fh.write(code)
                fname = fh.name
            try:
                result = subprocess.run(
                    [sys.executable, fname],
                    capture_output=True,
                    text=True,
                    timeout=30,
                    check=False,
                )
                return (result.stdout or "") + (result.stderr or "")
            except Exception as exc:  # noqa: BLE001
                return str(exc)
            finally:
                try:
                    os.unlink(fname)
                except OSError:
                    pass

        tool_mod.execute_python_code = execute_python_code  # type: ignore[attr-defined]

    if not hasattr(tool_mod, "view_text_file"):

        def view_text_file(path: str, **_kwargs: Any) -> str:
            try:
                with open(path, encoding="utf-8", errors="replace") as fh:
                    return fh.read()
            except Exception as exc:  # noqa: BLE001
                return str(exc)

        tool_mod.view_text_file = view_text_file  # type: ignore[attr-defined]

    if not hasattr(tool_mod, "write_text_file"):

        def write_text_file(path: str, content: str, **_kwargs: Any) -> bool:
            try:
                with open(path, "w", encoding="utf-8") as fh:
                    fh.write(content)
                return True
            except Exception:  # noqa: BLE001
                return False

        tool_mod.write_text_file = write_text_file  # type: ignore[attr-defined]
    return True


__all__ = ["install", "is_installed", "doctor_check"]
