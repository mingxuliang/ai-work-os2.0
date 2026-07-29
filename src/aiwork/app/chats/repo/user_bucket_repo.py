# -*- coding: utf-8 -*-
"""Per-user chat bucket repository (file + optional MySQL).

Hard isolation: each user has an independent ChatsFile payload.
Legacy shared ``chats.json`` is only used for one-time migration into
the caller's bucket.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Optional

from ..models import ChatSpec, ChatsFile
from ..user_scope import get_scoped_chat_user_id
from .base import BaseChatRepository
from .json_repo import JsonChatRepository

logger = logging.getLogger(__name__)


def user_bucket_path(workspace_dir: Path | str, user_id: str) -> Path:
    safe = "".join(c if c.isalnum() or c in "-_" else "_" for c in (user_id or "anonymous"))
    return Path(workspace_dir).expanduser() / f"chats_user_{safe}.json"


class UserBucketChatRepository(BaseChatRepository):
    """Route load/save to a per-user bucket selected by contextvar."""

    def __init__(
        self,
        *,
        agent_id: str,
        workspace_dir: Path | str,
        legacy_path: Path | str | None = None,
        enable_mysql: bool = False,
        db_url: str = "",
    ) -> None:
        self.agent_id = agent_id
        self._workspace_dir = Path(workspace_dir).expanduser()
        self._legacy_path = (
            Path(legacy_path).expanduser()
            if legacy_path
            else self._workspace_dir / "chats.json"
        )
        self._enable_mysql = enable_mysql
        self._db_url = db_url or ""
        self._engine = None
        self._mysql_ready = False
        self._migrated_users: set[str] = set()

    @property
    def path(self) -> Path:
        uid = get_scoped_chat_user_id() or "anonymous"
        return user_bucket_path(self._workspace_dir, uid)

    def _json_repo_for(self, user_id: str) -> JsonChatRepository:
        return JsonChatRepository(user_bucket_path(self._workspace_dir, user_id))

    async def _ensure_mysql(self) -> bool:
        if not self._enable_mysql or not self._db_url:
            return False
        if self._mysql_ready:
            return self._engine is not None
        self._mysql_ready = True
        try:
            from sqlalchemy import text
            from sqlalchemy.ext.asyncio import create_async_engine

            self._engine = create_async_engine(self._db_url, pool_pre_ping=True)
            async with self._engine.begin() as conn:
                await conn.execute(
                    text(
                        """
                        CREATE TABLE IF NOT EXISTS qw2_chats (
                          agent_id VARCHAR(128) NOT NULL,
                          user_id VARCHAR(128) NOT NULL DEFAULT '',
                          payload JSON NOT NULL,
                          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                            ON UPDATE CURRENT_TIMESTAMP,
                          PRIMARY KEY (agent_id, user_id)
                        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                        """
                    )
                )
            return True
        except Exception as exc:  # noqa: BLE001
            logger.warning("User-bucket MySQL unavailable: %s", exc)
            self._engine = None
            return False

    async def _load_mysql(self, user_id: str) -> Optional[ChatsFile]:
        if not await self._ensure_mysql():
            return None
        from sqlalchemy import text

        async with self._engine.connect() as conn:  # type: ignore[union-attr]
            row = (
                await conn.execute(
                    text(
                        "SELECT payload FROM qw2_chats "
                        "WHERE agent_id=:a AND user_id=:u"
                    ),
                    {"a": self.agent_id, "u": user_id},
                )
            ).first()
        if not row or row[0] is None:
            return None
        payload = row[0]
        if isinstance(payload, str):
            payload = json.loads(payload)
        return ChatsFile.model_validate(payload)

    async def _save_mysql(self, user_id: str, chats_file: ChatsFile) -> bool:
        if not await self._ensure_mysql():
            return False
        from sqlalchemy import text

        payload = json.dumps(chats_file.model_dump(mode="json"), ensure_ascii=False)
        async with self._engine.begin() as conn:  # type: ignore[union-attr]
            await conn.execute(
                text(
                    "INSERT INTO qw2_chats (agent_id, user_id, payload) "
                    "VALUES (:a, :u, CAST(:p AS JSON)) "
                    "ON DUPLICATE KEY UPDATE payload=CAST(:p AS JSON)"
                ),
                {"a": self.agent_id, "u": user_id, "p": payload},
            )
        return True

    async def _migrate_from_legacy(self, user_id: str) -> ChatsFile:
        empty = ChatsFile(version=1, chats=[])
        if not user_id or user_id in self._migrated_users:
            return empty
        if not self._legacy_path.exists():
            self._migrated_users.add(user_id)
            return empty
        try:
            legacy = await JsonChatRepository(self._legacy_path).load()
        except Exception:  # noqa: BLE001
            logger.warning("Failed reading legacy chats.json", exc_info=True)
            self._migrated_users.add(user_id)
            return empty

        owned = [c for c in legacy.chats if str(c.user_id) == user_id]
        self._migrated_users.add(user_id)
        if not owned:
            return empty
        migrated = ChatsFile(version=getattr(legacy, "version", 1) or 1, chats=owned)
        await self._json_repo_for(user_id).save(migrated)
        await self._save_mysql(user_id, migrated)
        logger.info(
            "Migrated %d chats for user=%s agent=%s into user bucket",
            len(owned),
            user_id,
            self.agent_id,
        )
        return migrated

    async def load(self) -> ChatsFile:
        user_id = get_scoped_chat_user_id()
        if not user_id:
            logger.warning("chat load without scoped user_id; returning empty")
            return ChatsFile(version=1, chats=[])

        mysql_cf = await self._load_mysql(user_id)
        if mysql_cf is not None and mysql_cf.chats:
            return mysql_cf

        file_repo = self._json_repo_for(user_id)
        cf = await file_repo.load()
        if cf.chats:
            await self._save_mysql(user_id, cf)
            return cf

        return await self._migrate_from_legacy(user_id)

    async def save(self, chats_file: ChatsFile) -> None:
        user_id = get_scoped_chat_user_id()
        if not user_id:
            raise RuntimeError("Refusing to save chats without scoped user_id")
        fixed: list[ChatSpec] = []
        for c in chats_file.chats:
            if str(c.user_id) != user_id:
                c = c.model_copy(update={"user_id": user_id})
            fixed.append(c)
        out = ChatsFile(version=chats_file.version, chats=fixed)
        await self._json_repo_for(user_id).save(out)
        await self._save_mysql(user_id, out)
