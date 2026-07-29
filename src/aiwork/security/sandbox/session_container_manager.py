# -*- coding: utf-8 -*-
"""Manage long-lived Docker containers per chat session."""
from __future__ import annotations

import asyncio
import hashlib
import logging
import shlex
import time
from pathlib import Path

from .docker_runner import _docker_volume_path, _smart_decode
from .models import SandboxRunResult
from .session_container import SessionContainer
from .settings import ResolvedSandboxSettings, load_sandbox_settings

logger = logging.getLogger(__name__)

_manager: "SessionContainerManager | None" = None


class SessionContainerManager:
    """Acquire, reuse, and destroy session-scoped Docker containers."""

    def __init__(self) -> None:
        self._containers: dict[str, SessionContainer] = {}
        self._lock = asyncio.Lock()

    async def acquire(
        self,
        session_key: str,
        sandbox_root: Path,
        settings: ResolvedSandboxSettings | None = None,
    ) -> SessionContainer:
        """Return an existing or newly created session container."""
        resolved_settings = settings or load_sandbox_settings()
        sandbox_root = sandbox_root.expanduser().resolve()
        async with self._lock:
            existing = self._containers.get(session_key)
            if existing is not None:
                if await self._is_container_running(existing.container_id):
                    existing.last_used = time.time()
                    logger.info(
                        "[SANDBOX] session_container_acquire key=%s "
                        "container_id=%s reused=1",
                        session_key,
                        existing.container_id[:12],
                    )
                    return existing
                await self._destroy_container_record(existing)
                self._containers.pop(session_key, None)

            await self._enforce_max_containers(resolved_settings)
            created = await self._create_container(
                session_key,
                sandbox_root,
                resolved_settings,
            )
            self._containers[session_key] = created
            logger.info(
                "[SANDBOX] session_container_acquire key=%s container_id=%s",
                session_key,
                created.container_id[:12],
            )
            return created

    async def exec_shell(
        self,
        session_key: str,
        command: str,
        *,
        timeout: float | None = None,
        settings: ResolvedSandboxSettings | None = None,
    ) -> SandboxRunResult:
        """Execute a shell command inside the session container."""
        resolved_settings = settings or load_sandbox_settings()
        container = self._containers.get(session_key)
        if container is None:
            raise RuntimeError(
                f"No session container registered for key '{session_key}'",
            )
        effective_timeout = float(
            timeout
            if timeout is not None
            else resolved_settings.docker_timeout_seconds,
        )
        argv = [
            "docker",
            "exec",
            "-i",
            "-w",
            "/work",
            container.container_id,
            "/bin/sh",
            "-c",
            command,
        ]
        started = time.perf_counter()
        logger.info(
            "[SANDBOX] session_container_exec key=%s cmd=%s",
            session_key,
            command[:200],
        )
        proc = await asyncio.create_subprocess_exec(
            *argv,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            stdout, stderr = await asyncio.wait_for(
                proc.communicate(),
                timeout=effective_timeout,
            )
        except asyncio.TimeoutError:
            proc.kill()
            await proc.wait()
            duration = time.perf_counter() - started
            return SandboxRunResult(
                returncode=-1,
                stdout="",
                stderr=(
                    f"Session container execution exceeded timeout of "
                    f"{effective_timeout} seconds."
                ),
                backend="docker-session",
                duration_seconds=duration,
            )

        container.last_used = time.time()
        duration = time.perf_counter() - started
        result = SandboxRunResult(
            returncode=proc.returncode if proc.returncode is not None else -1,
            stdout=_smart_decode(stdout),
            stderr=_smart_decode(stderr),
            backend="docker-session",
            duration_seconds=duration,
        )
        logger.info(
            "[SANDBOX] session_container_exec key=%s rc=%s duration=%.2fs",
            session_key,
            result.returncode,
            duration,
        )
        return result

    async def get_container_id(self, session_key: str) -> str | None:
        """Return the Docker container id for *session_key*, if any."""
        container = self._containers.get(session_key)
        if container is None:
            return None
        if not await self._is_container_running(container.container_id):
            return None
        container.last_used = time.time()
        return container.container_id

    async def release(self, session_key: str) -> None:
        """Mark a session container idle after a query completes."""
        container = self._containers.get(session_key)
        if container is not None:
            container.last_used = time.time()

    async def destroy(self, session_key: str) -> bool:
        """Force-remove a session container."""
        async with self._lock:
            container = self._containers.pop(session_key, None)
        if container is None:
            return False
        await self._destroy_container_record(container)
        logger.info(
            "[SANDBOX] session_container_destroy key=%s container_id=%s",
            session_key,
            container.container_id[:12],
        )
        return True

    async def destroy_all(self) -> int:
        """Destroy all tracked session containers."""
        async with self._lock:
            items = list(self._containers.items())
            self._containers.clear()
        for session_key, container in items:
            await self._destroy_container_record(container)
            logger.info(
                "[SANDBOX] session_container_destroy key=%s container_id=%s",
                session_key,
                container.container_id[:12],
            )
        return len(items)

    async def reap_idle(self) -> int:
        """Destroy containers idle longer than configured threshold."""
        settings = load_sandbox_settings()
        now = time.time()
        stale_keys = [
            key
            for key, container in list(self._containers.items())
            if now - container.last_used >= settings.session_idle_seconds
        ]
        destroyed = 0
        for key in stale_keys:
            if await self.destroy(key):
                destroyed += 1
                logger.info("[SANDBOX] session_container_reap key=%s", key)
        return destroyed

    def list_containers(self) -> list[dict[str, object]]:
        """Return a snapshot of active session containers."""
        now = time.time()
        return [
            {
                "session_key": container.session_key,
                "container_id": container.container_id,
                "container_name": container.container_name,
                "sandbox_root": str(container.sandbox_root),
                "idle_for": max(0, int(now - container.last_used)),
                "created_at": container.created_at,
            }
            for container in self._containers.values()
        ]

    async def _enforce_max_containers(
        self,
        settings: ResolvedSandboxSettings,
    ) -> None:
        if len(self._containers) < settings.session_max_containers:
            return
        lru_key = min(
            self._containers,
            key=lambda key: self._containers[key].last_used,
        )
        await self.destroy(lru_key)

    async def _create_container(
        self,
        session_key: str,
        sandbox_root: Path,
        settings: ResolvedSandboxSettings,
    ) -> SessionContainer:
        name = self._container_name(session_key)
        await self._remove_container_name(name)
        host_root = _docker_volume_path(sandbox_root)
        argv = [
            "docker",
            "run",
            "-d",
            "--name",
            name,
            "--network",
            settings.docker_network,
            "--memory",
            settings.docker_memory,
            "--cpus",
            settings.docker_cpus,
            "--pids-limit",
            str(settings.docker_pids_limit),
            "-v",
            f"{host_root}:/work:rw",
            "-w",
            "/work",
            settings.docker_image,
            "sleep",
            "infinity",
        ]
        proc = await asyncio.create_subprocess_exec(
            *argv,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await proc.communicate()
        if proc.returncode != 0:
            err = _smart_decode(stderr) or _smart_decode(stdout)
            raise RuntimeError(
                f"Failed to start session container: {err.strip()}",
            )
        container_id = _smart_decode(stdout).strip()
        now = time.time()
        return SessionContainer(
            container_id=container_id,
            container_name=name,
            session_key=session_key,
            sandbox_root=sandbox_root,
            last_used=now,
            created_at=now,
        )

    @staticmethod
    def _container_name(session_key: str) -> str:
        digest = hashlib.sha256(session_key.encode("utf-8")).hexdigest()[:12]
        return f"aiwork-sbx-{digest}"

    @staticmethod
    async def _is_container_running(container_id: str) -> bool:
        proc = await asyncio.create_subprocess_exec(
            "docker",
            "inspect",
            "-f",
            "{{.State.Running}}",
            container_id,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, _stderr = await proc.communicate()
        return proc.returncode == 0 and _smart_decode(stdout).strip() == "true"

    @staticmethod
    async def _remove_container_name(name: str) -> None:
        proc = await asyncio.create_subprocess_exec(
            "docker",
            "rm",
            "-f",
            name,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        await proc.wait()

    @staticmethod
    async def _destroy_container_record(container: SessionContainer) -> None:
        proc = await asyncio.create_subprocess_exec(
            "docker",
            "rm",
            "-f",
            container.container_id,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        await proc.wait()

    def format_audit_command(self, argv: list[str]) -> str:
        return " ".join(shlex.quote(part) for part in argv)


def get_session_container_manager() -> SessionContainerManager:
    """Return the process-wide session container manager singleton."""
    global _manager
    if _manager is None:
        _manager = SessionContainerManager()
    return _manager
