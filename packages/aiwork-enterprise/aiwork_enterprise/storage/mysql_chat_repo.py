# -*- coding: utf-8 -*-
"""MySQL-backed chat repository implementing QwenPaw BaseChatRepository."""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any, Optional

from aiwork_enterprise.env import get_bool, get_env

logger = logging.getLogger(__name__)

_CREATE_SQL = """
CREATE TABLE IF NOT EXISTS qw2_chats (
  agent_id VARCHAR(128) NOT NULL,
  user_id VARCHAR(128) NOT NULL DEFAULT '',
  payload JSON NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (agent_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
"""


class MySQLChatRepository:
    """Persist QwenPaw ChatsFile JSON blobs in MySQL.

    Falls back to the wrapped JSON repository when MySQL is disabled
    or unreachable, so local/dev still works.
    """

    def __init__(
        self,
        *,
        agent_id: str,
        workspace_dir: Path | str,
        user_id: str = "",
        fallback: Any = None,
        db_url: Optional[str] = None,
    ) -> None:
        self.agent_id = agent_id
        self.user_id = user_id or ""
        self._workspace_dir = Path(workspace_dir).expanduser()
        self._fallback = fallback
        self._db_url = db_url or get_env("AIWORK_JWT_DB_URL", "")
        self._engine = None
        self._ready = False

    @property
    def path(self) -> Path:
        if self._fallback is not None and hasattr(self._fallback, "path"):
            return self._fallback.path
        return self._workspace_dir / "chats.json"

    async def _ensure_engine(self) -> bool:
        if self._ready:
            return self._engine is not None
        self._ready = True
        if not get_bool("AIWORK_CHAT_MYSQL", False):
            return False
        if not self._db_url:
            return False
        try:
            from sqlalchemy.ext.asyncio import create_async_engine
            from sqlalchemy import text

            self._engine = create_async_engine(self._db_url, pool_pre_ping=True)
            async with self._engine.begin() as conn:
                await conn.execute(text(_CREATE_SQL))
            return True
        except Exception as exc:  # noqa: BLE001
            logger.warning("MySQL chat repo unavailable: %s", exc)
            self._engine = None
            return False

    async def load(self) -> Any:
        from qwenpaw.app.chats.models import ChatsFile

        if await self._ensure_engine():
            from sqlalchemy import text

            async with self._engine.connect() as conn:  # type: ignore[union-attr]
                row = (
                    await conn.execute(
                        text(
                            "SELECT payload FROM qw2_chats "
                            "WHERE agent_id=:a AND user_id=:u",
                        ),
                        {"a": self.agent_id, "u": self.user_id},
                    )
                ).first()
            if row and row[0] is not None:
                payload = row[0]
                if isinstance(payload, str):
                    payload = json.loads(payload)
                return ChatsFile.model_validate(payload)

        if self._fallback is not None:
            return await self._fallback.load()
        return ChatsFile()

    async def save(self, chats_file: Any) -> None:
        data = (
            chats_file.model_dump()
            if hasattr(chats_file, "model_dump")
            else chats_file
        )
        if await self._ensure_engine():
            from sqlalchemy import text

            payload = json.dumps(data, ensure_ascii=False)
            async with self._engine.begin() as conn:  # type: ignore[union-attr]
                await conn.execute(
                    text(
                        "INSERT INTO qw2_chats (agent_id, user_id, payload) "
                        "VALUES (:a, :u, CAST(:p AS JSON)) "
                        "ON DUPLICATE KEY UPDATE payload=CAST(:p AS JSON)",
                    ),
                    {"a": self.agent_id, "u": self.user_id, "p": payload},
                )
            return

        if self._fallback is not None:
            await self._fallback.save(chats_file)


def patch_qwenpaw_chat_factory() -> bool:
    """Monkey-patch QwenPaw create_chat_service to use MySQLChatRepository."""
    try:
        import qwenpaw.app.workspace.service_factories as factories
    except Exception as exc:  # noqa: BLE001
        logger.warning("Cannot import qwenpaw service_factories: %s", exc)
        return False

    original = factories.create_chat_service

    async def create_chat_service(ws, service):  # type: ignore[no-untyped-def]
        from qwenpaw.app.chats.manager import ChatManager
        from qwenpaw.app.chats.repo.json_repo import JsonChatRepository

        if service is not None:
            return await original(ws, service)

        chats_path = str(ws.workspace_dir / "chats.json")
        json_repo = JsonChatRepository(chats_path)
        repo = MySQLChatRepository(
            agent_id=getattr(ws, "agent_id", "default"),
            workspace_dir=ws.workspace_dir,
            fallback=json_repo,
        )
        cm = ChatManager(repo=repo)
        ws._service_manager.services["chat_manager"] = cm
        logger.info(
            "ChatManager created with enterprise repo (agent=%s)",
            getattr(ws, "agent_id", "?"),
        )
        return cm

    factories.create_chat_service = create_chat_service
    logger.info("Patched qwenpaw create_chat_service → MySQLChatRepository")
    return True
