# -*- coding: utf-8 -*-
"""Execution sandbox helpers for tool path isolation."""
from .context import (
    get_current_readonly_roots,
    get_current_sandbox_root,
    get_current_session_container_key,
    get_current_skill_requires_sandbox,
    get_sandbox_enabled_override,
    parse_sandbox_enabled_value,
    set_current_readonly_roots,
    set_current_sandbox_root,
    set_current_session_container_key,
    set_current_skill_requires_sandbox,
    set_sandbox_enabled_override,
)
from .docker_runner import (
    DockerSandboxRunner,
    EphemeralDockerRunner,
    SessionDockerRunner,
)
from .models import SandboxRunResult
from .path_jail import (
    SandboxBoundaryError,
    assert_path_in_jail,
    assert_path_readable,
    assert_path_writable,
    get_active_sandbox_root,
    get_workspace_dir_for_jail,
    is_path_in_jail,
    is_path_readable,
    is_path_writable,
    is_sandbox_enabled,
    load_configured_readonly_roots,
    load_use_user_subdir,
    resolve_path_in_jail,
    resolve_tool_path_string,
)
from .resolver import (
    ensure_sandbox_readonly_links,
    resolve_sandbox_root,
    sanitize_user_id,
)
from .session_container import SessionContainer, build_session_key
from .session_container_manager import get_session_container_manager
from .settings import (
    load_sandbox_settings,
    use_docker_shell_backend,
    use_session_container_backend,
)
from .status import (
    ExecutionSandboxStatus,
    SessionContainersStatus,
    get_execution_sandbox_status,
)

__all__ = [
    "DockerSandboxRunner",
    "EphemeralDockerRunner",
    "ExecutionSandboxStatus",
    "SandboxBoundaryError",
    "SandboxRunResult",
    "SessionContainer",
    "SessionContainersStatus",
    "SessionDockerRunner",
    "assert_path_in_jail",
    "assert_path_readable",
    "assert_path_writable",
    "build_session_key",
    "get_active_sandbox_root",
    "get_current_readonly_roots",
    "get_current_sandbox_root",
    "get_current_session_container_key",
    "get_current_skill_requires_sandbox",
    "get_execution_sandbox_status",
    "get_sandbox_enabled_override",
    "get_session_container_manager",
    "get_workspace_dir_for_jail",
    "is_path_in_jail",
    "is_path_readable",
    "is_path_writable",
    "is_sandbox_enabled",
    "load_configured_readonly_roots",
    "load_sandbox_settings",
    "load_use_user_subdir",
    "parse_sandbox_enabled_value",
    "resolve_path_in_jail",
    "ensure_sandbox_readonly_links",
    "resolve_tool_path_string",
    "sanitize_user_id",
    "set_current_readonly_roots",
    "set_current_sandbox_root",
    "set_current_session_container_key",
    "set_current_skill_requires_sandbox",
    "set_sandbox_enabled_override",
    "use_docker_shell_backend",
    "use_session_container_backend",
]
