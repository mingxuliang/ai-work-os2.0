# -*- coding: utf-8 -*-
"""Auto model selection bridge: AIWork-OS → QwenPaw 2.0.

AIWork-OS providers module (provider_manager.py) supports:
  - OpenAI / OpenRouter / Anthropic / Gemini / Ollama / LMStudio
  - Per-model capability probing (vision, video, function_call)
  - Rate limiter (per provider rpm)
  - ModelCapabilityCache
  - Retry wrapper

QwenPaw 2.0 model routing uses a slot-based config (ModelSlotConfig).

This bridge:
  1. Tries AIWork auto_model_resolver (if present).
  2. Falls back to AIWork ProviderManager — picks the best model
     that satisfies ``requires_vision`` / ``requires_video`` /
     ``requires_function_call`` from the request context.
  3. If still None, tries QwenPaw 2.0 default model slot.
  4. Returns model id string, or None to let QwenPaw use its default.
"""
from __future__ import annotations

import logging
from typing import Any, Optional

from aiwork_enterprise.env import get_env

logger = logging.getLogger(__name__)


def resolve_model(
    request_context: Optional[dict[str, Any]] = None,
    *,
    requires_vision: bool = False,
    requires_video: bool = False,
    requires_function_call: bool = False,
) -> Optional[str]:
    """Select the best available model for the given requirements.

    Priority chain:
      1. AIWork auto_model_resolver (custom business logic)
      2. AIWork ProviderManager capability-based selection
      3. AIWORK_DEFAULT_MODEL env override
      4. QwenPaw 2.0 default slot
      5. None (let caller decide)

    Returns:
        Model id string (e.g. ``"gpt-4o"``) or ``None``.
    """
    ctx = dict(request_context or {})
    if requires_vision:
        ctx.setdefault("requires_vision", True)
    if requires_video:
        ctx.setdefault("requires_video", True)
    if requires_function_call:
        ctx.setdefault("requires_function_call", True)

    # Step 1 — AIWork custom resolver
    model = _try_aiwork_resolver(ctx)
    if model:
        logger.debug("auto_model: custom resolver → %s", model)
        return model

    # Step 2 — ProviderManager capability-based pick
    model = _try_provider_manager(ctx)
    if model:
        logger.debug("auto_model: provider_manager → %s", model)
        return model

    # Step 3 — Env override
    model = get_env("AIWORK_DEFAULT_MODEL", "").strip() or None
    if model:
        logger.debug("auto_model: env AIWORK_DEFAULT_MODEL → %s", model)
        return model

    # Step 4 — QwenPaw 2.0 default slot
    model = _try_qwenpaw_default()
    if model:
        logger.debug("auto_model: qwenpaw default → %s", model)
        return model

    return None


# ─── Step 1 helpers ───────────────────────────────────────────────────────────

def _try_aiwork_resolver(ctx: dict) -> Optional[str]:
    for mod_path in (
        "aiwork.providers.auto_model_resolver",
        "aiwork.app.auto_model_resolver",
    ):
        try:
            mod = __import__(mod_path, fromlist=["resolve"])
            fn = getattr(mod, "resolve", None)
            if callable(fn):
                result = fn(ctx)
                if result and isinstance(result, str):
                    return result.strip() or None
        except Exception:  # noqa: BLE001
            pass
    return None


# ─── Step 2 helpers ───────────────────────────────────────────────────────────

def _try_provider_manager(ctx: dict) -> Optional[str]:
    """Pick a model from AIWork ProviderManager matching context requirements."""
    try:
        from aiwork.providers.provider_manager import ProviderManager  # type: ignore

        pm: Any = ProviderManager()
        needs_vision = bool(ctx.get("requires_vision"))
        needs_video = bool(ctx.get("requires_video"))
        needs_fn = bool(ctx.get("requires_function_call"))

        # list_models returns List[ModelInfo]
        candidates = pm.list_models()
        for m in candidates:
            if needs_vision and not getattr(m, "supports_image", False):
                continue
            if needs_video and not getattr(m, "supports_video", False):
                continue
            # function_call: infer from model id or capability field
            if needs_fn:
                cap = getattr(m, "supports_function_call", None)
                if cap is False:
                    continue
            return m.id
    except Exception as exc:  # noqa: BLE001
        logger.debug("provider_manager capability pick: %s", exc)
    return None


# ─── Step 4 helpers ───────────────────────────────────────────────────────────

def _try_qwenpaw_default() -> Optional[str]:
    """Read QwenPaw 2.0's configured default model slot."""
    try:
        from qwenpaw.config import get_default_model_id  # type: ignore
        return get_default_model_id() or None
    except Exception:  # noqa: BLE001
        pass

    try:
        from aiwork.config.config import load_config  # type: ignore
        cfg = load_config()
        slots = getattr(cfg, "model_slots", [])
        if slots:
            return getattr(slots[0], "model_id", None) or None
    except Exception:  # noqa: BLE001
        pass

    return None


# ─── Public helper ────────────────────────────────────────────────────────────

def auto_model_for_request(request_context: dict) -> Optional[str]:
    """Convenience wrapper; extracts vision/video/fn flags from context."""
    return resolve_model(
        request_context,
        requires_vision=bool(request_context.get("has_image") or request_context.get("requires_vision")),
        requires_video=bool(request_context.get("has_video") or request_context.get("requires_video")),
        requires_function_call=bool(request_context.get("requires_function_call")),
    )
