# -*- coding: utf-8 -*-
"""Tests for SPA / API route ordering helper."""
from __future__ import annotations

from fastapi import FastAPI
from starlette.routing import Route

from aiwork.app.enterprise_mount import prioritize_api_before_spa


def test_prioritize_api_before_spa_moves_catchall_last():
    app = FastAPI()

    async def spa(request):  # noqa: ARG001
        return None

    async def api_files(request):  # noqa: ARG001
        return None

    # Simulate QwenPaw registering SPA before enterprise API mounts
    app.router.routes.append(
        Route("/{full_path:path}", spa, name="qwenpaw_console_spa_catchall"),
    )
    app.router.routes.append(Route("/api/files/{path:path}", api_files, name="files"))

    moved = prioritize_api_before_spa(app)
    assert moved == 1
    names = [getattr(r, "name", None) for r in app.router.routes]
    assert names[-1] == "qwenpaw_console_spa_catchall"
    assert "files" in names
    assert names.index("files") < names.index("qwenpaw_console_spa_catchall")


def test_prioritize_api_before_spa_noop_without_spa():
    app = FastAPI()
    app.router.routes.append(Route("/api/ping", lambda r: None, name="ping"))
    assert prioritize_api_before_spa(app) == 0
