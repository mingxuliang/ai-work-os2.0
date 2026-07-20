# -*- coding: utf-8 -*-
"""Channel multi-user lock / Redis bus notes for QwenPaw 2.0 (P1-06)."""
from __future__ import annotations

import logging

from aiwork_enterprise.env import get_env

logger = logging.getLogger(__name__)

# Redis key prefixes — keep AIWork enterprise keys distinct from kernel
LOCK_PREFIX = "aiwork:channel:lock:"
BUS_PREFIX = "aiwork:channel:bus:"
STATE_PREFIX = "aiwork:channel:state:"


def redis_url() -> str:
    return get_env("AIWORK_REDIS_URL", "")


def configure_channel_isolation() -> dict:
    """Return key namespace config for channel multi-tenant locks."""
    cfg = {
        "redis_url": redis_url(),
        "lock_prefix": LOCK_PREFIX,
        "bus_prefix": BUS_PREFIX,
        "state_prefix": STATE_PREFIX,
    }
    if not cfg["redis_url"]:
        logger.warning("AIWORK_REDIS_URL empty — channel locks degrade to local")
    else:
        logger.info("Channel bridge Redis prefixes ready")
    return cfg
