# -*- coding: utf-8 -*-
"""Skills market catalog: scan MinIO, cache locally, install into skill pool."""

from __future__ import annotations

import json
import logging
import re
import shutil
import tempfile
import time
from pathlib import Path
from typing import Any
from urllib.parse import unquote

import frontmatter

from ...constant import WORKING_DIR
from ...exceptions import SkillsError
from .market_minio import (
    get_skills_market_minio,
    is_skills_market_configured,
)
from .pool_service import _register_pool_skill_entry
from .registry import ensure_skill_pool_initialized
from .store import (
    build_import_conflict,
    default_pool_manifest,
    get_pool_skill_manifest_path,
    get_skill_pool_dir,
    import_skill_dir,
    mutate_json,
    normalize_skill_dir_name,
    read_skill_pool_manifest,
    scan_skill_dir_or_raise,
    suggest_conflict_name,
)

logger = logging.getLogger(__name__)

_CATALOG_SCHEMA = "skill-market-catalog.v1"
_DEFAULT_TTL_SECONDS = 3600
_MAX_DESCRIPTION_PREVIEW = 400
_MAX_INSTRUCTION_LINES = 4


class SkillsMarketUnavailable(RuntimeError):
    """Raised when MinIO market is not configured or unreachable."""


def get_skill_market_dir() -> Path:
    return Path(WORKING_DIR) / "skill_market"


def get_catalog_path() -> Path:
    return get_skill_market_dir() / "catalog.json"


def _ttl_seconds() -> int:
    from ...constant import EnvVarLoader

    return EnvVarLoader.get_int(
        "AIWORK_SKILLS_MARKET_CATALOG_TTL",
        _DEFAULT_TTL_SECONDS,
        min_value=60,
    )


def _parse_skill_md(raw: bytes) -> dict[str, Any]:
    text = raw.decode("utf-8", errors="replace")
    try:
        post = frontmatter.loads(text)
    except Exception:
        return {
            "name": "",
            "description": "",
            "version": "",
            "license": "",
            "body": text,
            "instructions": [],
        }
    meta = post.metadata if isinstance(post.metadata, dict) else {}
    name = str(meta.get("name") or "").strip()
    description = str(meta.get("description") or "").strip()
    version = str(meta.get("version") or "").strip()
    license_ = str(meta.get("license") or "").strip()
    body = str(post.content or "").strip()
    instructions: list[str] = []
    for line in body.splitlines():
        cleaned = line.strip().lstrip("#").strip()
        if not cleaned:
            continue
        if cleaned.startswith("---"):
            continue
        instructions.append(cleaned)
        if len(instructions) >= _MAX_INSTRUCTION_LINES:
            break
    if not instructions and description:
        instructions = [description]
    return {
        "name": name,
        "description": description,
        "version": version,
        "license": license_,
        "body": body,
        "instructions": instructions,
    }


def _author_from_folder(folder: str) -> tuple[str, str]:
    if "__" in folder:
        author, _, rest = folder.partition("__")
        author = author.strip() or folder
        handle = f"@{author}"
        return author, handle
    return folder, f"@{folder}"


def _empty_catalog() -> dict[str, Any]:
    return {
        "schema_version": _CATALOG_SCHEMA,
        "synced_at": 0,
        "bucket": "",
        "skills": [],
    }


def _read_catalog_file() -> dict[str, Any]:
    path = get_catalog_path()
    if not path.exists():
        return _empty_catalog()
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            return _empty_catalog()
        if not isinstance(data.get("skills"), list):
            data["skills"] = []
        return data
    except Exception:
        logger.warning("Failed to read skill market catalog", exc_info=True)
        return _empty_catalog()


def _write_catalog_file(payload: dict[str, Any]) -> None:
    root = get_skill_market_dir()
    root.mkdir(parents=True, exist_ok=True)
    path = get_catalog_path()
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    tmp.replace(path)


def _catalog_is_fresh(catalog: dict[str, Any]) -> bool:
    synced_at = float(catalog.get("synced_at") or 0)
    if synced_at <= 0:
        return False
    return (time.time() - synced_at) < _ttl_seconds()


def build_catalog_from_minio() -> dict[str, Any]:
    """Scan MinIO and rebuild the local catalog (blocking I/O)."""
    client = get_skills_market_minio()
    if client is None:
        raise SkillsMarketUnavailable("MinIO is not configured")
    if not client.bucket_exists():
        raise SkillsMarketUnavailable(
            f"Skills market bucket '{client.bucket}' does not exist",
        )

    skills: list[dict[str, Any]] = []
    for object_key, obj in client.list_skill_md_keys():
        parts = object_key.strip("/").split("/")
        category = parts[0]
        folder = parts[1]
        skill_id = f"{category}/{folder}"
        object_prefix = f"{category}/{folder}"
        try:
            raw = client.get_object_bytes(object_key)
            parsed = _parse_skill_md(raw)
        except Exception:
            logger.warning(
                "Failed to read market skill %s",
                object_key,
                exc_info=True,
            )
            parsed = {
                "name": folder,
                "description": "",
                "version": "",
                "license": "",
                "instructions": [],
            }

        display_name = parsed["name"] or folder
        description = parsed["description"] or ""
        author, author_handle = _author_from_folder(folder)
        updated_at = ""
        last_modified = getattr(obj, "last_modified", None)
        if last_modified is not None:
            try:
                updated_at = last_modified.isoformat()
            except Exception:
                updated_at = str(last_modified)

        tags = [category] if category else []
        skills.append(
            {
                "id": skill_id,
                "category": category,
                "folder": folder,
                "name": display_name,
                "description": description[:_MAX_DESCRIPTION_PREVIEW],
                "version": parsed.get("version") or "",
                "license": parsed.get("license") or "",
                "author": author,
                "author_handle": author_handle,
                "object_prefix": object_prefix,
                "updated_at": updated_at,
                "tags": tags,
                "instructions": parsed.get("instructions") or (
                    [description] if description else []
                ),
            },
        )

    skills.sort(key=lambda s: (s["category"], s["name"].lower()))
    catalog = {
        "schema_version": _CATALOG_SCHEMA,
        "synced_at": time.time(),
        "bucket": client.bucket,
        "count": len(skills),
        "skills": skills,
    }
    _write_catalog_file(catalog)
    logger.info(
        "Skills market catalog refreshed: %s skills from bucket=%s",
        len(skills),
        client.bucket,
    )
    return catalog


def ensure_catalog(*, force: bool = False) -> dict[str, Any]:
    """Return catalog, refreshing when missing/stale or ``force``."""
    if not is_skills_market_configured():
        raise SkillsMarketUnavailable("MinIO is not configured")
    catalog = _read_catalog_file()
    if force or not _catalog_is_fresh(catalog) or not catalog.get("skills"):
        return build_catalog_from_minio()
    return catalog


def list_categories(catalog: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    data = catalog or ensure_catalog()
    counts: dict[str, int] = {}
    for item in data.get("skills") or []:
        cat = str(item.get("category") or "").strip() or "其他"
        counts[cat] = counts.get(cat, 0) + 1
    return [
        {"id": name, "name": name, "count": counts[name]}
        for name in sorted(counts.keys(), key=lambda n: (-counts[n], n))
    ]


def find_skill(
    skill_id: str,
    catalog: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    decoded = unquote(skill_id).strip().strip("/")
    data = catalog or ensure_catalog()
    for item in data.get("skills") or []:
        if item.get("id") == decoded:
            return item
    return None


def list_skills(
    *,
    q: str = "",
    category: str = "",
    page: int = 1,
    page_size: int = 48,
    catalog: dict[str, Any] | None = None,
) -> dict[str, Any]:
    data = catalog or ensure_catalog()
    skills = list(data.get("skills") or [])
    cat = category.strip()
    if cat and cat.lower() not in {"all", "*"}:
        skills = [s for s in skills if s.get("category") == cat]
    query = q.strip().lower()
    if query:
        filtered: list[dict[str, Any]] = []
        for s in skills:
            hay = " ".join(
                [
                    str(s.get("name") or ""),
                    str(s.get("description") or ""),
                    str(s.get("author") or ""),
                    str(s.get("folder") or ""),
                    " ".join(s.get("tags") or []),
                ],
            ).lower()
            if query in hay:
                filtered.append(s)
        skills = filtered

    page = max(1, int(page or 1))
    page_size = min(200, max(1, int(page_size or 48)))
    total = len(skills)
    start = (page - 1) * page_size
    end = start + page_size
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "synced_at": data.get("synced_at"),
        "bucket": data.get("bucket"),
        "items": skills[start:end],
    }


def _ensure_skill_md_importable(
    skill_dir: Path,
    *,
    fallback_name: str,
    fallback_description: str,
) -> None:
    """Guarantee SKILL.md has name+description so ``import_skill_dir`` succeeds."""
    skill_md = skill_dir / "SKILL.md"
    if not skill_md.exists():
        raise SkillsError(message="Downloaded skill is missing SKILL.md")
    text = skill_md.read_text(encoding="utf-8", errors="replace")
    try:
        post = frontmatter.loads(text)
    except Exception:
        post = frontmatter.Post(
            text,
            **{
                "name": fallback_name,
                "description": fallback_description or fallback_name,
            },
        )
    meta = dict(post.metadata) if isinstance(post.metadata, dict) else {}
    if not str(meta.get("name") or "").strip():
        meta["name"] = fallback_name
    if not str(meta.get("description") or "").strip():
        meta["description"] = fallback_description or fallback_name
    post.metadata = meta
    skill_md.write_text(frontmatter.dumps(post), encoding="utf-8")


def install_market_skill(
    skill_id: str,
    *,
    target_name: str = "",
) -> dict[str, Any]:
    """Download one market skill into the local skill pool."""
    client = get_skills_market_minio()
    if client is None:
        raise SkillsMarketUnavailable("MinIO is not configured")

    entry = find_skill(skill_id)
    if entry is None:
        raise LookupError(f"Skill not found in market catalog: {skill_id}")

    ensure_skill_pool_initialized()
    pool_dir = get_skill_pool_dir()
    desired = (target_name or entry.get("name") or entry.get("folder") or "").strip()
    desired = re.sub(r"\s+", "-", desired)
    try:
        skill_name = normalize_skill_dir_name(desired)
    except SkillsError:
        skill_name = normalize_skill_dir_name(
            re.sub(r"\s+", "-", str(entry.get("folder") or "skill")),
        )

    manifest = read_skill_pool_manifest()
    existing_names = set(manifest.get("skills", {}).keys()) | {
        p.name
        for p in pool_dir.iterdir()
        if pool_dir.exists() and p.is_dir()
    }
    if skill_name in existing_names or (pool_dir / skill_name).exists():
        conflict = build_import_conflict(skill_name, existing_names)
        return {
            "installed": False,
            "conflicts": [conflict],
            "suggested_name": suggest_conflict_name(skill_name),
            "name": skill_name,
        }

    tmp_root = Path(tempfile.mkdtemp(prefix="aiwork_skill_market_"))
    skill_dir = tmp_root / skill_name
    try:
        client.download_prefix_to_dir(
            str(entry.get("object_prefix") or entry["id"]),
            skill_dir,
        )
        _ensure_skill_md_importable(
            skill_dir,
            fallback_name=skill_name,
            fallback_description=str(entry.get("description") or skill_name),
        )
        scan_skill_dir_or_raise(skill_dir, skill_name)
        if not import_skill_dir(skill_dir, pool_dir, skill_name):
            raise SkillsError(
                message=f"Failed to import skill '{skill_name}' into skill pool",
            )

        def _update(payload: dict[str, Any]) -> None:
            _register_pool_skill_entry(
                payload,
                skill_name,
                pool_dir / skill_name,
                source="customized",
                installed_from="skill-market",
                preserve_from={},
            )

        mutate_json(
            get_pool_skill_manifest_path(),
            default_pool_manifest(),
            _update,
        )
        return {
            "installed": True,
            "name": skill_name,
            "id": entry["id"],
            "installed_from": "skill-market",
            "conflicts": [],
        }
    finally:
        shutil.rmtree(tmp_root, ignore_errors=True)


def get_skill_detail(skill_id: str) -> dict[str, Any]:
    """Return catalog entry plus live SKILL.md body preview."""
    entry = find_skill(skill_id)
    if entry is None:
        raise LookupError(f"Skill not found: {skill_id}")
    client = get_skills_market_minio()
    detail = dict(entry)
    if client is not None:
        key = f"{entry['object_prefix']}/SKILL.md"
        try:
            raw = client.get_object_bytes(key)
            parsed = _parse_skill_md(raw)
            detail["content_preview"] = (parsed.get("body") or "")[:4000]
            detail["version"] = parsed.get("version") or detail.get("version")
            detail["license"] = parsed.get("license") or detail.get("license")
            if parsed.get("instructions"):
                detail["instructions"] = parsed["instructions"]
        except Exception:
            logger.debug("detail SKILL.md fetch failed for %s", skill_id, exc_info=True)
            detail["content_preview"] = ""
    return detail
