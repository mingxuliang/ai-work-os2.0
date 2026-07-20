# -*- coding: utf-8 -*-
"""P2-01: bridge AIWork auto_model_resolver into QwenPaw model routing."""
from __future__ import annotations

import logging
from typing import Any, Optional

logger = logging.getLogger(__name__)


def resolve_model(request_context: Optional[dict[str, Any]] = None) -> Optional[str]:
    """Try AIWork auto_model_resolver; return model id or None."""
    try:
        from aiwork.providers.auto_model_resolver import resolve  # type: ignore

        return resolve(request_context or {})
    except Exception:
        pass
    try:
        # Alternate module locations in the 1.x tree
        from aiwork.app.auto_model_resolver import resolve  # type: ignore

        return resolve(request_context or {})
    except Exception as exc:  # noqa: BLE001
        logger.debug("auto_model_resolver not available: %s", exc)
        return None
