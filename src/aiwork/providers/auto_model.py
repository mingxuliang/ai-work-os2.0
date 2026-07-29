# -*- coding: utf-8 -*-
"""Auto model selection for AIWork-OS (1.0 parity, native in 2.0).

When a request needs vision/video and the currently configured model
cannot satisfy it, pick a better configured model automatically.

Priority:
  1. Explicit per-request ``model_slot_override`` (handled by caller)
  2. Current agent/global model if it already meets requirements
  3. Custom resolver hooks (optional modules)
  4. Capability-based pick among configured ProviderManager models
  5. ``AIWORK_DEFAULT_MODEL`` env (``provider:model`` or bare model id)
  6. None — leave factory default untouched

Toggle: ``AIWORK_AUTO_MODEL`` (default on).
"""
from __future__ import annotations

import logging
import os
from typing import Any, Iterator, Optional

logger = logging.getLogger(__name__)

_TRUE = frozenset({"1", "true", "yes", "on"})

# Fallback name heuristics when probe / ModelInfo flags are unknown
_VISION_HINTS = (
    "vision",
    "vl",
    "gpt-4o",
    "gpt-4.1",
    "gpt-5",
    "gemini",
    "claude-3",
    "claude-4",
    "claude-sonnet",
    "claude-opus",
    "qwen-vl",
    "qwen2.5-vl",
    "qwen3-vl",
    "glm-4v",
    "llava",
    "pixtral",
    "nova-pro",
    "nova-lite",
)
_VIDEO_HINTS = (
    "video",
    "gemini",
    "gpt-4o",
    "qwen-vl",
    "qwen2.5-vl",
)


def auto_model_enabled() -> bool:
    raw = (
        os.environ.get("AIWORK_AUTO_MODEL")
        or os.environ.get("QWENPAW_AUTO_MODEL")
        or "true"
    )
    return raw.strip().lower() in _TRUE


def inspect_request_media(request: Any) -> dict[str, bool]:
    """Detect image/video presence on an AgentRequest-like object."""
    flags = {"has_image": False, "has_video": False}
    if request is None:
        return flags

    payload = getattr(request, "input", None)
    _scan_media(payload, flags)
    # Also scan common alternate fields
    for attr in ("messages", "content", "attachments"):
        if flags["has_image"] and flags["has_video"]:
            break
        _scan_media(getattr(request, attr, None), flags)
    return flags


def _scan_media(obj: Any, flags: dict[str, bool], depth: int = 0) -> None:
    if obj is None or depth > 8:
        return
    if isinstance(obj, dict):
        t = str(obj.get("type") or obj.get("media_type") or "").lower()
        if "image" in t or obj.get("image_url") is not None:
            flags["has_image"] = True
        if "video" in t or obj.get("video_url") is not None:
            flags["has_video"] = True
        mt = str(obj.get("media_type") or "").lower()
        if mt.startswith("image/"):
            flags["has_image"] = True
        if mt.startswith("video/"):
            flags["has_video"] = True
        for v in obj.values():
            if flags["has_image"] and flags["has_video"]:
                return
            _scan_media(v, flags, depth + 1)
        return
    if isinstance(obj, (list, tuple)):
        for item in obj:
            if flags["has_image"] and flags["has_video"]:
                return
            _scan_media(item, flags, depth + 1)
        return
    # Pydantic / Message content objects
    for attr in ("type", "image_url", "video_url", "content", "parts", "source"):
        if hasattr(obj, attr):
            val = getattr(obj, attr)
            if attr == "type" and isinstance(val, str):
                low = val.lower()
                if "image" in low:
                    flags["has_image"] = True
                if "video" in low:
                    flags["has_video"] = True
            else:
                _scan_media(val, flags, depth + 1)


def model_supports(
    model_info: Any,
    *,
    requires_vision: bool,
    requires_video: bool,
    model_id: str = "",
) -> bool:
    """Whether *model_info* (or name heuristics) satisfies requirements."""
    mid = (model_id or getattr(model_info, "id", "") or "").lower()

    if requires_vision:
        flag = getattr(model_info, "supports_image", None) if model_info else None
        if flag is False:
            return False
        if flag is True:
            pass
        elif not any(h in mid for h in _VISION_HINTS):
            # Unknown and no name hint → reject for auto-pick
            if model_info is None or flag is None:
                return False

    if requires_video:
        flag = getattr(model_info, "supports_video", None) if model_info else None
        if flag is False:
            return False
        if flag is True:
            pass
        elif not any(h in mid for h in _VIDEO_HINTS):
            if model_info is None or flag is None:
                return False

    return True


def _iter_provider_models(pm: Any) -> Iterator[tuple[str, Any, Any]]:
    """Yield (provider_id, provider, ModelInfo) for configured providers."""
    buckets: list[dict] = []
    for attr in ("builtin_providers", "custom_providers"):
        mapping = getattr(pm, attr, None) or {}
        if isinstance(mapping, dict):
            buckets.append(mapping)
    plugins = getattr(pm, "plugin_providers", None) or {}
    if isinstance(plugins, dict):
        for pid, meta in plugins.items():
            provider = None
            try:
                provider = pm.get_provider(pid)
            except Exception:  # noqa: BLE001
                continue
            if provider is None:
                continue
            for model in list(getattr(provider, "models", []) or []) + list(
                getattr(provider, "extra_models", []) or [],
            ):
                yield pid, provider, model

    for mapping in buckets:
        for pid, provider in mapping.items():
            # Skip providers without credentials when they require a key
            try:
                require_key = getattr(provider, "require_api_key", True)
                api_key = getattr(provider, "api_key", None) or ""
                if require_key and not str(api_key).strip():
                    # Local / no-key providers still allowed
                    base = getattr(provider, "base_url", "") or ""
                    if "localhost" not in base and "127.0.0.1" not in base:
                        if pid not in ("qwenpaw-local", "ollama", "lmstudio"):
                            continue
            except Exception:  # noqa: BLE001
                pass
            for model in list(getattr(provider, "models", []) or []) + list(
                getattr(provider, "extra_models", []) or [],
            ):
                yield pid, provider, model


def _find_model_info(pm: Any, provider_id: str, model_id: str) -> Any | None:
    provider = pm.get_provider(provider_id)
    if provider is None:
        return None
    for model in list(getattr(provider, "models", []) or []) + list(
        getattr(provider, "extra_models", []) or [],
    ):
        if getattr(model, "id", None) == model_id:
            return model
    return None


def _try_custom_resolver(ctx: dict) -> Optional[str]:
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
            continue
    return None


def _parse_slot_string(raw: str):
    from aiwork.config.config import ModelSlotConfig

    text = raw.strip()
    if not text:
        return None
    if ":" in text:
        provider_id, _, model = text.partition(":")
        provider_id = provider_id.strip()
        model = model.strip()
        if provider_id and model:
            return ModelSlotConfig(provider_id=provider_id, model=model)
    # Bare model id — search providers
    try:
        from aiwork.providers.provider_manager import ProviderManager

        pm = ProviderManager.get_instance()
        for pid, _provider, model in _iter_provider_models(pm):
            if getattr(model, "id", None) == text:
                return ModelSlotConfig(provider_id=pid, model=text)
    except Exception:  # noqa: BLE001
        pass
    return None


def resolve_model_slot(
    request_context: Optional[dict[str, Any]] = None,
    *,
    requires_vision: bool = False,
    requires_video: bool = False,
    requires_function_call: bool = False,
    current_slot: Any = None,
) -> Any | None:
    """Return a ``ModelSlotConfig`` when auto-selection finds a better model.

    Returns ``None`` when no change is needed / possible.
    """
    from aiwork.config.config import ModelSlotConfig

    ctx = dict(request_context or {})
    if requires_vision:
        ctx.setdefault("requires_vision", True)
    if requires_video:
        ctx.setdefault("requires_video", True)
    if requires_function_call:
        ctx.setdefault("requires_function_call", True)

    needs_vision = bool(ctx.get("requires_vision") or ctx.get("has_image"))
    needs_video = bool(ctx.get("requires_video") or ctx.get("has_video"))
    # No special capability demand → do not override user/agent choice
    if not needs_vision and not needs_video:
        return None

    try:
        from aiwork.providers.provider_manager import ProviderManager

        pm = ProviderManager.get_instance()
    except Exception as exc:  # noqa: BLE001
        logger.debug("auto_model: ProviderManager unavailable: %s", exc)
        pm = None

    # Keep current slot if it already works
    if current_slot is not None and pm is not None:
        pid = getattr(current_slot, "provider_id", None)
        mid = getattr(current_slot, "model", None)
        if pid and mid:
            info = _find_model_info(pm, pid, mid)
            if model_supports(
                info,
                requires_vision=needs_vision,
                requires_video=needs_video,
                model_id=mid,
            ):
                logger.debug(
                    "auto_model: current %s:%s already OK",
                    pid,
                    mid,
                )
                return None

    # Custom resolver may return "provider:model" or bare model id
    custom = _try_custom_resolver(ctx)
    if custom:
        slot = _parse_slot_string(custom)
        if slot is not None:
            logger.info("auto_model: custom resolver → %s:%s", slot.provider_id, slot.model)
            return slot

    # Capability pick among configured models (prefer same provider)
    if pm is not None:
        preferred_provider = getattr(current_slot, "provider_id", None)
        candidates: list[tuple[int, str, str]] = []
        for pid, _provider, model in _iter_provider_models(pm):
            mid = getattr(model, "id", None)
            if not mid:
                continue
            if not model_supports(
                model,
                requires_vision=needs_vision,
                requires_video=needs_video,
                model_id=mid,
            ):
                continue
            rank = 0 if preferred_provider and pid == preferred_provider else 1
            candidates.append((rank, pid, mid))
        if candidates:
            candidates.sort(key=lambda x: (x[0], x[1], x[2]))
            _rank, pid, mid = candidates[0]
            slot = ModelSlotConfig(provider_id=pid, model=mid)
            logger.info(
                "auto_model: capability pick → %s:%s (vision=%s video=%s)",
                pid,
                mid,
                needs_vision,
                needs_video,
            )
            return slot

    # Env override
    env_model = (
        os.environ.get("AIWORK_DEFAULT_MODEL")
        or os.environ.get("QWENPAW_DEFAULT_MODEL")
        or ""
    ).strip()
    if env_model:
        slot = _parse_slot_string(env_model)
        if slot is not None:
            logger.info(
                "auto_model: env AIWORK_DEFAULT_MODEL → %s:%s",
                slot.provider_id,
                slot.model,
            )
            return slot

    return None


def resolve_model(
    request_context: Optional[dict[str, Any]] = None,
    *,
    requires_vision: bool = False,
    requires_video: bool = False,
    requires_function_call: bool = False,
) -> Optional[str]:
    """Backward-compatible: return ``provider:model`` or bare model id."""
    slot = resolve_model_slot(
        request_context,
        requires_vision=requires_vision,
        requires_video=requires_video,
        requires_function_call=requires_function_call,
    )
    if slot is None:
        return None
    return f"{slot.provider_id}:{slot.model}"


def auto_model_for_request(request_context: dict) -> Optional[str]:
    """Convenience wrapper used by legacy tests / bridges."""
    return resolve_model(
        request_context,
        requires_vision=bool(
            request_context.get("has_image")
            or request_context.get("requires_vision"),
        ),
        requires_video=bool(
            request_context.get("has_video")
            or request_context.get("requires_video"),
        ),
        requires_function_call=bool(
            request_context.get("requires_function_call"),
        ),
    )


def maybe_auto_model_slot(
    request: Any,
    agent_config: Any = None,
) -> Any | None:
    """Entry point for AgentBuilder: return override slot or None."""
    if not auto_model_enabled():
        return None

    media = inspect_request_media(request)
    if not media["has_image"] and not media["has_video"]:
        return None

    current = None
    if agent_config is not None:
        current = getattr(agent_config, "active_model", None)
    if current is None or not getattr(current, "provider_id", None):
        try:
            from aiwork.providers.provider_manager import ProviderManager

            current = ProviderManager.get_instance().get_active_model()
        except Exception:  # noqa: BLE001
            current = None

    return resolve_model_slot(
        {
            "has_image": media["has_image"],
            "has_video": media["has_video"],
            "requires_vision": media["has_image"],
            "requires_video": media["has_video"],
        },
        requires_vision=media["has_image"],
        requires_video=media["has_video"],
        current_slot=current,
    )
