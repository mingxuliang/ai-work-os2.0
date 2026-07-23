# -*- coding: utf-8 -*-
import logging
import os
import time
from . import _compat as _compat_bootstrap
from .utils.logging import setup_logger

# Fallback before we can safely read canonical constant definitions.
LOG_LEVEL_ENV = "QWENPAW_LOG_LEVEL"

_bootstrap_err: Exception | None = None
try:
    # Load persisted env vars before importing modules that read env-backed
    # constants at import time (e.g., WORKING_DIR).
    from .envs import load_envs_into_environ

    load_envs_into_environ()
except Exception as exc:
    # Best effort: package import should not fail if env bootstrap fails.
    _bootstrap_err = exc

# AgentScope 1.x APIs removed in 2.x — inject shims for enterprise routers.
try:
    from .compat.agentscope_v1 import install as _install_as_v1

    _install_as_v1()
except Exception as _compat_exc:  # noqa: BLE001
    logging.getLogger(__name__).warning(
        "agentscope_v1 compat install failed: %s",
        _compat_exc,
    )

_t0 = time.perf_counter()
setup_logger(os.environ.get(LOG_LEVEL_ENV, "info"))

if _bootstrap_err is not None:
    logging.getLogger(__name__).warning(
        "aiwork: failed to load persisted envs on init: %s",
        _bootstrap_err,
    )
logging.getLogger(__name__).debug(
    "%.3fs package init",
    time.perf_counter() - _t0,
)
