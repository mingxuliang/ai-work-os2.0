# -*- coding: utf-8 -*-
"""JWT authentication middleware for FastAPI.

Validates Bearer tokens on protected routes.
"""
from __future__ import annotations

import json
import logging
from typing import Optional

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

from .jwt_utils import decode_token
from .internal_token import is_internal_token
from .redis_client import get_session_user_info

logger = logging.getLogger(__name__)

# Paths that do NOT require authentication
_PUBLIC_PATHS: frozenset[str] = frozenset(
    {
        "/api/auth/jwt/login",
        "/api/auth/jwt/status",
        "/api/auth/jwt/register",
        "/api/auth/status",
        # Legacy QwenPaw auth paths — allow through so the Console can fall back
        # or proxy to JWT login when QWENPAW_AUTH_ENABLED=false.
        "/api/auth/login",
        "/api/auth/register",
        "/api/auth/verify-token",
        "/api/auth/revoke-token",
        "/api/version",
        "/api/settings/language",
        "/api/plugins",
        "/metrics",
        "/health",
    },
)

_PUBLIC_PREFIXES: tuple[str, ...] = (
    "/assets/",
    "/logo.png",
    "/aiwork-symbol.svg",
    "/qwenpaw-symbol.svg",
    "/api/plugins/",
    "/api/frontend_plugin/",
    "/api/presale-templates/public/",
    "/api/rag/image-proxy/",
)


class JWTAuthMiddleware(BaseHTTPMiddleware):
    """Middleware that validates JWT Bearer tokens on protected routes."""

    async def dispatch(
        self,
        request: Request,
        call_next,
    ) -> Response:
        """Validate JWT on protected API routes; skip public paths."""
        if self._should_skip_auth(request):
            return await call_next(request)

        token = self._extract_token(request)
        if not token:
            logger.debug("Not authenticated: no token provided")
            return Response(
                content=json.dumps({"detail": "Not authenticated"}),
                status_code=401,
                media_type="application/json",
            )

        # Internal CLI token bypass (no Redis/MySQL needed)
        if self._try_internal_token(request, token):
            return await call_next(request)

        payload = await decode_token(token)
        if payload is None:
            return Response(
                content=json.dumps(
                    {"detail": "Invalid or expired token"},
                ),
                status_code=401,
                media_type="application/json",
            )

        # Attach user info to request state for downstream handlers.
        # Redis session cache is the source of truth; fall back to JWT
        # payload when Redis is unavailable.
        jti = payload.get("jti", "")
        user_info = await get_session_user_info(jti) if jti else None
        if user_info:
            request.state.user = user_info.get("username", "")
            request.state.user_id = str(user_info.get("user_id", ""))
            request.state.roles = user_info.get("roles", [])
        else:
            request.state.user = payload.get("username", "")
            request.state.user_id = payload.get("sub", "")
            request.state.roles = payload.get("roles", [])
        request.state.jti = jti

        return await call_next(request)

    # ------------------------------------------------------------------
    # Static utility method that can be used without instantiating
    # the middleware (avoids the ``app`` argument required by
    # :class:`BaseHTTPMiddleware`).
    # ------------------------------------------------------------------
    @staticmethod
    async def dispatch_static(
        request: Request,
        call_next,
    ) -> Response:
        """Validate JWT on protected API routes; skip public paths.

        This is the same logic as :meth:`dispatch` but can be called
        without instantiating the middleware (avoids the ``app`` argument
        required by :class:`BaseHTTPMiddleware`).
        """
        if JWTAuthMiddleware._should_skip_auth(request):
            return await call_next(request)

        token = JWTAuthMiddleware._extract_token(request)
        if not token:
            logger.debug("Not authenticated: no token provided")
            return Response(
                content=json.dumps({"detail": "Not authenticated"}),
                status_code=401,
                media_type="application/json",
            )

        # Internal CLI token bypass (no Redis/MySQL needed)
        if JWTAuthMiddleware._try_internal_token(request, token):
            return await call_next(request)

        payload = await decode_token(token)
        if payload is None:
            return Response(
                content=json.dumps(
                    {"detail": "Invalid or expired token"},
                ),
                status_code=401,
                media_type="application/json",
            )

        # Attach user info to request state for downstream handlers.
        # Redis session cache is the source of truth; fall back to JWT
        # payload when Redis is unavailable.
        jti = payload.get("jti", "")
        user_info = await get_session_user_info(jti) if jti else None
        if user_info:
            request.state.user = user_info.get("username", "")
            request.state.user_id = str(user_info.get("user_id", ""))
            request.state.roles = user_info.get("roles", [])
        else:
            request.state.user = payload.get("username", "")
            request.state.user_id = payload.get("sub", "")
            request.state.roles = payload.get("roles", [])
        request.state.jti = jti

        return await call_next(request)

    @staticmethod
    def _should_skip_auth(request: Request) -> bool:
        """Return True when the request does not require auth.

        In JWT mode every protected endpoint requires a valid token;
        the ``allow_no_auth_hosts`` whitelist from legacy mode is NOT
        applied here because JWT authentication is identity-based
        (username / roles / permissions), not host-based.
        """
        path = request.url.path

        if request.method == "OPTIONS":
            return True

        if path in _PUBLIC_PATHS or any(
            path.startswith(p) for p in _PUBLIC_PREFIXES
        ):
            return True

        # Only protect /api/ routes
        if not path.startswith("/api/"):
            return True

        return False

    @staticmethod
    def _try_internal_token(request: Request, token: str) -> bool:
        """Check if *token* is the internal CLI token.

        Returns ``True`` and populates ``request.state`` with a synthetic
        admin identity when the token matches.  Returns ``False`` on any
        failure (file missing, mismatch, etc.).
        """
        try:
            if is_internal_token(token):
                request.state.user = "__internal__"
                request.state.user_id = "0"
                request.state.roles = ["admin"]
                request.state.jti = ""
                logger.debug("Internal token auth: request from CLI")
                return True
        except Exception:
            pass
        return False

    @staticmethod
    def _extract_token(request: Request) -> Optional[str]:
        """Extract Bearer token from header or WebSocket query param.

        Accepts both ``Authorization: Bearer <token>`` and
        ``Authorization: <token>`` formats.
        """
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            return auth_header[7:]

        # Bare JWT in Authorization header (no Bearer prefix)
        if auth_header and auth_header.count(".") >= 2:
            return auth_header

        # WebSocket upgrade
        if "upgrade" in request.headers.get("connection", "").lower():
            return request.query_params.get("token")

        # Fallback: query param
        token = request.query_params.get("token")
        if token:
            return token

        return None
