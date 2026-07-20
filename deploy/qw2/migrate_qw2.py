#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Phase 0-3 data prep for AIWork → QwenPaw 2.0."""
from __future__ import annotations

import argparse
import asyncio
import os
import sys
from pathlib import Path


def _load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())


async def ensure_chat_table(db_url: str) -> None:
    from sqlalchemy.ext.asyncio import create_async_engine
    from sqlalchemy import text

    sql = """
    CREATE TABLE IF NOT EXISTS qw2_chats (
      agent_id VARCHAR(128) NOT NULL,
      user_id VARCHAR(128) NOT NULL DEFAULT '',
      payload JSON NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (agent_id, user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """
    engine = create_async_engine(db_url, pool_pre_ping=True)
    async with engine.begin() as conn:
        await conn.execute(text(sql))
    await engine.dispose()
    print("OK: qw2_chats table ready")


def main() -> int:
    parser = argparse.ArgumentParser(description="AIWork QW2 migrate helper")
    parser.add_argument(
        "--env-file",
        default=str(Path(__file__).with_name(".env.qw2")),
        help="Env file to load",
    )
    parser.add_argument(
        "--skills",
        action="store_true",
        help="Migrate workspace / bidding skills",
    )
    parser.add_argument(
        "--rag",
        action="store_true",
        help="Migrate RAG index files and bridge pgvector URL (Phase 3)",
    )
    parser.add_argument(
        "--chat-table",
        action="store_true",
        help="Create qw2_chats MySQL table",
    )
    parser.add_argument(
        "--governance",
        action="store_true",
        help="Seed enterprise governance defaults",
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Run all migrations",
    )
    args = parser.parse_args()
    _load_dotenv(Path(args.env_file))

    # Ensure packages importable when run from repo
    repo = Path(__file__).resolve().parents[2]
    sys.path.insert(0, str(repo / "packages" / "aiwork-enterprise"))
    sys.path.insert(0, str(repo / "src"))

    run_all = args.all
    if run_all or args.governance:
        from aiwork_enterprise.governance.presets import ensure_enterprise_policy

        path = ensure_enterprise_policy()
        print(f"OK: governance seed → {path}")

    if run_all or args.skills:
        from aiwork_enterprise.skills.migrate import migrate_workspace_skills

        copied = migrate_workspace_skills()
        print(f"OK: skills migrated ({len(copied)} paths)")

    if run_all or args.rag:
        from aiwork_enterprise.rag_migrate import migrate_rag_assets

        stats = migrate_rag_assets()
        print(
            f"OK: RAG assets — rag_files={stats['rag_files']}  "
            f"vector_files={stats['vector_files']}"
        )

    if run_all or args.chat_table:
        db = os.environ.get("AIWORK_JWT_DB_URL", "")
        if not db:
            print("SKIP: AIWORK_JWT_DB_URL not set")
        else:
            asyncio.run(ensure_chat_table(db))

    if not (run_all or args.skills or args.rag or args.chat_table or args.governance):
        parser.print_help()
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
