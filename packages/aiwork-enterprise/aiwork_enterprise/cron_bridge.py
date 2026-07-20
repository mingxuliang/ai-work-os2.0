# -*- coding: utf-8 -*-
"""Cron bridge: wire AIWork-OS CronManager (APScheduler) into QwenPaw 2.0.

AIWork-OS has three categories of scheduled jobs that QwenPaw 2.0 does NOT
provide natively:

  A. User cron tasks — standard 5-field cron, stored in WORKING_DIR/crons.
     Bridged through SchedulerBridge (scheduler_bridge.py).

  B. Heartbeat job — fires on cron/interval schedule, reads HEARTBEAT.md
     from workspace, dispatches synthetic message to agent runner.
     Keeps agents "alive" even without user messages.

  C. Dream job — fires on cron schedule, triggers ReMe memory.dream()
     for every user workspace sub-directory.  Consolidates long-term memory.

This module exposes:
  - ``get_cron_manager()``   — returns active CronManager for an agent
  - ``mount_cron_router()``  — adds /api/cron routes to FastAPI app
  - ``cron_status()``        — returns heartbeat + dream status dict
"""
from __future__ import annotations

import logging
from typing import Any, Optional

from aiwork_enterprise.env import get_env

logger = logging.getLogger(__name__)


def get_cron_manager(agent_id: str) -> Optional[Any]:
    """Return a live CronManager for *agent_id* if available."""
    try:
        from aiwork.app.workspace import get_workspace_for_agent  # type: ignore
        ws = get_workspace_for_agent(agent_id)
        return getattr(ws, "cron_manager", None)
    except Exception as exc:  # noqa: BLE001
        logger.debug("get_cron_manager(%s): %s", agent_id, exc)
        return None


def mount_cron_router(app: Any) -> bool:
    """Mount AIWork /api/cron routes (heartbeat + dream + user jobs)."""
    try:
        from aiwork.app.crons.api import router
        app.include_router(router, prefix="/api")
        app.openapi_schema = None
        logger.info("Mounted /api/cron (heartbeat, dream, user jobs)")
        return True
    except Exception as exc:  # noqa: BLE001
        logger.warning("cron router mount failed: %s", exc)
        return False


def cron_status() -> dict:
    """Return configuration status of heartbeat + dream features."""
    status: dict = {
        "heartbeat_enabled": False,
        "dream_enabled": False,
        "heartbeat_every": None,
        "dream_cron": None,
    }
    try:
        from aiwork.config import get_heartbeat_config, get_dream_cron  # type: ignore
        hb = get_heartbeat_config(None)
        status["heartbeat_enabled"] = getattr(hb, "enabled", False)
        status["heartbeat_every"] = getattr(hb, "every", None)
        dream = get_dream_cron(None)
        status["dream_enabled"] = bool(dream)
        status["dream_cron"] = dream
    except Exception as exc:  # noqa: BLE001
        logger.debug("cron_status: %s", exc)
    return status


async def trigger_heartbeat(agent_id: str) -> bool:
    """Manually fire one heartbeat for *agent_id*.

    Returns True on success.
    """
    try:
        from aiwork.app.crons.heartbeat import run_heartbeat_once  # type: ignore
        workspace = None
        runner = None
        channel_manager = None

        try:
            from aiwork.app.workspace import get_workspace_for_agent  # type: ignore
            ws = get_workspace_for_agent(agent_id)
            workspace = ws
            runner = getattr(ws, "runner", None)
            channel_manager = getattr(ws, "channel_manager", None)
        except Exception:  # noqa: BLE001
            pass

        await run_heartbeat_once(
            runner=runner,
            channel_manager=channel_manager,
            agent_id=agent_id,
            workspace_dir=getattr(workspace, "workspace_dir", None),
            workspace=workspace,
        )
        logger.info("Manual heartbeat fired for agent=%s", agent_id)
        return True
    except Exception as exc:  # noqa: BLE001
        logger.warning("trigger_heartbeat(%s): %s", agent_id, exc)
        return False


async def trigger_dream(agent_id: str) -> bool:
    """Manually fire one dream (memory consolidation) for *agent_id*.

    Runs ReMe memory.dream() for shared + all user workspaces.
    Returns True on success.
    """
    try:
        from aiwork.app.workspace import get_workspace_for_agent  # type: ignore
        ws = get_workspace_for_agent(agent_id)
        runner = getattr(ws, "runner", None)
        if runner and getattr(runner, "memory_manager", None):
            await runner.memory_manager.dream()
            logger.info("Dream fired (shared) for agent=%s", agent_id)

        workspace_dir = getattr(ws, "workspace_dir", None)
        if workspace_dir:
            users_dir = workspace_dir / "users"
            if users_dir.is_dir():
                for user_dir in users_dir.iterdir():
                    if not user_dir.is_dir():
                        continue
                    try:
                        mm = await ws.get_memory_manager(user_dir.name)
                        await mm.dream()
                        logger.info(
                            "Dream fired user=%s agent=%s",
                            user_dir.name, agent_id,
                        )
                    except Exception as ue:  # noqa: BLE001
                        logger.warning("dream user %s: %s", user_dir.name, ue)
        return True
    except Exception as exc:  # noqa: BLE001
        logger.warning("trigger_dream(%s): %s", agent_id, exc)
        return False
