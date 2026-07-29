# -*- coding: utf-8 -*-
"""Plan Mode API stubs.

AgentScope 2.0 removed the runtime Plan Mode engine, but the Console still
calls these endpoints on boot / agent switch. Provide thin persistence +
SSE stubs so the UI stops 404ing while plan.enabled remains toggable in
agent.json for forward compatibility.
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, AsyncIterator, Optional

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from ..agent_context import get_agent_for_request
from ..utils import schedule_agent_reload

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/plan", tags=["plan"])


class PlanConfigBody(BaseModel):
    enabled: bool = Field(..., description="Whether plan mode is enabled")


@router.get(
    "/config",
    summary="Get Plan Mode config for the current agent",
)
async def get_plan_config(request: Request) -> dict[str, Any]:
    from ...config.config import load_agent_config

    workspace = await get_agent_for_request(request)
    loop = asyncio.get_running_loop()
    config = await loop.run_in_executor(None, load_agent_config, workspace.agent_id)
    return {"enabled": bool(config.plan.enabled)}


@router.put(
    "/config",
    summary="Update Plan Mode config for the current agent",
)
async def update_plan_config(
    body: PlanConfigBody,
    request: Request,
) -> dict[str, Any]:
    from ...config.config import load_agent_config, save_agent_config

    workspace = await get_agent_for_request(request)
    loop = asyncio.get_running_loop()
    config = await loop.run_in_executor(None, load_agent_config, workspace.agent_id)
    config.plan.enabled = body.enabled
    await loop.run_in_executor(None, save_agent_config, config.id, config)
    schedule_agent_reload(request, config.id)
    logger.info(
        "Plan Mode %s for agent %s",
        "enabled" if body.enabled else "disabled",
        config.id,
    )
    return {"enabled": body.enabled}


@router.get(
    "/current",
    summary="Get current plan state (stub; runtime removed in AS 2.0)",
)
async def get_current_plan(
    request: Request,
    session_id: Optional[str] = None,
) -> Any:
    # Keep signature compatible with Console; always no active plan.
    _ = request, session_id
    return None


@router.get(
    "/stream",
    summary="SSE stream for plan updates (keepalive stub)",
)
async def stream_plan_updates(request: Request) -> StreamingResponse:
    _ = request

    async def event_generator() -> AsyncIterator[str]:
        # Initial empty plan so the panel settles without reconnect loops.
        payload = json.dumps({"type": "plan_update", "plan": None})
        yield f"data: {payload}\n\n"
        while True:
            if await request.is_disconnected():
                break
            await asyncio.sleep(25)
            yield ": keepalive\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
