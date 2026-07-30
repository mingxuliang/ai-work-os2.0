# -*- coding: utf-8 -*-
"""MinIO client for the Skills market bucket (directory-style skill packs).

Reuses the shared ``AIWORK_MINIO_ENDPOINT`` / credentials, but operates on
``AIWORK_SKILLS_MARKET_BUCKET`` (default ``skills``).
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Iterator

from minio import Minio  # type: ignore[import-untyped]
from minio.error import S3Error  # type: ignore[import-untyped]

from ...constant import EnvVarLoader

logger = logging.getLogger(__name__)

_DEFAULT_BUCKET = "skills"


def _get_minio_endpoint() -> str:
    endpoint = EnvVarLoader.get_str("AIWORK_MINIO_ENDPOINT", "").strip()
    if endpoint.startswith("https://"):
        return endpoint[len("https://") :]
    if endpoint.startswith("http://"):
        return endpoint[len("http://") :]
    return endpoint


def _get_minio_secure() -> bool:
    endpoint = EnvVarLoader.get_str("AIWORK_MINIO_ENDPOINT", "").strip()
    if endpoint.startswith("https://"):
        return True
    if endpoint.startswith("http://"):
        return False
    return EnvVarLoader.get_bool("AIWORK_MINIO_SECURE", False)


def is_skills_market_configured() -> bool:
    """Return True when MinIO endpoint is set (bucket may still be missing)."""
    return bool(EnvVarLoader.get_str("AIWORK_MINIO_ENDPOINT", "").strip())


class SkillsMarketMinioClient:
    """Synchronous MinIO helper for the skills market bucket."""

    def __init__(self) -> None:
        endpoint = _get_minio_endpoint()
        if not endpoint:
            raise RuntimeError("AIWORK_MINIO_ENDPOINT is not configured")
        self._client = Minio(
            endpoint=endpoint,
            access_key=EnvVarLoader.get_str(
                "AIWORK_MINIO_ACCESS_KEY",
                "minioadmin",
            ),
            secret_key=EnvVarLoader.get_str(
                "AIWORK_MINIO_SECRET_KEY",
                "minioadmin",
            ),
            secure=_get_minio_secure(),
        )
        self._bucket = EnvVarLoader.get_str(
            "AIWORK_SKILLS_MARKET_BUCKET",
            _DEFAULT_BUCKET,
        ).strip() or _DEFAULT_BUCKET

    @property
    def bucket(self) -> str:
        return self._bucket

    def bucket_exists(self) -> bool:
        try:
            return bool(self._client.bucket_exists(self._bucket))
        except S3Error as exc:
            logger.warning("bucket_exists failed for %s: %s", self._bucket, exc)
            return False

    def list_objects(
        self,
        *,
        prefix: str = "",
        recursive: bool = True,
    ) -> Iterator[Any]:
        return self._client.list_objects(
            self._bucket,
            prefix=prefix,
            recursive=recursive,
        )

    def list_skill_md_keys(self) -> list[tuple[str, Any]]:
        """Return ``(object_key, object_stat)`` for every ``**/SKILL.md``."""
        found: list[tuple[str, Any]] = []
        for obj in self.list_objects(recursive=True):
            name = str(getattr(obj, "object_name", "") or "")
            if not name.endswith("/SKILL.md") and not name.endswith("SKILL.md"):
                continue
            # Require ``category/folder/SKILL.md`` (at least 3 segments).
            parts = name.strip("/").split("/")
            if len(parts) < 3 or parts[-1] != "SKILL.md":
                continue
            found.append((name, obj))
        return found

    def get_object_bytes(self, object_key: str) -> bytes:
        response = self._client.get_object(self._bucket, object_key)
        try:
            return response.read()
        finally:
            response.close()
            response.release_conn()

    def list_prefix_keys(self, prefix: str) -> list[str]:
        """List all object keys under ``prefix`` (non-directory markers)."""
        normalized = prefix if prefix.endswith("/") else f"{prefix}/"
        keys: list[str] = []
        for obj in self.list_objects(prefix=normalized, recursive=True):
            name = str(getattr(obj, "object_name", "") or "")
            if not name or name.endswith("/"):
                continue
            keys.append(name)
        return keys

    def download_prefix_to_dir(self, prefix: str, target_dir: Path) -> Path:
        """Download every object under ``prefix`` into ``target_dir``.

        Object keys are rewritten relative to ``prefix`` so the skill root
        lands directly in ``target_dir`` (containing ``SKILL.md``).
        """
        normalized = prefix.strip("/")
        keys = self.list_prefix_keys(normalized)
        if not keys:
            raise FileNotFoundError(
                f"No objects found under prefix '{normalized}'",
            )
        target_dir.mkdir(parents=True, exist_ok=True)
        prefix_with_slash = f"{normalized}/"
        for key in keys:
            if key.startswith(prefix_with_slash):
                relative = key[len(prefix_with_slash) :]
            elif key == normalized:
                continue
            else:
                relative = Path(key).name
            if not relative or relative.endswith("/"):
                continue
            dest = target_dir / relative
            # Path traversal guard
            dest_resolved = dest.resolve()
            if not dest_resolved.is_relative_to(target_dir.resolve()):
                raise ValueError(f"Unsafe object path: {key}")
            dest.parent.mkdir(parents=True, exist_ok=True)
            data = self.get_object_bytes(key)
            dest.write_bytes(data)
        return target_dir


_client: SkillsMarketMinioClient | None = None


def get_skills_market_minio() -> SkillsMarketMinioClient | None:
    """Return a cached client, or None when MinIO is not configured."""
    global _client
    if not is_skills_market_configured():
        return None
    if _client is None:
        _client = SkillsMarketMinioClient()
    return _client


def reset_skills_market_minio() -> None:
    """Drop the cached client (for tests / config reload)."""
    global _client
    _client = None
