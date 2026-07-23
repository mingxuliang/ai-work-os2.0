# -*- coding: utf-8 -*-
"""Back-compat re-export — prefer ``aiwork.app.enterprise_mount``."""
from aiwork.app.enterprise_mount import (  # noqa: F401
    mount_enterprise,
    prioritize_api_before_spa,
)

__all__ = ["mount_enterprise", "prioritize_api_before_spa"]
