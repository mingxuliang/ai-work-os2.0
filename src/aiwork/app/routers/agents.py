# -*- coding: utf-8 -*-
"""Multi-agent management API.

Provides RESTful API for managing multiple agent instances.
"""

import json
import logging
from pathlib import Path
from fastapi import APIRouter, Body, HTTPException, Request
from fastapi import Path as PathParam
from pydantic import BaseModel, field_validator

from aiwork.exceptions import (
    AppBaseException,
)

from ..utils import schedule_agent_reload
from ...config.config import (
    AgentProfileConfig,
    AgentProfileRef,
    ModelSlotConfig,
    load_agent_config,
    save_agent_config,
    generate_short_agent_id,
    sanitize_agent_id,
    validate_agent_id,
)
from ...config.utils import load_config, save_config
from ...agents.utils import copy_workspace_md_files, normalize_agent_language
from ...agents.skill_system import SkillPoolService, get_workspace_skills_dir
from ..agent_startup import AgentStartupStatus
from ..multi_agent_manager import MultiAgentManager
from ...constant import WORKING_DIR

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/agents", tags=["agents"])


# ---------------------------------------------------------------------------
# JWT user extraction & ownership helpers (AIWork 1.0 parity)
# ---------------------------------------------------------------------------


def _normalize_user_id(value) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


async def _get_jwt_user_id(request: Request | None) -> str | None:
    """Return authenticated user_id from JWT, with fallback decoding.

    Tries ``request.state.user_id`` first (set by middleware). Falls back to
    decoding the ``Authorization`` header when middleware state did not
    propagate (known Starlette BaseHTTPMiddleware / ``call_next`` issue).
    """
    if request is None:
        return None
    jwt_user = _normalize_user_id(getattr(request.state, "user_id", None))
    if jwt_user:
        return jwt_user

    from ..auth_jwt.jwt_utils import decode_token as jwt_decode_token
    from ..auth_jwt.middleware import JWTAuthMiddleware
    from ..auth_jwt.redis_client import get_session_user_info

    token = JWTAuthMiddleware._extract_token(request)
    if not token:
        return None
    try:
        payload = await jwt_decode_token(token)
    except Exception:
        return None
    if not payload:
        return None

    jti = payload.get("jti", "")
    if jti:
        user_info = await get_session_user_info(jti)
        if user_info:
            return _normalize_user_id(
                user_info.get("user_id") or user_info.get("username"),
            )

    return _normalize_user_id(payload.get("sub") or payload.get("username"))


def _request_is_admin(request: Request | None) -> bool:
    if request is None:
        return False
    roles = getattr(request.state, "roles", None) or []
    return "admin" in {str(r).lower() for r in roles}


async def _resolve_is_admin(request: Request | None, current_user_id: str | None) -> bool:
    """Resolve admin status with DB fallback.

    ``_request_is_admin`` relies on middleware-propagated ``request.state.roles``
    which can be absent in some Starlette setups.  Fall back to a DB role check
    (same pattern used in ``create_agent``) when state-based check returns False.
    """
    if _request_is_admin(request):
        return True
    if not current_user_id:
        return False
    try:
        from ..auth_jwt.database import get_session_factory
        from ..auth_jwt.user_service import get_user_by_id, user_has_role

        user_id_int = int(current_user_id)
        session_factory = get_session_factory()
        async with session_factory() as session:
            user = await get_user_by_id(session, user_id_int)
            if user is not None and user_has_role(user, "admin"):
                return True
    except Exception:  # noqa: BLE001
        pass
    return False


def _check_agent_ownership(
    agent_ref,
    user_id: str | None,
    *,
    is_admin: bool = False,
) -> None:
    """Raise 403 if user does not own the agent.

    Allow access if:
    - caller has admin role (can operate any agent, including shared)
    - agent's user_id matches the current user

    Shared agents (user_id is None) can only be operated by admins;
    regular users only have permission to operate their own agents.
    """
    if is_admin:
        return
    owner = _normalize_user_id(getattr(agent_ref, "user_id", None))
    if (
        user_id is not None
        and owner is not None
        and owner == _normalize_user_id(user_id)
    ):
        return
    raise HTTPException(
        status_code=403,
        detail="Not authorized to access this agent",
    )


class AgentSummary(BaseModel):
    """Agent summary information."""

    id: str
    name: str
    description: str
    workspace_dir: str
    enabled: bool
    pinned: bool
    startup_status: AgentStartupStatus
    active_model: ModelSlotConfig | None = None
    user_id: str | None = None


class AgentListResponse(BaseModel):
    """Response for listing agents."""

    agents: list[AgentSummary]


class ReorderAgentsRequest(BaseModel):
    """Request model for persisting agent order."""

    agent_ids: list[str]


class CreateAgentRequest(BaseModel):
    """Request model for creating a new agent.

    The ``id`` field is optional.  When provided the server uses it as
    the agent identifier (after sanitization); when omitted a random
    short UUID is generated automatically.
    """

    id: str | None = None
    name: str
    description: str = ""
    workspace_dir: str | None = None
    language: str | None = None
    skill_names: list[str] | None = None
    active_model: ModelSlotConfig | None = None

    @field_validator("id", mode="before")
    @classmethod
    def sanitize_id(cls, value: str | None) -> str | None:
        """Strip whitespace from the custom ID."""
        if value is None:
            return None
        if isinstance(value, str):
            sanitized = sanitize_agent_id(value)
            return sanitized if sanitized else None
        return value

    @field_validator("workspace_dir", mode="before")
    @classmethod
    def strip_workspace_dir(cls, value: str | None) -> str | None:
        """Strip accidental whitespace"""
        if value is None:
            return None
        if isinstance(value, str):
            stripped = value.strip()
            return stripped if stripped else None
        return value


def _get_multi_agent_manager(request: Request) -> MultiAgentManager:
    """Get MultiAgentManager from app state."""
    if not hasattr(request.app.state, "multi_agent_manager"):
        raise HTTPException(
            status_code=500,
            detail="MultiAgentManager not initialized",
        )
    return request.app.state.multi_agent_manager


def _normalized_agent_order(config) -> list[str]:
    """Return a deduplicated agent order covering every configured agent."""
    profile_ids = list(config.agents.profiles.keys())
    ordered_ids: list[str] = []

    for agent_id in config.agents.agent_order:
        if agent_id in config.agents.profiles and agent_id not in ordered_ids:
            ordered_ids.append(agent_id)

    for agent_id in profile_ids:
        if agent_id not in ordered_ids:
            ordered_ids.append(agent_id)

    return ordered_ids


def _group_agent_order(config, ordered_ids: list[str]) -> list[str]:
    """Group a complete order by default, pinned, then regular."""
    pinned_ids = [
        agent_id
        for agent_id in ordered_ids
        if agent_id != "default"
        and getattr(config.agents.profiles[agent_id], "pinned", False)
    ]
    regular_ids = [
        agent_id
        for agent_id in ordered_ids
        if agent_id != "default" and agent_id not in pinned_ids
    ]
    default_ids = ["default"] if "default" in ordered_ids else []
    return [*default_ids, *pinned_ids, *regular_ids]


def _display_agent_order(config) -> list[str]:
    """Return stored order grouped by default, pinned, then regular."""
    return _group_agent_order(config, _normalized_agent_order(config))


def _is_valid_display_order(config, agent_ids: list[str]) -> bool:
    """Return whether an order respects default and pinned grouping."""
    return _group_agent_order(config, agent_ids) == agent_ids



@router.get(
    "",
    response_model=AgentListResponse,
    summary="List all agents",
    description="Get list of all configured agents",
)
async def list_agents(request: Request = None) -> AgentListResponse:
    """List configured agents with user isolation.

    Non-admin users only see agents they own and shared agents
    (those without a user_id). Admin users see all agents.
    """
    config = load_config()
    manager = (
        _get_multi_agent_manager(request) if request is not None else None
    )
    ordered_agent_ids = _display_agent_order(config)

    current_user_id = await _get_jwt_user_id(request)
    is_admin = _request_is_admin(request)

    agents = []
    for agent_id in ordered_agent_ids:
        agent_ref = config.agents.profiles[agent_id]
        owner = _normalize_user_id(getattr(agent_ref, "user_id", None))

        # Non-admin logged-in users only see own + shared agents
        if not is_admin and current_user_id:
            if owner is not None and owner != current_user_id:
                continue

        enabled = getattr(agent_ref, "enabled", True)
        pinned = agent_id == "default" or getattr(
            agent_ref,
            "pinned",
            False,
        )
        startup_status = (
            manager.get_agent_startup_status(agent_id, enabled=enabled)
            if manager is not None
            else (
                AgentStartupStatus.PENDING
                if enabled
                else AgentStartupStatus.DISABLED
            )
        )
        try:
            agent_config = load_agent_config(agent_id)
            # Card/list description: only the configured agent description.
            # Do not merge PROFILE.md identity boilerplate (often placeholders).
            description = (agent_config.description or "").strip()

            active_model = agent_config.active_model

            agents.append(
                AgentSummary(
                    id=agent_id,
                    name=agent_config.name,
                    description=description,
                    workspace_dir=agent_ref.workspace_dir,
                    enabled=enabled,
                    pinned=pinned,
                    startup_status=startup_status,
                    active_model=active_model,
                    user_id=owner,
                ),
            )
        except Exception:  # noqa: E722
            agents.append(
                AgentSummary(
                    id=agent_id,
                    name=agent_id.title(),
                    description="",
                    workspace_dir=agent_ref.workspace_dir,
                    enabled=enabled,
                    pinned=pinned,
                    startup_status=startup_status,
                    user_id=owner,
                ),
            )

    return AgentListResponse(agents=agents)


@router.put(
    "/order",
    summary="Persist agent order",
    description="Save the full ordered list of configured agent IDs",
)
async def reorder_agents(
    reorder_request: ReorderAgentsRequest = Body(...),
    request: Request = None,
) -> dict:
    """Persist the ordered list of agent IDs.

    Admin must submit the full configured agent set.
    Non-admin users submit only the agents they can see (own + shared);
    other users' private agents keep their relative positions.
    """
    config = load_config()
    configured_ids = list(config.agents.profiles.keys())
    current_user_id = await _get_jwt_user_id(request)
    is_admin = _request_is_admin(request)

    if len(reorder_request.agent_ids) != len(set(reorder_request.agent_ids)):
        raise HTTPException(
            status_code=400,
            detail="Each agent ID must appear exactly once.",
        )

    if is_admin or not current_user_id:
        if set(reorder_request.agent_ids) != set(configured_ids):
            raise HTTPException(
                status_code=400,
                detail="Each configured agent ID must appear exactly once.",
            )
        new_order = list(reorder_request.agent_ids)
    else:
        visible_ids = [
            aid
            for aid in configured_ids
            if _normalize_user_id(
                getattr(config.agents.profiles[aid], "user_id", None),
            )
            in (None, current_user_id)
        ]
        if set(reorder_request.agent_ids) != set(visible_ids):
            raise HTTPException(
                status_code=400,
                detail=(
                    "Each visible agent ID (owned or shared) must appear "
                    "exactly once."
                ),
            )
        # Merge: replace visible slots in current order with the new sequence
        visible_iter = iter(reorder_request.agent_ids)
        current_order = _normalized_agent_order(config)
        new_order = []
        for aid in current_order:
            owner = _normalize_user_id(
                getattr(config.agents.profiles[aid], "user_id", None),
            )
            if owner in (None, current_user_id):
                new_order.append(next(visible_iter))
            else:
                new_order.append(aid)

    if not _is_valid_display_order(config, new_order):
        raise HTTPException(
            status_code=400,
            detail=(
                "Agent order must keep default first and pinned agents "
                "before unpinned agents."
            ),
        )

    config.agents.agent_order = new_order
    save_config(config)

    return {"success": True, "agent_ids": config.agents.agent_order}


@router.patch(
    "/{agentId}/pin",
    summary="Pin or unpin an agent",
    description="Persist an agent's pinned state in agent selectors",
)
async def set_agent_pinned(
    agentId: str = PathParam(...),
    pinned: bool = Body(..., embed=True),
    request: Request = None,
) -> dict:
    """Persist an agent's pinned state without changing enabled state."""
    config = load_config()

    if agentId not in config.agents.profiles:
        raise HTTPException(
            status_code=404,
            detail=f"Agent '{agentId}' not found",
        )

    if agentId == "default" and not pinned:
        raise HTTPException(
            status_code=400,
            detail="Cannot unpin the default agent",
        )

    agent_ref = config.agents.profiles[agentId]
    current_user_id = await _get_jwt_user_id(request)
    _check_agent_ownership(
        agent_ref,
        current_user_id,
        is_admin=_request_is_admin(request),
    )
    if agentId != "default":
        agent_ref.pinned = pinned
        config.agents.agent_order = _display_agent_order(config)
        save_config(config)

    return {
        "success": True,
        "agent_id": agentId,
        "pinned": True if agentId == "default" else pinned,
    }


@router.get(
    "/{agentId}",
    response_model=AgentProfileConfig,
    summary="Get agent details",
    description="Get complete configuration for a specific agent",
)
async def get_agent(
    request: Request,
    agentId: str = PathParam(...),
) -> AgentProfileConfig:
    """Get agent configuration."""
    config = load_config()

    if agentId not in config.agents.profiles:
        raise HTTPException(
            status_code=404,
            detail=f"Agent '{agentId}' not found",
        )

    agent_ref = config.agents.profiles[agentId]
    current_user_id = await _get_jwt_user_id(request)
    _check_agent_ownership(
        agent_ref,
        current_user_id,
        is_admin=_request_is_admin(request),
    )

    try:
        agent_config = load_agent_config(agentId)
        return agent_config
    except (ValueError, AppBaseException) as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


def _generate_unique_id(existing_ids: set[str]) -> str:
    """Generate a unique random short agent ID.

    Raises:
        HTTPException: If a unique ID could not be generated.
    """
    max_attempts = 10
    for _ in range(max_attempts):
        candidate_id = generate_short_agent_id()
        if candidate_id not in existing_ids:
            return candidate_id
    raise HTTPException(
        status_code=500,
        detail="Failed to generate unique agent ID after 10 attempts",
    )


@router.post(
    "",
    response_model=AgentProfileRef,
    status_code=201,
    summary="Create new agent",
    description="Create a new agent with optional custom ID",
)
async def create_agent(
    request: CreateAgentRequest = Body(...),
    http_request: Request = None,
) -> AgentProfileRef:
    """Create a new agent.

    When ``request.id`` is provided, it is used as the agent identifier
    (validated for URL-safe characters, length, reserved words, and
    uniqueness).  Otherwise a random short UUID is generated.
    """
    config = load_config()
    existing_ids = set(config.agents.profiles.keys())

    if request.id:
        try:
            validate_agent_id(request.id, existing_ids)
        except ValueError as e:
            raise HTTPException(
                status_code=400,
                detail=str(e),
            ) from e
        new_id = request.id
    else:
        new_id = _generate_unique_id(existing_ids)

    workspace_dir = Path(
        request.workspace_dir or f"{WORKING_DIR}/workspaces/{new_id}",
    ).expanduser()
    workspace_dir.mkdir(parents=True, exist_ok=True)

    from ...config.config import (
        ChannelConfig,
        MCPConfig,
        HeartbeatConfig,
        ToolsConfig,
    )

    language = normalize_agent_language(
        request.language or config.agents.language or "en",
    )

    active_model = request.active_model
    if not active_model or not active_model.provider_id:
        try:
            from ...providers import ProviderManager

            global_model = ProviderManager.get_instance().get_active_model()
            if global_model and global_model.provider_id:
                active_model = global_model
        except Exception:
            pass

    current_user_id = await _get_jwt_user_id(http_request)

    # Admin-created agents are shared (user_id=None); verify via DB roles.
    is_admin = _request_is_admin(http_request)
    if current_user_id and not is_admin:
        try:
            from ..auth_jwt.database import get_session_factory
            from ..auth_jwt.user_service import get_user_by_id, user_has_role

            user_id_int = int(current_user_id)
            session_factory = get_session_factory()
            async with session_factory() as session:
                user = await get_user_by_id(session, user_id_int)
                if user is not None and user_has_role(user, "admin"):
                    is_admin = True
        except (ValueError, Exception):
            pass

    bound_user_id = None if is_admin else current_user_id

    agent_config = AgentProfileConfig(
        id=new_id,
        name=request.name,
        description=request.description,
        workspace_dir=str(workspace_dir),
        language=language,
        channels=ChannelConfig(),
        mcp=MCPConfig(),
        heartbeat=HeartbeatConfig(),
        tools=ToolsConfig(),
        active_model=active_model,
        user_id=bound_user_id,
    )

    _initialize_agent_workspace(
        workspace_dir,
        skill_names=(
            request.skill_names if request.skill_names is not None else []
        ),
        language=language,
    )

    agent_ref = AgentProfileRef(
        id=new_id,
        workspace_dir=str(workspace_dir),
        enabled=True,
        user_id=bound_user_id,
    )

    config.agents.profiles[new_id] = agent_ref
    config.agents.agent_order = _normalized_agent_order(config)
    save_config(config)
    save_agent_config(new_id, agent_config)

    logger.info(
        "Created new agent: %s (name=%s, user_id=%s)",
        new_id,
        request.name,
        bound_user_id,
    )

    if http_request is not None:
        manager = _get_multi_agent_manager(http_request)
        manager.schedule_agent_startup(new_id)

    return agent_ref


@router.put(
    "/{agentId}",
    response_model=AgentProfileConfig,
    summary="Update agent",
    description="Update agent configuration and trigger reload",
)
async def update_agent(
    agentId: str = PathParam(...),
    agent_config: AgentProfileConfig = Body(...),
    request: Request = None,
) -> AgentProfileConfig:
    """Update agent configuration."""
    config = load_config()

    if agentId not in config.agents.profiles:
        raise HTTPException(
            status_code=404,
            detail=f"Agent '{agentId}' not found",
        )

    agent_ref = config.agents.profiles[agentId]
    current_user_id = await _get_jwt_user_id(request)
    _check_agent_ownership(
        agent_ref,
        current_user_id,
        is_admin=await _resolve_is_admin(request, current_user_id),
    )

    existing_config = load_agent_config(agentId)

    update_data = agent_config.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        if key not in ("id", "user_id"):
            setattr(existing_config, key, value)

    existing_config.id = agentId
    save_agent_config(agentId, existing_config)
    schedule_agent_reload(request, agentId)

    return agent_config


@router.delete(
    "/{agentId}",
    summary="Delete agent",
    description="Delete agent and workspace (cannot delete default agent)",
)
async def delete_agent(
    agentId: str = PathParam(...),
    request: Request = None,
) -> dict:
    """Delete an agent."""
    config = load_config()

    if agentId not in config.agents.profiles:
        raise HTTPException(
            status_code=404,
            detail=f"Agent '{agentId}' not found",
        )

    if agentId == "default":
        raise HTTPException(
            status_code=400,
            detail="Cannot delete the default agent",
        )

    agent_ref = config.agents.profiles[agentId]
    current_user_id = await _get_jwt_user_id(request)
    _check_agent_ownership(
        agent_ref,
        current_user_id,
        is_admin=await _resolve_is_admin(request, current_user_id),
    )

    manager = _get_multi_agent_manager(request)
    if manager.is_agent_startup_in_progress(agentId):
        raise HTTPException(
            status_code=409,
            detail=f"Agent '{agentId}' cannot be deleted while starting",
        )
    await manager.stop_agent(agentId)

    del config.agents.profiles[agentId]
    config.agents.agent_order = _normalized_agent_order(config)
    save_config(config)

    return {"success": True, "agent_id": agentId}


@router.patch(
    "/{agentId}/toggle",
    summary="Toggle agent enabled state",
    description="Enable or disable an agent (cannot disable default agent)",
)
async def toggle_agent_enabled(
    agentId: str = PathParam(...),
    enabled: bool = Body(..., embed=True),
    request: Request = None,
) -> dict:
    """Toggle agent enabled state."""
    config = load_config()

    if agentId not in config.agents.profiles:
        raise HTTPException(
            status_code=404,
            detail=f"Agent '{agentId}' not found",
        )

    if agentId == "default":
        raise HTTPException(
            status_code=400,
            detail="Cannot disable the default agent",
        )

    agent_ref = config.agents.profiles[agentId]
    current_user_id = await _get_jwt_user_id(request)
    _check_agent_ownership(
        agent_ref,
        current_user_id,
        is_admin=await _resolve_is_admin(request, current_user_id),
    )

    manager = _get_multi_agent_manager(request)

    if not enabled and manager.is_agent_startup_in_progress(agentId):
        raise HTTPException(
            status_code=409,
            detail=(
                f"Agent '{agentId}' is still starting and cannot be "
                f"disabled yet"
            ),
        )

    if not enabled and getattr(agent_ref, "enabled", True):
        await manager.stop_agent(agentId)

    agent_ref.enabled = enabled
    save_config(config)

    if enabled:
        manager.schedule_agent_startup(agentId)

    return {
        "success": True,
        "agent_id": agentId,
        "enabled": enabled,
    }


def _apply_workspace_md_templates(
    workspace_dir: Path,
    language: str,
    *,
    md_template_id: str | None,
) -> None:
    """Copy common and template-specific markdown files for a workspace."""
    copy_workspace_md_files(
        language,
        workspace_dir,
        md_template_id=md_template_id,
    )


def _ensure_heartbeat_file(workspace_dir: Path, language: str) -> None:
    """Create the default HEARTBEAT.md if it is missing."""
    heartbeat_file = workspace_dir / "HEARTBEAT.md"
    if heartbeat_file.exists():
        return

    default_heartbeat_mds = {
        "zh": """# Heartbeat checklist
- 扫描收件箱紧急邮件
- 查看未来 2h 的日历
- 检查待办是否卡住
- 若安静超过 8h，轻量 check-in
""",
        "en": """# Heartbeat checklist
- Scan inbox for urgent email
- Check calendar for next 2h
- Check tasks for blockers
- Light check-in if quiet for 8h
""",
        "ru": """# Heartbeat checklist
- Проверить входящие на срочные письма
- Просмотреть календарь на ближайшие 2 часа
- Проверить задачи на наличие блокировок
- Лёгкая проверка при отсутствии активности более 8 часов
""",
    }
    heartbeat_content = default_heartbeat_mds.get(
        language,
        default_heartbeat_mds["en"],
    )
    with open(heartbeat_file, "w", encoding="utf-8") as file:
        file.write(heartbeat_content.strip())


def _install_initial_skills(
    workspace_dir: Path,
    skill_names: list[str] | None,
) -> None:
    """Install requested initial skills from the skill pool."""
    if not skill_names:
        return

    pool_service = SkillPoolService()
    for skill_name in skill_names:
        try:
            result = pool_service.download_to_workspace(
                skill_name=skill_name,
                workspace_dir=workspace_dir,
                overwrite=False,
            )
            if result.get("success"):
                continue
            logger.warning(
                "Failed to install initial skill %s for %s: %s",
                skill_name,
                workspace_dir,
                result.get("reason", "unknown"),
            )
        except Exception as e:
            logger.warning(
                "Failed to install initial skill %s for %s: %s",
                skill_name,
                workspace_dir,
                e,
            )


def _initialize_agent_workspace(
    workspace_dir: Path,
    skill_names: list[str] | None = None,
    md_template_id: str | None = None,
    language: str | None = None,
) -> None:
    """Initialize agent workspace with only explicitly requested skills."""
    from ...config import load_config as load_global_config

    (workspace_dir / "sessions").mkdir(exist_ok=True)
    (workspace_dir / "memory").mkdir(exist_ok=True)
    get_workspace_skills_dir(workspace_dir).mkdir(exist_ok=True)

    config = load_global_config()
    if not language:
        language = config.agents.language or "zh"

    _apply_workspace_md_templates(
        workspace_dir,
        language,
        md_template_id=md_template_id,
    )
    _ensure_heartbeat_file(workspace_dir, language)
    _install_initial_skills(workspace_dir, skill_names)

    jobs_file = workspace_dir / "jobs.json"
    if not jobs_file.exists():
        with open(jobs_file, "w", encoding="utf-8") as file:
            json.dump(
                {"version": 1, "jobs": []},
                file,
                ensure_ascii=False,
                indent=2,
            )

    chats_file = workspace_dir / "chats.json"
    if not chats_file.exists():
        with open(chats_file, "w", encoding="utf-8") as file:
            json.dump(
                {"version": 1, "chats": []},
                file,
                ensure_ascii=False,
                indent=2,
            )
