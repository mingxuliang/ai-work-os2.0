# -*- coding: utf-8 -*-
"""P1-01/02/03 — MinIO startup initialisation for QwenPaw 2.0 lifespan.

Called from ``aiwork_enterprise.app`` after the QwenPaw lifespan completes
to ensure file library, LLM output and presale MinIO clients are initialised.
"""
from __future__ import annotations

import logging

from aiwork_enterprise.env import get_env

logger = logging.getLogger(__name__)


async def init_minio_clients() -> dict:
    """Initialise all MinIO client pools.  Returns status dict."""
    endpoint = get_env("AIWORK_MINIO_ENDPOINT", "").strip()
    status: dict = {"file_library": False, "llm_output": False, "presale": False}
    if not endpoint:
        logger.debug("AIWORK_MINIO_ENDPOINT not set — MinIO init skipped")
        return status

    for key, init_path in (
        ("file_library", "aiwork.file_library.minio_client.init_minio_client"),
        ("llm_output", "aiwork.llm_output.minio_client.init_minio_client"),
        ("presale", "aiwork.presale_template.service.init_minio_client"),
    ):
        try:
            mod_path, fn = init_path.rsplit(".", 1)
            mod = __import__(mod_path, fromlist=[fn])
            init_fn = getattr(mod, fn, None)
            if callable(init_fn):
                result = init_fn()
                # Some inits are sync, some async — handle both
                if hasattr(result, "__await__"):
                    await result
            status[key] = True
            logger.info("MinIO %s client initialised", key)
        except Exception as exc:  # noqa: BLE001
            logger.warning("MinIO %s init failed: %s", key, exc)
    return status


async def cleanup_minio_sessions() -> None:
    """Best-effort cleanup of expired upload sessions."""
    for cleanup_path in (
        "aiwork.file_library.service.cleanup_expired_sessions",
        "aiwork.presale_template.service.cleanup_expired_sessions",
    ):
        try:
            mod_path, fn = cleanup_path.rsplit(".", 1)
            mod = __import__(mod_path, fromlist=[fn])
            cleanup_fn = getattr(mod, fn, None)
            if callable(cleanup_fn):
                result = cleanup_fn()
                if hasattr(result, "__await__"):
                    await result
        except Exception as exc:  # noqa: BLE001
            logger.debug("MinIO cleanup %s: %s", cleanup_path, exc)
