# -*- coding: utf-8 -*-
"""RSS proxy for console news center (bypass browser CORS)."""

from __future__ import annotations

import re
from urllib.parse import urljoin, urlparse

import httpx
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse, Response

router = APIRouter(tags=["rss"])

_ALLOWED_HOSTS = frozenset(
    {
        "www.qbitai.com",
        "www.leiphone.com",
        "www.tmtpost.com",
        "www.ifanr.com",
    },
)

_UA = (
    "Mozilla/5.0 (compatible; AIWorkOS-RSS/1.0; +https://github.com/agentscope-ai)"
)

_ARTICLE_ALLOWED_HOSTS = frozenset(
    {
        "www.qbitai.com",
        "qbitai.com",
        "www.leiphone.com",
        "leiphone.com",
        "static.leiphone.com",
        "www.tmtpost.com",
        "tmtpost.com",
        "images.tmtpost.com",
        "www.ifanr.com",
        "ifanr.com",
        "s3.ifanr.com",
        "images.ifanr.com",
    },
)

_GENERIC_COVER = re.compile(
    r"logo|avatar|icon|favicon|default[-_]?cover|placeholder|qrcode|qr[-_]?code|spacer|1x1|qbitai-logo|/themes/|head\.jpg|header",
    re.I,
)

_CONTENT_IMG = re.compile(
    r'<img[^>]+(?:src|data-src|data-original)=["\']([^"\']+)["\']',
    re.I,
)

_PREFERRED_CONTENT = re.compile(
    r"(wp-content/uploads/20\d{2}/|static\.leiphone\.com|images\.tmtpost\.com|s3\.ifanr\.com|images\.ifanr\.com|img\.qbitai\.com)",
    re.I,
)


def _is_generic_cover(url: str) -> bool:
    return bool(_GENERIC_COVER.search(url))


def _normalize_cover_url(raw: str, page_url: str) -> str | None:
    candidate = (raw or "").strip().replace("&amp;", "&")
    if not candidate or candidate.startswith("data:"):
        return None
    if candidate.startswith("//"):
        candidate = f"https:{candidate}"
    elif candidate.startswith("/"):
        candidate = urljoin(page_url, candidate)
    elif not candidate.startswith(("http://", "https://")):
        candidate = urljoin(page_url, candidate)
    parsed = urlparse(candidate)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        return None
    return candidate


def extract_cover_url(html: bytes, page_url: str) -> str | None:
    """Pick the best article cover from HTML meta tags or body images."""
    text = html.decode("utf-8", errors="replace")
    meta_candidates: list[str] = []
    body_candidates: list[str] = []

    meta_patterns = (
        r'<meta[^>]+property=["\']og:image(?::url)?["\'][^>]+content=["\']([^"\']+)["\']',
        r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:image(?::url)?["\']',
        r'<meta[^>]+name=["\']twitter:image(?::src)?["\'][^>]+content=["\']([^"\']+)["\']',
        r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+name=["\']twitter:image(?::src)?["\']',
    )
    for pattern in meta_patterns:
        for match in re.finditer(pattern, text, re.I):
            meta_candidates.append(match.group(1).strip())

    for match in _CONTENT_IMG.finditer(text):
        src = match.group(1).strip()
        if _is_generic_cover(src) or src.lower().endswith(".svg"):
            continue
        url = _normalize_cover_url(src, page_url)
        if url and not _is_generic_cover(url):
            body_candidates.append(url)

    ordered: list[str] = []
    ordered.extend(u for u in body_candidates if _PREFERRED_CONTENT.search(u))
    ordered.extend(meta_candidates)
    ordered.extend(body_candidates)

    seen: set[str] = set()
    for raw in ordered:
        url = _normalize_cover_url(raw, page_url)
        if not url or url in seen or _is_generic_cover(url):
            continue
        seen.add(url)
        return url
    return None


def _inject_base_tag(html: bytes, base_url: str) -> bytes:
    """Inject <base> so relative assets resolve on proxied article pages."""
    import re

    text = html.decode("utf-8", errors="replace")
    base_tag = f'<base href="{base_url}">'
    if re.search(r"<head\b", text, re.I):
        text = re.sub(
            r"(<head[^>]*>)",
            r"\1" + base_tag,
            text,
            count=1,
            flags=re.I,
        )
    else:
        text = base_tag + text
    return text.encode("utf-8")


@router.get("/rss-proxy")
async def rss_proxy(url: str = Query(..., description="HTTPS RSS feed URL")) -> Response:
    """Fetch RSS XML server-side and return to the console."""
    try:
        parsed = urlparse(url)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="invalid url") from exc

    if parsed.scheme != "https" or parsed.hostname not in _ALLOWED_HOSTS:
        raise HTTPException(status_code=403, detail="host not allowed")

    try:
        async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
            upstream = await client.get(
                url,
                headers={
                    "User-Agent": _UA,
                    "Accept": (
                        "application/rss+xml, application/xml, text/xml, "
                        "application/atom+xml, */*"
                    ),
                },
            )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    media = upstream.headers.get("content-type") or "application/xml; charset=utf-8"
    return Response(
        content=upstream.content,
        status_code=upstream.status_code,
        media_type=media,
        headers={"Cache-Control": "public, max-age=300"},
    )


@router.get("/article-proxy")
async def article_proxy(
    url: str = Query(..., description="HTTPS article page URL"),
) -> Response:
    """Fetch article HTML server-side for in-app reading (iframe)."""
    try:
        parsed = urlparse(url)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="invalid url") from exc

    host = (parsed.hostname or "").lower()
    if parsed.scheme != "https" or host not in _ARTICLE_ALLOWED_HOSTS:
        raise HTTPException(status_code=403, detail="host not allowed")

    try:
        async with httpx.AsyncClient(timeout=25.0, follow_redirects=True) as client:
            upstream = await client.get(
                url,
                headers={
                    "User-Agent": _UA,
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
                },
            )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    if upstream.status_code >= 400:
        raise HTTPException(status_code=upstream.status_code, detail="upstream error")

    base_url = f"{parsed.scheme}://{parsed.netloc}/"
    body = _inject_base_tag(upstream.content, base_url)
    media = upstream.headers.get("content-type") or "text/html; charset=utf-8"
    return Response(
        content=body,
        status_code=200,
        media_type=media,
        headers={
            "Cache-Control": "public, max-age=600",
            "X-Frame-Options": "SAMEORIGIN",
        },
    )


@router.get("/article-cover")
async def article_cover(
    url: str = Query(..., description="HTTPS article page URL"),
) -> JSONResponse:
    """Extract og:image / article hero image for news cards."""
    try:
        parsed = urlparse(url)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="invalid url") from exc

    host = (parsed.hostname or "").lower()
    if parsed.scheme != "https" or host not in _ARTICLE_ALLOWED_HOSTS:
        raise HTTPException(status_code=403, detail="host not allowed")

    try:
        async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
            upstream = await client.get(
                url,
                headers={
                    "User-Agent": _UA,
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
                },
            )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    if upstream.status_code >= 400:
        raise HTTPException(status_code=upstream.status_code, detail="upstream error")

    cover = extract_cover_url(upstream.content, url)
    return JSONResponse(
        content={"url": cover or ""},
        headers={"Cache-Control": "public, max-age=3600"},
    )
