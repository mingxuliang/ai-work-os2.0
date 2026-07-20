# -*- coding: utf-8 -*-
"""Bridge AIWork MySQL cron / scheduler with QwenPaw 2.0 cron (P1-07)."""
from __future__ import annotations

import logging
from typing import Any, Optional

from aiwork_enterprise.env import get_bool

logger = logging.getLogger(__name__)


class SchedulerBridge:
    """Dual-write / read-through bridge.

    Phase 2: prefer QwenPaw cron as primary when ``AIWORK_SCHEDULER_QW2=1``.
    Legacy AIWork MySQL scheduler remains readable until cutover.
    """

    def __init__(self) -> None:
        self.primary = (
            "qwenpaw" if get_bool("AIWORK_SCHEDULER_QW2", True) else "aiwork"
        )
        self.dual_write = get_bool("AIWORK_SCHEDULER_DUAL_WRITE", False)

    async def list_jobs(self) -> list[dict[str, Any]]:
        jobs: list[dict[str, Any]] = []
        if self.primary == "qwenpaw":
            jobs.extend(await self._list_qwenpaw())
        else:
            jobs.extend(await self._list_aiwork())
        return jobs

    async def _list_qwenpaw(self) -> list[dict[str, Any]]:
        try:
            # Best-effort: inspect default cron manager if already started
            from qwenpaw.app.crons.manager import CronManager  # type: ignore

            _ = CronManager
            logger.debug("QwenPaw CronManager import OK")
        except Exception as exc:  # noqa: BLE001
            logger.debug("QwenPaw cron not ready: %s", exc)
        return []

    async def _list_aiwork(self) -> list[dict[str, Any]]:
        try:
            from aiwork.scheduler import list_jobs  # type: ignore

            return list(await list_jobs())  # type: ignore[misc]
        except Exception as exc:  # noqa: BLE001
            logger.debug("AIWork scheduler unavailable: %s", exc)
            return []

    async def create_job(self, spec: dict[str, Any]) -> Optional[str]:
        logger.info(
            "SchedulerBridge.create_job primary=%s dual_write=%s spec_keys=%s",
            self.primary,
            self.dual_write,
            list(spec.keys()),
        )
        # Concrete create paths are wired when both managers are live in-process.
        return None


def get_scheduler_bridge() -> SchedulerBridge:
    return SchedulerBridge()
