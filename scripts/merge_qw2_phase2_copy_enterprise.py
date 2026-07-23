# -*- coding: utf-8 -*-
"""Phase 2: copy enterprise modules from legacy + overlay into forked aiwork."""
from __future__ import annotations

import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LEGACY = ROOT / "src" / "_legacy_aiwork_1x"
DEST = ROOT / "src" / "aiwork"
OVERLAY = ROOT / "packages" / "aiwork-enterprise" / "aiwork_enterprise"

# (src relative to LEGACY or absolute OVERLAY path, dest relative to DEST)
COPIES: list[tuple[Path, Path]] = [
    (LEGACY / "app" / "auth_jwt", DEST / "app" / "auth_jwt"),
    (LEGACY / "app" / "security_headers.py", DEST / "app" / "security_headers.py"),
    (LEGACY / "app" / "routers" / "department.py", DEST / "app" / "routers" / "department.py"),
    (LEGACY / "app" / "routers" / "file_library.py", DEST / "app" / "routers" / "file_library.py"),
    (LEGACY / "app" / "routers" / "llm_output.py", DEST / "app" / "routers" / "llm_output.py"),
    (LEGACY / "app" / "routers" / "presale_template.py", DEST / "app" / "routers" / "presale_template.py"),
    (LEGACY / "app" / "routers" / "rag.py", DEST / "app" / "routers" / "rag.py"),
    (LEGACY / "file_library", DEST / "file_library"),
    (LEGACY / "rag", DEST / "rag"),
    (LEGACY / "llm_output", DEST / "llm_output"),
    (LEGACY / "presale_template", DEST / "presale_template"),
    (LEGACY / "department", DEST / "department"),
    # Overlay helpers → native package paths
    (OVERLAY / "auth_bridge.py", DEST / "app" / "auth_bridge.py"),
    (OVERLAY / "minio_startup.py", DEST / "app" / "minio_startup.py"),
    (OVERLAY / "memory_bridge.py", DEST / "app" / "memory_bridge.py"),
    (OVERLAY / "channels_bridge.py", DEST / "app" / "channels_bridge.py"),
    (OVERLAY / "security_bridge.py", DEST / "app" / "security_bridge.py"),
    (OVERLAY / "cron_bridge.py", DEST / "app" / "cron_bridge.py"),
    (OVERLAY / "storage" / "mysql_chat_repo.py", DEST / "app" / "runner" / "repo" / "mysql_chat_repo.py"),
    (OVERLAY / "governance" / "presets.py", DEST / "governance" / "enterprise_presets.py"),
]


def copy_one(src: Path, dst: Path) -> None:
    if not src.exists():
        print(f"SKIP missing {src}")
        return
    dst.parent.mkdir(parents=True, exist_ok=True)
    if src.is_dir():
        if dst.exists():
            shutil.rmtree(dst)
        shutil.copytree(src, dst)
    else:
        shutil.copy2(src, dst)
    print(f"OK {src.relative_to(ROOT)} -> {dst.relative_to(ROOT)}")


def rewrite_overlay_imports(path: Path) -> None:
    if not path.is_file() or path.suffix != ".py":
        return
    text = path.read_text(encoding="utf-8")
    new = text
    new = new.replace("from aiwork_enterprise.env import", "from aiwork.app.enterprise_env import")
    new = new.replace("import aiwork_enterprise.env", "import aiwork.app.enterprise_env")
    new = new.replace("aiwork_enterprise.auth_bridge", "aiwork.app.auth_bridge")
    new = new.replace("aiwork_enterprise.minio_startup", "aiwork.app.minio_startup")
    new = new.replace("aiwork_enterprise.memory_bridge", "aiwork.app.memory_bridge")
    new = new.replace("aiwork_enterprise.channels_bridge", "aiwork.app.channels_bridge")
    new = new.replace("aiwork_enterprise.security_bridge", "aiwork.app.security_bridge")
    new = new.replace("aiwork_enterprise.cron_bridge", "aiwork.app.cron_bridge")
    new = new.replace(
        "aiwork_enterprise.governance.presets",
        "aiwork.governance.enterprise_presets",
    )
    new = new.replace(
        "aiwork_enterprise.storage.mysql_chat_repo",
        "aiwork.app.runner.repo.mysql_chat_repo",
    )
    new = new.replace("from aiwork_enterprise.", "from aiwork.")
    if new != text:
        path.write_text(new, encoding="utf-8", newline="\n")
        print(f"rewrote imports: {path.relative_to(ROOT)}")


def main() -> None:
    for src, dst in COPIES:
        copy_one(src, dst)
        if dst.is_file():
            rewrite_overlay_imports(dst)
        else:
            for p in dst.rglob("*.py"):
                rewrite_overlay_imports(p)
    print("phase2 copy done")


if __name__ == "__main__":
    main()
