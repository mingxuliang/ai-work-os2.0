# -*- coding: utf-8 -*-
"""Mount AIWork enterprise routers / middleware onto a QwenPaw FastAPI app."""
from __future__ import annotations

import logging
from typing import Any, Callable, Optional

from fastapi import APIRouter, FastAPI

from .env import get_bool, get_env

logger = logging.getLogger(__name__)


def _try_import(path: str) -> Any:
    module_path, attr = path.rsplit(".", 1)
    mod = __import__(module_path, fromlist=[attr])
    return getattr(mod, attr)


def _include(app: FastAPI, router: Any, *, prefix: str = "/api") -> None:
    app.include_router(router, prefix=prefix)
    # Invalidate cached OpenAPI so new routes appear
    app.openapi_schema = None


def mount_security_headers(app: FastAPI) -> bool:
    """Attach AIWork SecurityHeadersMiddleware when available."""
    if not get_bool("AIWORK_SECURITY_HEADERS", True):
        return False
    try:
        from aiwork.app.security_headers import SecurityHeadersMiddleware

        app.add_middleware(SecurityHeadersMiddleware)
        logger.info("Mounted SecurityHeadersMiddleware")
        return True
    except Exception as exc:  # noqa: BLE001
        logger.warning("SecurityHeadersMiddleware unavailable: %s", exc)
        return False


def mount_jwt_auth(app: FastAPI) -> bool:
    """Attach JWT auth middleware + routers (P0-01 / P0-06)."""
    try:
        from aiwork.app.auth_jwt.middleware import JWTAuthMiddleware
        from aiwork.app.auth_jwt import get_router

        app.add_middleware(JWTAuthMiddleware)
        _include(app, get_router())

        alias = APIRouter(prefix="/auth", tags=["auth"])

        @alias.get("/status")
        async def auth_status_alias():
            return {"mode": "jwt", "enabled": True}

        _include(app, alias)
        logger.info("Mounted JWT auth middleware + /api/auth/jwt + /api/auth/status")
        return True
    except Exception as exc:  # noqa: BLE001
        logger.warning("JWT auth mount failed: %s", exc)
        return False


def mount_token_usage(app: FastAPI) -> bool:
    try:
        router = _try_import("aiwork.app.routers.token_usage.router")
        _include(app, router)
        logger.info("Mounted /api/token-usage")
        return True
    except Exception as exc:  # noqa: BLE001
        logger.warning("token-usage mount failed: %s", exc)
        return False


def mount_department(app: FastAPI) -> bool:
    try:
        router = _try_import("aiwork.app.routers.department.router")
        _include(app, router)
        logger.info("Mounted /api/departments")
        return True
    except Exception as exc:  # noqa: BLE001
        logger.warning("department mount failed: %s", exc)
        return False


def mount_minio_routers(app: FastAPI) -> list[str]:
    """Mount file library / llm output / presale when MinIO configured."""
    mounted: list[str] = []
    endpoint = get_env("AIWORK_MINIO_ENDPOINT", "").strip()
    if not endpoint:
        return mounted

    try:
        from aiwork.file_library import is_minio_available

        if not is_minio_available():
            return mounted
    except Exception as exc:  # noqa: BLE001
        logger.warning("MinIO availability check failed: %s", exc)
        return mounted

    for name, path in (
        ("files", "aiwork.app.routers.file_library.router"),
        ("llm-outputs", "aiwork.app.routers.llm_output.router"),
        ("presale-templates", "aiwork.app.routers.presale_template.router"),
    ):
        try:
            _include(app, _try_import(path))
            mounted.append(name)
            logger.info("Mounted /api/%s", name)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Mount %s failed: %s", name, exc)
    return mounted


def mount_rag(app: FastAPI) -> bool:
    if not get_env("AIWORK_PGVECTOR_DB_URL", "").strip():
        return False
    try:
        from aiwork.rag import is_rag_available

        if not is_rag_available():
            return False
        router = _try_import("aiwork.app.routers.rag.router")
        _include(app, router)
        logger.info("Mounted /api/rag")
        return True
    except Exception as exc:  # noqa: BLE001
        logger.warning("RAG mount failed: %s", exc)
        return False


def patch_chat_repository() -> bool:
    """Replace QwenPaw JsonChatRepository factory with enterprise adapter."""
    try:
        from aiwork_enterprise.storage.mysql_chat_repo import (
            patch_qwenpaw_chat_factory,
        )

        return patch_qwenpaw_chat_factory()
    except Exception as exc:  # noqa: BLE001
        logger.warning("Chat repository patch skipped: %s", exc)
        return False


def install_governance_defaults() -> bool:
    try:
        from aiwork_enterprise.governance.presets import ensure_enterprise_policy

        ensure_enterprise_policy()
        return True
    except Exception as exc:  # noqa: BLE001
        logger.warning("Governance presets skipped: %s", exc)
        return False


def mount_enterprise(
    app: FastAPI,
    *,
    include_jwt: bool = True,
    include_security_headers: bool = True,
    include_business: bool = True,
    on_mounted: Optional[Callable[[dict], None]] = None,
) -> dict:
    """Attach full AIWork enterprise overlay to *app*.

    Returns a summary dict of what was mounted.
    """
    summary: dict = {
        "jwt": False,
        "security_headers": False,
        "token_usage": False,
        "department": False,
        "minio": [],
        "rag": False,
        "chat_repo_patch": False,
        "governance": False,
    }

    if include_security_headers:
        summary["security_headers"] = mount_security_headers(app)
    if include_jwt:
        summary["jwt"] = mount_jwt_auth(app)

    summary["chat_repo_patch"] = patch_chat_repository()
    summary["governance"] = install_governance_defaults()

    try:
        from aiwork_enterprise.memory_bridge import log_memory_plan
        from aiwork_enterprise.channels_bridge import configure_channel_isolation

        summary["memory"] = log_memory_plan().backend
        summary["channels"] = configure_channel_isolation()
    except Exception as exc:  # noqa: BLE001
        logger.warning("memory/channel bridge skipped: %s", exc)

    if include_business:
        summary["token_usage"] = mount_token_usage(app)
        summary["department"] = mount_department(app)
        summary["minio"] = mount_minio_routers(app)
        summary["rag"] = mount_rag(app)

    if on_mounted:
        on_mounted(summary)

    logger.info("Enterprise overlay mount summary: %s", summary)
    return summary
