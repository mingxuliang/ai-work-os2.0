# -*- coding: utf-8 -*-
"""ASGI entry: QwenPaw 2.0 app + AIWork enterprise overlay.

Used by: ``uvicorn aiwork_enterprise.app:app``
"""
from __future__ import annotations
import logging

# Bridge working dir BEFORE importing qwenpaw.constant
from aiwork_enterprise.env import (
    apply_console_static_bridge,
    apply_working_dir_bridge,
    kernel_mode,
)

apply_working_dir_bridge()
apply_console_static_bridge()

if kernel_mode() != "qwenpaw2":
    raise RuntimeError(
        "aiwork_enterprise.app requires AIWORK_KERNEL=qwenpaw2 "
        "(or unset, defaulting to qwenpaw2).",
    )

from contextlib import asynccontextmanager  # noqa: E402

from fastapi import FastAPI  # noqa: E402

logger = logging.getLogger(__name__)

# Try to get existing QwenPaw app lifespan so we can extend it
try:
    from qwenpaw.app._app import app as _qw_app  # noqa: E402

    _original_lifespan = _qw_app.router.lifespan_context
except Exception:  # noqa: BLE001
    _qw_app = None
    _original_lifespan = None


@asynccontextmanager
async def _enterprise_lifespan(app: FastAPI):  # type: ignore[type-arg]
    """Wrap QwenPaw lifespan with enterprise startup/shutdown hooks."""
    if _original_lifespan is not None:
        async with _original_lifespan(app):
            await _on_startup()
            try:
                yield
            finally:
                await _on_shutdown()
    else:
        await _on_startup()
        try:
            yield
        finally:
            await _on_shutdown()


async def _on_startup() -> None:
    from aiwork_enterprise.minio_startup import init_minio_clients

    try:
        minio_status = await init_minio_clients()
        logger.info("MinIO startup: %s", minio_status)
    except Exception as exc:  # noqa: BLE001
        logger.warning("MinIO startup error (non-fatal): %s", exc)


async def _on_shutdown() -> None:
    from aiwork_enterprise.minio_startup import cleanup_minio_sessions

    try:
        await cleanup_minio_sessions()
    except Exception as exc:  # noqa: BLE001
        logger.debug("MinIO cleanup error: %s", exc)


if _qw_app is not None:
    _qw_app.router.lifespan_context = _enterprise_lifespan
    app = _qw_app
else:
    # Fallback: plain FastAPI app when qwenpaw unavailable (test mode)
    app = FastAPI(title="AIWork Enterprise (test mode)", lifespan=_enterprise_lifespan)

from aiwork_enterprise.mount import mount_enterprise  # noqa: E402

_MOUNT_SUMMARY = mount_enterprise(app)
