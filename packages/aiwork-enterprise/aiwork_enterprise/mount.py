# -*- coding: utf-8 -*-
"""Mount AIWork enterprise routers / middleware onto a QwenPaw FastAPI app.

Covers every AIWork-OS self-developed feature so the QwenPaw 2.0 kernel
serves the identical API surface as AIWork 1.x.

Mount status map
----------------
✅ = mounted here
↗ = provided by QwenPaw 2.0 natively (no action needed)

Auth / Security
  ✅ JWTAuthMiddleware          mount_jwt_auth()
  ✅ SecurityHeadersMiddleware  mount_security_headers()
  ✅ Tool-guard approval flow   mount_approval()
  ✅ Governance presets         install_governance_defaults()

Enterprise data
  ✅ Token usage                mount_token_usage()
  ✅ Department / org           mount_department()
  ✅ MinIO file library         mount_minio_routers()
  ✅ LLM output (MinIO)         mount_minio_routers()
  ✅ Presale templates (MinIO)  mount_minio_routers()
  ✅ RAG / pgvector             mount_rag()
  ✅ MySQL chat storage         patch_chat_repository()

Agent tooling
  ✅ Agent statistics           mount_agent_stats()
  ✅ Plan mode (SSE)            mount_plan()
  ✅ MCP server mgmt            mount_mcp()
  ✅ Skills pool + streaming    mount_skills()
  ✅ LLM providers mgmt         mount_providers()
  ✅ Env-var store              mount_envs()
  ✅ Backup / restore           mount_backup()

Channels / integrations
  ✅ RSS news proxy             mount_rss_proxy()
  ✅ Voice / Twilio             mount_voice()
  ✅ Local models (llama.cpp)   mount_local_models()

QwenPaw 2.0 native (no mount needed)
  ↗ /api/agents, /api/agent, /api/messages
  ↗ /api/workspace, /api/files, /api/tools
  ↗ /api/settings, /api/config, /api/plugins
"""
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
    app.openapi_schema = None


# ══════════════════════════════════════════════════════════════════════════════
# Auth / Security
# ══════════════════════════════════════════════════════════════════════════════

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
        logger.info("Mounted JWT auth + /api/auth/jwt + /api/auth/status")
        return True
    except Exception as exc:  # noqa: BLE001
        logger.warning("JWT auth mount failed: %s", exc)
        return False


def mount_approval(app: FastAPI) -> bool:
    """Mount tool-guard approval workflow (/api/approval)."""
    try:
        router = _try_import("aiwork.app.routers.approval.router")
        _include(app, router)
        logger.info("Mounted /api/approval")
        return True
    except Exception as exc:  # noqa: BLE001
        logger.warning("approval mount failed: %s", exc)
        return False


# ══════════════════════════════════════════════════════════════════════════════
# Enterprise data routers
# ══════════════════════════════════════════════════════════════════════════════

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


# ══════════════════════════════════════════════════════════════════════════════
# Agent tooling
# ══════════════════════════════════════════════════════════════════════════════

def mount_agent_stats(app: FastAPI) -> bool:
    """Agent statistics dashboard (/api/agent-stats)."""
    try:
        router = _try_import("aiwork.app.routers.agent_stats.router")
        _include(app, router)
        logger.info("Mounted /api/agent-stats")
        return True
    except Exception as exc:  # noqa: BLE001
        logger.warning("agent-stats mount failed: %s", exc)
        return False


def mount_plan(app: FastAPI) -> bool:
    """Plan mode SSE (/api/plan)."""
    try:
        router = _try_import("aiwork.app.routers.plan.router")
        _include(app, router)
        logger.info("Mounted /api/plan")
        return True
    except Exception as exc:  # noqa: BLE001
        logger.warning("plan mount failed: %s", exc)
        return False


def mount_mcp(app: FastAPI) -> bool:
    """MCP server management (/api/mcp)."""
    try:
        router = _try_import("aiwork.app.routers.mcp.router")
        _include(app, router)
        logger.info("Mounted /api/mcp")
        return True
    except Exception as exc:  # noqa: BLE001
        logger.warning("mcp mount failed: %s", exc)
        return False


def mount_skills(app: FastAPI) -> bool:
    """Skill pool management + streaming (/api/skills, /api/skills/stream)."""
    ok = False
    for name, path in (
        ("skills", "aiwork.app.routers.skills.router"),
        ("skills_stream", "aiwork.app.routers.skills_stream.router"),
    ):
        try:
            _include(app, _try_import(path))
            logger.info("Mounted /api/%s", name.replace("_", "/"))
            ok = True
        except Exception as exc:  # noqa: BLE001
            logger.warning("%s mount failed: %s", name, exc)
    return ok


def mount_providers(app: FastAPI) -> bool:
    """LLM providers & model management (/api/providers)."""
    try:
        router = _try_import("aiwork.app.routers.providers.router")
        _include(app, router)
        logger.info("Mounted /api/providers")
        return True
    except Exception as exc:  # noqa: BLE001
        logger.warning("providers mount failed: %s", exc)
        return False


def mount_envs(app: FastAPI) -> bool:
    """Environment variable store (/api/envs)."""
    try:
        router = _try_import("aiwork.app.routers.envs.router")
        _include(app, router)
        logger.info("Mounted /api/envs")
        return True
    except Exception as exc:  # noqa: BLE001
        logger.warning("envs mount failed: %s", exc)
        return False


def mount_backup(app: FastAPI) -> bool:
    """Backup / restore system (/api/backup)."""
    try:
        router = _try_import("aiwork.app.routers.backup.router")
        _include(app, router)
        logger.info("Mounted /api/backup")
        return True
    except Exception as exc:  # noqa: BLE001
        logger.warning("backup mount failed: %s", exc)
        return False


# ══════════════════════════════════════════════════════════════════════════════
# Channels / external integrations
# ══════════════════════════════════════════════════════════════════════════════

def mount_rss_proxy(app: FastAPI) -> bool:
    """RSS news center proxy (/rss/*)."""
    try:
        router = _try_import("aiwork.app.routers.rss_proxy.router")
        # rss_proxy has no /api prefix — mount at root
        app.include_router(router)
        app.openapi_schema = None
        logger.info("Mounted RSS proxy")
        return True
    except Exception as exc:  # noqa: BLE001
        logger.warning("rss_proxy mount failed: %s", exc)
        return False


def mount_voice(app: FastAPI) -> bool:
    """Twilio voice channel (/voice/*)."""
    if not get_env("AIWORK_TWILIO_ACCOUNT_SID", "").strip():
        return False
    try:
        router = _try_import("aiwork.app.routers.voice.voice_router")
        app.include_router(router)
        app.openapi_schema = None
        logger.info("Mounted Twilio voice channel")
        return True
    except Exception as exc:  # noqa: BLE001
        logger.warning("voice mount failed: %s", exc)
        return False


def mount_local_models(app: FastAPI) -> bool:
    """Local LLM management (llama.cpp / GGUF) (/api/local-models)."""
    try:
        router = _try_import("aiwork.app.routers.local_models.router")
        _include(app, router)
        logger.info("Mounted /api/local-models")
        return True
    except Exception as exc:  # noqa: BLE001
        logger.warning("local_models mount failed: %s", exc)
        return False


# ══════════════════════════════════════════════════════════════════════════════
# Storage / governance patches
# ══════════════════════════════════════════════════════════════════════════════

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


# ══════════════════════════════════════════════════════════════════════════════
# Master mount
# ══════════════════════════════════════════════════════════════════════════════

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
        # Auth / security
        "jwt": False,
        "security_headers": False,
        "approval": False,
        "governance": False,
        # Enterprise data
        "token_usage": False,
        "department": False,
        "minio": [],
        "rag": False,
        "chat_repo_patch": False,
        # Agent tooling
        "agent_stats": False,
        "plan": False,
        "mcp": False,
        "skills": False,
        "providers": False,
        "envs": False,
        "backup": False,
        # Channels / integrations
        "rss_proxy": False,
        "voice": False,
        "local_models": False,
        # Bridges
        "memory": None,
        "channels": None,
    }

    # ── Security layer first ──────────────────────────────────────────────────
    if include_security_headers:
        summary["security_headers"] = mount_security_headers(app)
    if include_jwt:
        summary["jwt"] = mount_jwt_auth(app)

    # ── Storage patches & governance ─────────────────────────────────────────
    summary["chat_repo_patch"] = patch_chat_repository()
    summary["governance"] = install_governance_defaults()

    # ── Memory / channel bridges ──────────────────────────────────────────────
    try:
        from aiwork_enterprise.memory_bridge import log_memory_plan
        from aiwork_enterprise.channels_bridge import configure_channel_isolation

        summary["memory"] = log_memory_plan().backend
        summary["channels"] = configure_channel_isolation()
    except Exception as exc:  # noqa: BLE001
        logger.warning("memory/channel bridge skipped: %s", exc)

    if include_business:
        # ── Security tooling ─────────────────────────────────────────────────
        summary["approval"] = mount_approval(app)

        # ── Enterprise data ───────────────────────────────────────────────────
        summary["token_usage"] = mount_token_usage(app)
        summary["department"] = mount_department(app)
        summary["minio"] = mount_minio_routers(app)
        summary["rag"] = mount_rag(app)

        # ── Agent tooling ─────────────────────────────────────────────────────
        summary["agent_stats"] = mount_agent_stats(app)
        summary["plan"] = mount_plan(app)
        summary["mcp"] = mount_mcp(app)
        summary["skills"] = mount_skills(app)
        summary["providers"] = mount_providers(app)
        summary["envs"] = mount_envs(app)
        summary["backup"] = mount_backup(app)

        # ── Channels / integrations ───────────────────────────────────────────
        summary["rss_proxy"] = mount_rss_proxy(app)
        summary["voice"] = mount_voice(app)
        summary["local_models"] = mount_local_models(app)

    if on_mounted:
        on_mounted(summary)

    logger.info("Enterprise overlay mount summary: %s", summary)
    return summary
