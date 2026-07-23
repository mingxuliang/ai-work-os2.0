# -*- coding: utf-8 -*-
"""Auth status bridge for QwenPaw 2.0 + AIWork JWT overlay.

QwenPaw registers ``GET /api/auth/status`` first (enabled=false when
QWENPAW_AUTH_ENABLED=false).  The Console login page checks
``/api/auth/jwt/status`` and ``/api/auth/status`` to decide which login
API to call.  This middleware short-circuits both endpoints with the
correct JWT-mode response so login always routes to ``/api/auth/jwt/login``.
"""
from __future__ import annotations

import json
import logging

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

logger = logging.getLogger(__name__)

_JWT_STATUS_BODY = json.dumps({"mode": "jwt", "enabled": True})
_AUTH_STATUS_BODY = json.dumps(
    {"mode": "jwt", "enabled": True, "has_users": True},
)


class JWTAuthStatusBridgeMiddleware(BaseHTTPMiddleware):
    """Return JWT auth status before QwenPaw legacy handlers run."""

    async def dispatch(self, request: Request, call_next) -> Response:
        if request.method != "GET":
            return await call_next(request)

        path = request.url.path
        if path == "/api/auth/jwt/status":
            return Response(
                content=_JWT_STATUS_BODY,
                media_type="application/json",
            )
        if path == "/api/auth/status":
            return Response(
                content=_AUTH_STATUS_BODY,
                media_type="application/json",
            )
        return await call_next(request)
