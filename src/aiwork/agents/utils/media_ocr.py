# -*- coding: utf-8 -*-
"""OCR helpers for chat images when the active model is text-only.

Used by media-stripping paths so image attachments become readable text
for the LLM instead of a generic "media removed" placeholder.
"""
from __future__ import annotations

import logging
import mimetypes
import os
import re
import unicodedata
from pathlib import Path
from typing import Any, Optional
from urllib.parse import unquote, urlparse

logger = logging.getLogger(__name__)

_IMAGE_EXTS = {
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".bmp",
    ".tif",
    ".tiff",
}
_MAX_OCR_BYTES = 80 * 1024 * 1024  # 80MB
_MAX_SIDE = 4000
_OCR_LANG = os.environ.get("AIWORK_OCR_LANG", "chi_sim+eng")


def _url_to_local_path(url: str) -> Optional[Path]:
    if not url:
        return None
    raw = unquote(str(url)).strip()
    raw = unicodedata.normalize("NFC", raw)
    if raw.startswith("file://"):
        parsed = urlparse(raw)
        path = unquote(parsed.path or "")
        # Windows-ish file:///C:/... not expected in container
        if path.startswith("/") and len(path) >= 3 and path[2] == ":":
            path = path[1:]
        return Path(path)
    if raw.startswith(("http://", "https://")):
        return None
    return Path(os.path.expanduser(raw))


def extract_image_path_from_block(block: Any) -> Optional[Path]:
    """Best-effort extract a local image path from a message content block."""
    if block is None:
        return None

    if isinstance(block, dict):
        btype = block.get("type")
        if btype == "image":
            for key in ("image_url", "url", "file_url", "path"):
                p = _url_to_local_path(str(block.get(key) or ""))
                if p is not None:
                    return p
        if btype == "data":
            source = block.get("source") or {}
            if isinstance(source, dict):
                mt = str(source.get("media_type") or "")
                url = str(source.get("url") or "")
                if mt.startswith("image/") or Path(unquote(url)).suffix.lower() in _IMAGE_EXTS:
                    return _url_to_local_path(url)
            # some payloads nest url at top
            return _url_to_local_path(str(block.get("url") or ""))
        # bare url fields
        for key in ("image_url", "url"):
            p = _url_to_local_path(str(block.get(key) or ""))
            if p is not None and p.suffix.lower() in _IMAGE_EXTS:
                return p
        return None

    btype = getattr(block, "type", None)
    if btype == "image":
        for key in ("image_url", "url", "file_url", "path"):
            p = _url_to_local_path(str(getattr(block, key, None) or ""))
            if p is not None:
                return p
    if btype == "data":
        source = getattr(block, "source", None)
        mt = str(getattr(source, "media_type", "") or "")
        url = str(getattr(source, "url", "") or "")
        if mt.startswith("image/") or Path(unquote(url)).suffix.lower() in _IMAGE_EXTS:
            return _url_to_local_path(url)
    return None


def is_image_media_block(block: Any) -> bool:
    return extract_image_path_from_block(block) is not None


def ocr_image_file(path: Path | str, *, lang: str | None = None) -> str:
    """Run tesseract OCR on a local image file. Returns extracted text."""
    path = Path(path)
    if not path.is_file():
        raise FileNotFoundError(f"Image not found: {path}")
    size = path.stat().st_size
    if size <= 0:
        return ""
    if size > _MAX_OCR_BYTES:
        raise ValueError(f"Image too large for OCR ({size} bytes)")

    from PIL import Image, ImageOps
    import pytesseract

    lang = lang or _OCR_LANG
    with Image.open(path) as im:
        im = ImageOps.exif_transpose(im)
        # Convert to RGB for tesseract stability
        if im.mode not in ("RGB", "L"):
            im = im.convert("RGB")
        w, h = im.size
        scale = min(1.0, _MAX_SIDE / max(w, h))
        if scale < 1.0:
            im = im.resize((max(1, int(w * scale)), max(1, int(h * scale))))
        text = pytesseract.image_to_string(im, lang=lang) or ""
    text = text.strip()
    # normalize excessive blank lines
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text


def ocr_block_to_text(block: Any) -> Optional[str]:
    """OCR an image content block. Returns None if not an image / OCR fails."""
    path = extract_image_path_from_block(block)
    if path is None:
        return None
    try:
        text = ocr_image_file(path)
    except Exception as exc:
        logger.warning("OCR failed for %s: %s", path, exc)
        return (
            f"[OCR failed for image `{path.name}`: {exc}. "
            f"Ask the user to re-upload a clearer image or use ocr_image tool.]"
        )
    name = path.name
    if not text:
        return (
            f"[OCR] Image `{name}` contained no detectable text "
            f"(empty OCR result)."
        )
    return (
        f"[OCR text extracted from image `{name}` — "
        f"use this text as the image content]\n{text}"
    )


__all__ = [
    "extract_image_path_from_block",
    "is_image_media_block",
    "ocr_block_to_text",
    "ocr_image_file",
]
