# -*- coding: utf-8 -*-
"""Chat management API."""
from __future__ import annotations
import logging
from typing import Optional
from uuid import uuid4
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field

from agentscope.message import Msg
from agentscope.state import AgentState

from .session import SafeJSONSession
from .manager import ChatManager, MAX_BATCH_SIZE
from .models import (
    BatchArchiveResult,
    ChatSpec,
    ChatUpdate,
    ChatHistory,
)
from .utils import agentscope_msg_to_message, parse_legacy_memory_state

logger = logging.getLogger(__name__)

from .user_scope import (
    assert_chat_owner,
    get_request_user_id,
    is_admin_request,
    set_scoped_chat_user_id,
)


router = APIRouter(prefix="/chats", tags=["chats"])


async def get_workspace(request: Request):
    """Get the workspace for the active agent."""
    from ..agent_context import get_agent_for_request

    return await get_agent_for_request(request)


async def get_chat_manager(
    request: Request,
) -> ChatManager:
    """Get the chat manager for the active agent.

    Also binds the request JWT user into the per-user chat bucket scope.
    """
    user_id = get_request_user_id(request)
    set_scoped_chat_user_id(user_id)
    workspace = await get_workspace(request)
    return workspace.chat_manager


async def get_session(
    request: Request,
) -> SafeJSONSession:
    """Get the session for the active agent.

    Args:
        request: FastAPI request object

    Returns:
        SafeJSONSession instance for the specified agent

    Raises:
        HTTPException: If session is not initialized
    """
    workspace = await get_workspace(request)
    return workspace.session


@router.get("", response_model=list[ChatSpec])
async def list_chats(
    request: Request,
    user_id: Optional[str] = Query(
        None,
        description="Ignored; always scoped to JWT user",
    ),
    channel: Optional[str] = Query(None, description="Filter by channel"),
    archived: Optional[bool] = Query(
        None,
        description=(
            "Filter by archived status. "
            "false=active only, true=archived only, "
            "null/omit=all (default)"
        ),
    ),
    mgr: ChatManager = Depends(get_chat_manager),
    workspace=Depends(get_workspace),
):
    """List chats for the authenticated user only (hard isolation)."""
    current_uid = get_request_user_id(request)
    set_scoped_chat_user_id(current_uid)
    chats = await mgr.list_chats(
        user_id=current_uid,
        channel=channel,
        archived=archived,
    )
    tracker = workspace.task_tracker
    result = []
    for spec in chats:
        status = await tracker.get_status(spec.id)
        result.append(spec.model_copy(update={"status": status}))
    return result


@router.post("", response_model=ChatSpec)
async def create_chat(
    http_request: Request,
    request: ChatSpec,
    mgr: ChatManager = Depends(get_chat_manager),
):
    """Create a new chat.

    Server generates chat_id (UUID) automatically.

    Args:
        request: Chat creation request
        mgr: Chat manager dependency

    Returns:
        Created chat spec with UUID
    """
    current_uid = get_request_user_id(http_request)
    set_scoped_chat_user_id(current_uid)
    chat_id = str(uuid4())
    spec = ChatSpec(
        id=chat_id,
        name=request.name,
        session_id=request.session_id,
        user_id=current_uid,
        channel=request.channel,
        meta=request.meta,
    )
    return await mgr.create_chat(spec)


@router.post("/batch-delete", response_model=dict)
async def batch_delete_chats(
    request: Request,
    chat_ids: list[str],
    mgr: ChatManager = Depends(get_chat_manager),
):
    """Delete chats by chat IDs.

    Args:
        chat_ids: List of chat IDs
        mgr: Chat manager dependency
    Returns:
        True if deleted, False if failed

    """
    current_uid = get_request_user_id(request)
    set_scoped_chat_user_id(current_uid)
    is_admin = is_admin_request(request)
    allowed: list[str] = []
    for cid in chat_ids:
        spec = await mgr.get_chat(cid)
        if not spec:
            continue
        if str(spec.user_id) == current_uid or is_admin:
            allowed.append(cid)
    chat_ids = allowed
    deleted = await mgr.delete_chats(chat_ids=chat_ids)
    return {"deleted": deleted}


# ----- Archive endpoints -----


class BatchChatIds(BaseModel):
    """Request body for batch archive/unarchive."""

    chat_ids: list[str] = Field(
        ...,
        max_length=MAX_BATCH_SIZE,
        description="List of chat IDs to process",
    )


@router.post("/actions/batch-archive", response_model=BatchArchiveResult)
async def batch_archive_chats(
    request: Request,
    payload: BatchChatIds,
    mgr: ChatManager = Depends(get_chat_manager),
    workspace=Depends(get_workspace),
):
    """Batch archive chats. Running chats are skipped."""
    current_uid = get_request_user_id(request)
    set_scoped_chat_user_id(current_uid)
    is_admin = is_admin_request(request)
    allowed_ids: list[str] = []
    for cid in payload.chat_ids:
        spec = await mgr.get_chat(cid)
        if not spec:
            continue
        if str(spec.user_id) == current_uid or is_admin:
            allowed_ids.append(cid)
    payload = BatchChatIds(chat_ids=allowed_ids)
    tracker = workspace.task_tracker
    return await mgr.batch_archive(
        chat_ids=payload.chat_ids,
        get_status=tracker.get_status,
    )


@router.post("/actions/batch-unarchive", response_model=BatchArchiveResult)
async def batch_unarchive_chats(
    request: Request,
    payload: BatchChatIds,
    mgr: ChatManager = Depends(get_chat_manager),
):
    """Batch unarchive chats."""
    current_uid = get_request_user_id(request)
    set_scoped_chat_user_id(current_uid)
    is_admin = is_admin_request(request)
    allowed_ids: list[str] = []
    for cid in payload.chat_ids:
        spec = await mgr.get_chat(cid)
        if not spec:
            continue
        if str(spec.user_id) == current_uid or is_admin:
            allowed_ids.append(cid)
    payload = BatchChatIds(chat_ids=allowed_ids)
    return await mgr.batch_unarchive(chat_ids=payload.chat_ids)


@router.post("/{chat_id}/archive", response_model=ChatSpec)
async def archive_chat(
    chat_id: str,
    request: Request,
    mgr: ChatManager = Depends(get_chat_manager),
    workspace=Depends(get_workspace),
):
    """Archive a single chat. Idempotent.

    Returns 409 if the chat is currently running.
    """
    current_uid = get_request_user_id(request)
    set_scoped_chat_user_id(current_uid)
    existing = await mgr.get_chat(chat_id)
    if not existing:
        raise HTTPException(status_code=404, detail=f"Chat not found: {chat_id}")
    assert_chat_owner(existing, user_id=current_uid, allow_admin=True, is_admin=is_admin_request(request))
    status = await workspace.task_tracker.get_status(chat_id)
    try:
        result = await mgr.archive_chat(chat_id, check_status=status)
    except ValueError as e:
        raise HTTPException(
            status_code=409,
            detail="Chat is currently in progress, cannot archive",
        ) from e
    if result is None:
        raise HTTPException(
            status_code=404,
            detail=f"Chat not found: {chat_id}",
        )
    return result


@router.post("/{chat_id}/unarchive", response_model=ChatSpec)
async def unarchive_chat(
    chat_id: str,
    request: Request,
    mgr: ChatManager = Depends(get_chat_manager),
):
    """Unarchive a single chat. Idempotent."""
    current_uid = get_request_user_id(request)
    set_scoped_chat_user_id(current_uid)
    existing = await mgr.get_chat(chat_id)
    if not existing:
        raise HTTPException(status_code=404, detail=f"Chat not found: {chat_id}")
    assert_chat_owner(existing, user_id=current_uid, allow_admin=True, is_admin=is_admin_request(request))
    result = await mgr.unarchive_chat(chat_id)
    if result is None:
        raise HTTPException(
            status_code=404,
            detail=f"Chat not found: {chat_id}",
        )
    return result


# ----- Existing CRUD endpoints -----


@router.get("/{chat_id}", response_model=ChatHistory)
async def get_chat(
    chat_id: str,
    request: Request,
    mgr: ChatManager = Depends(get_chat_manager),
    session: SafeJSONSession = Depends(get_session),
    workspace=Depends(get_workspace),
):
    """Get detailed information about a specific chat by UUID.

    Args:
        request: FastAPI request (for agent context)
        chat_id: Chat UUID
        mgr: Chat manager dependency
        session: SafeJSONSession dependency

    Returns:
        ChatHistory with messages and status (idle/running)

    Raises:
        HTTPException: If chat not found (404)
    """
    # The Console keeps a temporary numeric session_id as its UI id while
    # the repository stores a UUID. Accept either form so history refreshes
    # cannot fail with 404 after a streamed reply completes.
    current_uid = get_request_user_id(request)
    set_scoped_chat_user_id(current_uid)
    is_admin = is_admin_request(request)

    resolved_chat_id = chat_id
    chat_spec = await mgr.get_chat(resolved_chat_id)
    if not chat_spec:
        mapped_chat_id = await mgr.get_chat_id_by_session(
            session_id=chat_id,
            channel="console",
            user_id=current_uid,
        )
        if mapped_chat_id:
            resolved_chat_id = mapped_chat_id
            chat_spec = await mgr.get_chat(resolved_chat_id)
    if not chat_spec:
        raise HTTPException(
            status_code=404,
            detail=f"Chat not found: {chat_id}",
        )
    assert_chat_owner(
        chat_spec,
        user_id=current_uid,
        allow_admin=True,
        is_admin=is_admin,
    )

    state = await session.get_session_state_dict(
        chat_spec.session_id,
        chat_spec.user_id,
        chat_spec.channel,
    )
    status = await workspace.task_tracker.get_status(resolved_chat_id)
    if not state:
        return ChatHistory(messages=[], status=status)

    agent_raw = state.get("agent", {})
    memories: list[Msg] = []

    state_raw = agent_raw.get("state")
    if isinstance(state_raw, dict):
        try:
            agent_state = AgentState.model_validate(state_raw)
            memories = list(agent_state.context)
        except Exception:
            logger.debug(
                "Failed to parse agent.state, falling back to legacy",
                exc_info=True,
            )

    # Legacy fallback: 1.x ``agent.memory`` format.
    if not memories:
        memory_raw = agent_raw.get("memory", {})
        if memory_raw:
            memories, _summary = parse_legacy_memory_state(memory_raw)

    messages = agentscope_msg_to_message(memories)
    return ChatHistory(messages=messages, status=status)


@router.put("/{chat_id}", response_model=ChatSpec)
async def update_chat(
    chat_id: str,
    request: Request,
    spec: ChatUpdate,
    mgr: ChatManager = Depends(get_chat_manager),
):
    """Update an existing chat.

    Args:
        chat_id: Chat UUID
        spec: Partial chat update payload
        mgr: Chat manager dependency

    Returns:
        Updated chat spec

    Raises:
        HTTPException: If chat not found (404)
    """
    current_uid = get_request_user_id(request)
    set_scoped_chat_user_id(current_uid)
    existing = await mgr.get_chat(chat_id)
    if not existing:
        raise HTTPException(status_code=404, detail=f"Chat not found: {chat_id}")
    assert_chat_owner(existing, user_id=current_uid, allow_admin=True, is_admin=is_admin_request(request))
    updated = await mgr.patch_chat(chat_id, spec)
    if updated is None:
        raise HTTPException(
            status_code=404,
            detail=f"Chat not found: {chat_id}",
        )
    return updated


@router.delete("/{chat_id}", response_model=dict)
async def delete_chat(
    chat_id: str,
    request: Request,
    mgr: ChatManager = Depends(get_chat_manager),
):
    """Delete a chat by UUID.

    Note: This only deletes the chat spec (UUID mapping).
    JSONSession state is NOT deleted.

    Args:
        chat_id: Chat UUID
        mgr: Chat manager dependency

    Returns:
        True if deleted, False if failed

    Raises:
        HTTPException: If chat not found (404)
    """
    current_uid = get_request_user_id(request)
    set_scoped_chat_user_id(current_uid)
    existing = await mgr.get_chat(chat_id)
    if not existing:
        raise HTTPException(status_code=404, detail=f"Chat not found: {chat_id}")
    assert_chat_owner(existing, user_id=current_uid, allow_admin=True, is_admin=is_admin_request(request))
    deleted = await mgr.delete_chats(chat_ids=[chat_id])
    if not deleted:
        raise HTTPException(
            status_code=404,
            detail=f"Chat not found: {chat_id}",
        )
    return {"deleted": True}
