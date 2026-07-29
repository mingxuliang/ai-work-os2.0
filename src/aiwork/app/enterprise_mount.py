# -*- coding: utf-8 -*-
"""Native enterprise mounts for AIWork-OS (forked QwenPaw 2.0 kernel).

Replaces the transitional ``aiwork-enterprise`` overlay package.
"""
from __future__ import annotations

import logging
from typing import Any, Callable, Optional

from fastapi import FastAPI

from .enterprise_env import get_bool, get_env

logger = logging.getLogger(__name__)


def _try_import(path: str) -> Any:
    module_path, attr = path.rsplit(".", 1)
    mod = __import__(module_path, fromlist=[attr])
    return getattr(mod, attr)


def _include(app: FastAPI, router: Any, *, prefix: str = "/api") -> None:
    app.include_router(router, prefix=prefix)
    app.openapi_schema = None


def prioritize_api_before_spa(app: FastAPI) -> int:
    """Move SPA catch-all behind all API routes."""
    routes = app.router.routes
    spa_name = "qwenpaw_console_spa_catchall"
    spa_routes = [r for r in routes if getattr(r, "name", None) == spa_name]
    if not spa_routes:
        # Also accept renamed catch-all after fork branding.
        spa_routes = [
            r
            for r in routes
            if getattr(r, "name", None) in (
                "aiwork_console_spa_catchall",
                "qwenpaw_console_spa_catchall",
            )
        ]
    if not spa_routes:
        return 0
    rest = [
        r
        for r in routes
        if getattr(r, "name", None)
        not in (
            "qwenpaw_console_spa_catchall",
            "aiwork_console_spa_catchall",
        )
    ]
    app.router.routes[:] = rest + spa_routes
    logger.info(
        "Reordered routes: SPA catch-all moved after %d API/static routes",
        len(rest),
    )
    return len(spa_routes)


def mount_security_headers(app: FastAPI) -> bool:
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
    try:
        from aiwork.app.auth_jwt.middleware import JWTAuthMiddleware
        from aiwork.app.auth_jwt import get_router
        from aiwork.app.auth_bridge import JWTAuthStatusBridgeMiddleware

        app.add_middleware(JWTAuthMiddleware)
        app.add_middleware(JWTAuthStatusBridgeMiddleware)
        _include(app, get_router())
        logger.info("Mounted JWT auth + /api/auth/jwt + status bridge")
        return True
    except Exception as exc:  # noqa: BLE001
        logger.warning("JWT auth mount failed: %s", exc)
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
            logger.warning("/api/%s mount failed: %s", name, exc)
    return mounted


def mount_rag(app: FastAPI) -> bool:
    try:
        from aiwork.rag import is_rag_available

        if not is_rag_available():
            return False
        router = _try_import("aiwork.app.routers.rag.router")
        _include(app, router)
        logger.info("Mounted /api/rag")
        return True
    except Exception as exc:  # noqa: BLE001
        logger.warning("rag mount failed: %s", exc)
        return False


def patch_chat_repository() -> bool:
    try:
        from aiwork.app.runner.repo.mysql_chat_repo import (
            patch_qwenpaw_chat_factory,
        )

        return patch_qwenpaw_chat_factory()
    except Exception as exc:  # noqa: BLE001
        logger.warning("Chat repository patch skipped: %s", exc)
        return False


def install_governance_defaults() -> bool:
    try:
        from aiwork.governance.enterprise_presets import ensure_enterprise_policy

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
    """Attach AIWork enterprise features to the forked kernel app."""
    summary: dict = {
        "jwt": False,
        "security_headers": False,
        "governance": False,
        "department": False,
        "minio": [],
        "rag": False,
        "chat_repo_patch": False,
        "spa_reorder": False,
        "memory": None,
        "channels": None,
        "auto_model": False,
    }

    if include_security_headers:
        summary["security_headers"] = mount_security_headers(app)
    if include_jwt:
        summary["jwt"] = mount_jwt_auth(app)

    summary["chat_repo_patch"] = patch_chat_repository()
    summary["governance"] = install_governance_defaults()

    try:
        from aiwork.app.memory_bridge import log_memory_plan
        from aiwork.app.channels_bridge import configure_channel_isolation

        summary["memory"] = log_memory_plan().backend
        summary["channels"] = configure_channel_isolation()
    except Exception as exc:  # noqa: BLE001
        logger.warning("memory/channel bridge skipped: %s", exc)

    if include_business:
        try:
            from aiwork.app.security_bridge import mount_security_layer

            summary["security_layers"] = mount_security_layer(app)
        except Exception as exc:  # noqa: BLE001
            logger.warning("security_bridge skipped: %s", exc)

        summary["department"] = mount_department(app)
        summary["minio"] = mount_minio_routers(app)
        summary["rag"] = mount_rag(app)

    try:
        from aiwork.providers.auto_model import auto_model_enabled

        summary["auto_model"] = auto_model_enabled()
    except Exception as exc:  # noqa: BLE001
        logger.debug("auto_model status skipped: %s", exc)
        summary["auto_model"] = False

    summary["spa_reorder"] = prioritize_api_before_spa(app) > 0

    if on_mounted:
        on_mounted(summary)

    logger.info("Enterprise mount summary: %s", summary)
    return summary
