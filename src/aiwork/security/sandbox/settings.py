# -*- coding: utf-8 -*-
"""Load execution sandbox settings from config and environment."""
from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Literal

from ...constant import EnvVarLoader
from ...config.config import ExecutionSandboxConfig
from .context import get_sandbox_enabled_override

SandboxBackend = Literal["off", "local", "docker"]
SkillSandboxEnforcement = Literal["off", "warn", "strict"]


@dataclass(frozen=True)
class ResolvedSandboxSettings:
    """Effective sandbox settings after env overrides."""

    enabled: bool
    backend: SandboxBackend
    use_user_subdir: bool
    fail_closed: bool
    fallback_backend: Literal["off", "local"]
    docker_image: str
    docker_network: Literal["none", "bridge"]
    docker_memory: str
    docker_cpus: str
    docker_pids_limit: int
    docker_timeout_seconds: int
    skill_sandbox_enforcement: SkillSandboxEnforcement
    auto_tag_risky_skills: bool
    session_container_enabled: bool
    session_idle_seconds: int
    session_max_containers: int
    sandbox_readonly_roots: list[str]
    allow_enabled_skill_dirs: bool


_TRUE_STRINGS = frozenset({"true", "1", "yes", "on"})


def _env_enabled() -> bool | None:
    if (
        "AIWORK_EXECUTION_SANDBOX_ENABLED" not in os.environ
    ):
        return None
    raw = EnvVarLoader.get_str("AIWORK_EXECUTION_SANDBOX_ENABLED")
    return raw.strip().lower() in _TRUE_STRINGS


def _env_backend() -> SandboxBackend | None:
    if (
        "AIWORK_EXECUTION_SANDBOX_BACKEND" not in os.environ
    ):
        return None
    raw = EnvVarLoader.get_str("AIWORK_EXECUTION_SANDBOX_BACKEND")
    value = raw.strip().lower()
    if value in {"off", "local", "docker"}:
        return value  # type: ignore[return-value]
    return None


def _load_config() -> ExecutionSandboxConfig:
    from aiwork.config import load_config

    return load_config().security.execution_sandbox


def load_sandbox_settings() -> ResolvedSandboxSettings:
    """Resolve sandbox settings with env var overrides."""
    cfg = _load_config()
    override = get_sandbox_enabled_override()
    if override is not None:
        enabled = override
    else:
        enabled = _env_enabled() if _env_enabled() is not None else cfg.enabled
    backend: SandboxBackend = (
        _env_backend() if _env_backend() is not None else cfg.backend
    )
    if not enabled:
        backend = "off"
    elif enabled and backend == "off":
        backend = "local"
    return ResolvedSandboxSettings(
        enabled=enabled,
        backend=backend,
        use_user_subdir=cfg.use_user_subdir,
        fail_closed=cfg.fail_closed,
        fallback_backend=cfg.fallback_backend,
        docker_image=cfg.docker_image,
        docker_network=cfg.docker_network,
        docker_memory=cfg.docker_memory,
        docker_cpus=cfg.docker_cpus,
        docker_pids_limit=cfg.docker_pids_limit,
        docker_timeout_seconds=cfg.docker_timeout_seconds,
        skill_sandbox_enforcement=cfg.skill_sandbox_enforcement,
        auto_tag_risky_skills=cfg.auto_tag_risky_skills,
        session_container_enabled=cfg.session_container_enabled,
        session_idle_seconds=cfg.session_idle_seconds,
        session_max_containers=cfg.session_max_containers,
        sandbox_readonly_roots=list(cfg.sandbox_readonly_roots or ["skills"]),
        allow_enabled_skill_dirs=bool(cfg.allow_enabled_skill_dirs),
    )


def use_docker_shell_backend() -> bool:
    """Return True when shell commands should run in docker per-call."""
    settings = load_sandbox_settings()
    return settings.enabled and settings.backend == "docker"


def use_session_container_backend() -> bool:
    """Return True when shell/MCP should reuse session containers."""
    settings = load_sandbox_settings()
    return (
        settings.enabled
        and settings.backend == "docker"
        and settings.session_container_enabled
    )
