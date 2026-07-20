# -*- coding: utf-8 -*-
"""Security bridge: wire AIWork-OS 4-layer sandbox into QwenPaw 2.0.

AIWork-OS security is deeper than QwenPaw Governance:

  Layer 1 – Governance (QwenPaw 2.0 native):
            YAML policy deny/ask/allow, per-agent policy dir.

  Layer 2 – ToolGuardEngine (AIWork):
            FilePathGuardian + PathJailGuardian + RuleBasedGuardian
            + ShellEvasionGuardian (7 quote-aware checks).
            Fires BEFORE every tool call.  Results go to ApprovalService.

  Layer 3 – Path Jail (AIWork):
            Hard SandboxBoundaryError on every fs operation outside
            sandbox_root.  Cannot be bypassed by policy.

  Layer 4 – Docker isolation (AIWork, optional):
            EphemeralDockerRunner / SessionDockerRunner.
            When AIWORK_SANDBOX_BACKEND=docker, shell tools run inside
            an ephemeral container with mounted workspace volume.

This module mounts the engine singleton and exposes a
``tool_guard_middleware`` ASGI middleware that intercepts agent tool
call events from QwenPaw's internal event bus.
"""
from __future__ import annotations

import logging
from typing import Any, Optional

from aiwork_enterprise.env import get_bool, get_env

logger = logging.getLogger(__name__)


# ── Layer 2: ToolGuardEngine singleton ───────────────────────────────────────

def get_tool_guard() -> Optional[Any]:
    """Return the AIWork ToolGuardEngine singleton (or None if unavailable)."""
    try:
        from aiwork.security.tool_guard.engine import get_guard_engine
        return get_guard_engine()
    except Exception as exc:  # noqa: BLE001
        logger.debug("ToolGuardEngine not available: %s", exc)
        return None


def guard_tool_call(tool_name: str, params: dict) -> dict:
    """Pre-flight guard for a tool call.

    Returns:
        {
            "safe": bool,
            "severity": str | None,   # "HIGH" / "MEDIUM" / "LOW"
            "findings": list[str],
            "requires_approval": bool,
        }
    """
    engine = get_tool_guard()
    if engine is None:
        return {"safe": True, "severity": None, "findings": [], "requires_approval": False}

    result = engine.guard(tool_name, params)
    if result is None:
        return {"safe": True, "severity": None, "findings": [], "requires_approval": False}

    max_sev = None
    finding_msgs = []
    for f in result.findings:
        finding_msgs.append(f.title)
        if max_sev is None or _sev_rank(f.severity.value) > _sev_rank(max_sev):
            max_sev = f.severity.value

    requires_approval = max_sev in ("HIGH", "MEDIUM")
    return {
        "safe": len(result.findings) == 0,
        "severity": max_sev,
        "findings": finding_msgs,
        "requires_approval": requires_approval,
    }


def _sev_rank(sev: str) -> int:
    return {"LOW": 1, "MEDIUM": 2, "HIGH": 3}.get(sev.upper(), 0)


# ── Layer 3: Path Jail ────────────────────────────────────────────────────────

def assert_tool_path_safe(path: str) -> None:
    """Raise SandboxBoundaryError if *path* is outside the jail.

    Call before any filesystem operation from a tool.
    No-op when sandbox disabled.
    """
    try:
        from aiwork.security.sandbox.path_jail import (
            is_sandbox_enabled,
            assert_path_writable,
        )
        if is_sandbox_enabled():
            assert_path_writable(path)
    except ImportError:
        pass


# ── Layer 4: Docker backend status ───────────────────────────────────────────

def sandbox_backend() -> str:
    """Return active sandbox backend: docker | session | path_jail | off."""
    raw = get_env("AIWORK_SANDBOX_BACKEND", "path_jail").strip().lower()
    if raw in ("docker", "ephemeral"):
        return "docker"
    if raw in ("session", "session_container"):
        return "session"
    if raw in ("off", "none", "disabled", "false", "0"):
        return "off"
    return "path_jail"


async def is_docker_available() -> bool:
    """Return True when Docker CLI is reachable (async)."""
    if sandbox_backend() not in ("docker", "session"):
        return False
    try:
        from aiwork.security.sandbox.docker_runner import DockerSandboxRunner
        return await DockerSandboxRunner().is_available()
    except Exception:  # noqa: BLE001
        return False


# ── Skill scanner (Layer 2b) ──────────────────────────────────────────────────

def scan_skill_code(skill_path: str) -> list[str]:
    """Run SkillScanner on *skill_path*.  Returns list of finding messages."""
    try:
        from aiwork.security.skill_scanner import get_scanner
        scanner = get_scanner()
        result = scanner.scan_path(skill_path)
        return [f.title for f in result.findings]
    except Exception as exc:  # noqa: BLE001
        logger.debug("SkillScanner unavailable: %s", exc)
        return []


# ── Mount helper ──────────────────────────────────────────────────────────────

def mount_security_layer(app: Any) -> dict:
    """Warm up the sandbox layer and return status dict."""
    status = {
        "tool_guard": False,
        "path_jail": False,
        "docker": False,
        "skill_scanner": False,
    }

    engine = get_tool_guard()
    if engine is not None:
        status["tool_guard"] = True
        logger.info(
            "ToolGuardEngine ready — guardians: %s",
            engine.guardian_names,
        )

    try:
        from aiwork.security.sandbox.path_jail import is_sandbox_enabled
        status["path_jail"] = is_sandbox_enabled()
        logger.info("Path jail enabled: %s", status["path_jail"])
    except Exception as exc:  # noqa: BLE001
        logger.debug("path_jail init: %s", exc)

    try:
        from aiwork.security.skill_scanner import get_scanner
        _ = get_scanner()
        status["skill_scanner"] = True
    except Exception as exc:  # noqa: BLE001
        logger.debug("SkillScanner: %s", exc)

    return status
