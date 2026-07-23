# -*- coding: utf-8 -*-
"""DEPRECATED: transitional overlay — kernel is now in-tree (1.x fork merge).

Prefer::

    python -m aiwork app

This package remains as a thin compatibility shim for old docs/scripts.
"""
from __future__ import annotations

import warnings

warnings.warn(
    "aiwork-enterprise is deprecated; AIWork-OS now vendors QwenPaw 2.0 "
    "in-tree under src/aiwork. Use `aiwork app` instead of "
    "`aiwork_enterprise.cli app`.",
    DeprecationWarning,
    stacklevel=2,
)

__all__ = ["__version__"]
__version__ = "2.0.0-deprecated"
