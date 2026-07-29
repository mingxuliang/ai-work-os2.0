# -*- coding: utf-8 -*-
"""Runtime prompt injection detection for user-supplied text.

Scans user input against pre-compiled regex patterns before it reaches
the LLM.  Reuses the same signature rules as the skill scanner
(``prompt_injection.yaml``) but applies them to live user messages
rather than static skill files.

Usage::

    from aiwork.security.prompt_guard import PromptGuard

    PromptGuard.scan_or_raise(user_text)
"""
from __future__ import annotations

import logging
import re
from pathlib import Path
from typing import Any, Dict, List

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# PromptInjectionError
# ---------------------------------------------------------------------------


class PromptInjectionError(Exception):
    """Raised when prompt injection patterns are detected in user input."""

    def __init__(self, findings: list[dict], user_text_snippet: str) -> None:
        self.findings = findings
        self.user_text_snippet = user_text_snippet
        rules = ", ".join(f["rule_id"] for f in findings)
        super().__init__(
            f"Prompt injection detected: {len(findings)} match(es) "
            f"against rules [{rules}]. Input rejected.",
        )


# ---------------------------------------------------------------------------
# Text extraction helper
# ---------------------------------------------------------------------------


def extract_text_from_content_parts(content_parts: List[Any]) -> str:
    """Extract and concatenate all text from channel content_parts.

    Handles three forms commonly seen in the codebase:

    * ``TextContent`` objects (agentscope_runtime type with ``.type``
      and ``.text`` attributes)
    * Plain ``dict`` (e.g. ``{"type": "text", "text": "hello"}``)
    * Bare ``str`` values

    Non-text parts (images, files, audio, etc.) are silently skipped.
    """
    texts: list[str] = []
    for part in content_parts:
        if isinstance(part, str):
            texts.append(part)
            continue
        if isinstance(part, dict):
            if part.get("type") == "text":
                texts.append(str(part.get("text", "")))
            continue
        if hasattr(part, "type") and hasattr(part, "text"):
            # agentscope_runtime TextContent / ContentType enums
            type_val = getattr(part, "type", None)
            # ContentType.TEXT is the string "text"; support both enum and str
            if type_val is not None and str(type_val).lower() == "text":
                texts.append(str(getattr(part, "text", "")))
    return " ".join(texts)


# ---------------------------------------------------------------------------
# PromptGuard
# ---------------------------------------------------------------------------


class PromptGuard:
    """Class-method singleton for scanning text against prompt injection rules.

    Rules are loaded from the skill scanner's ``prompt_injection.yaml``
    on first use (lazy initialisation) and compiled once.  All methods
    are classmethods — no instance creation is needed.
    """

    _rules: list[dict] = []
    _compiled: list[tuple[re.Pattern, dict]] = []
    _loaded: bool = False

    # ------------------------------------------------------------------
    # Rule loading
    # ------------------------------------------------------------------

    @classmethod
    def _load_rules(cls) -> None:
        """Load ``prompt_injection.yaml`` and compile every pattern.

        Patterns are sorted so that HIGH severity and longer (more
        specific) patterns are checked first, maximising the chance of
        early termination on malicious input.
        """
        if cls._loaded:
            return

        import yaml

        yaml_path = (
            Path(__file__).resolve().parent
            / "skill_scanner"
            / "rules"
            / "signatures"
            / "prompt_injection.yaml"
        )

        try:
            with open(yaml_path, encoding="utf-8") as fh:
                raw = yaml.safe_load(fh)
        except Exception as exc:
            logger.error("Failed to load prompt_injection.yaml: %s", exc)
            cls._loaded = True  # mark loaded so we don't retry every call
            return

        if not isinstance(raw, list):
            logger.error("prompt_injection.yaml must contain a list of rules")
            cls._loaded = True
            return

        cls._rules = raw

        for rule in raw:
            rule_id = rule.get("id", "?")
            for pat_str in rule.get("patterns", []):
                try:
                    compiled = re.compile(pat_str)
                    cls._compiled.append((compiled, rule))
                except re.error:
                    logger.warning(
                        "Bad regex in rule %s: %s", rule_id, pat_str,
                    )

        # Sort: HIGH first, then by descending pattern length
        severity_order: dict[str, int] = {
            "HIGH": 0, "MEDIUM": 1, "LOW": 2, "INFO": 3,
        }

        def _sort_key(
            item: tuple[re.Pattern, dict],
        ) -> tuple[int, int]:
            _pat, rule = item
            sev = severity_order.get(rule.get("severity", "INFO"), 99)
            return (sev, -len(_pat.pattern))

        cls._compiled.sort(key=_sort_key)

        cls._loaded = True
        logger.debug(
            "PromptGuard loaded %d rules (%d compiled patterns)",
            len(cls._rules), len(cls._compiled),
        )

    # ------------------------------------------------------------------
    # Scanning
    # ------------------------------------------------------------------

    @classmethod
    def scan(cls, text: str) -> list[dict]:
        """Scan *text* for prompt injection patterns.

        Returns a list of finding dicts, one per matched rule.  Each
        dict contains ``rule_id``, ``category``, ``severity``,
        ``description``, ``remediation``, ``matched_pattern``, and
        ``matched_text``.
        """
        cls._load_rules()
        findings: list[dict] = []
        for compiled, rule in cls._compiled:
            m = compiled.search(text)
            if m:
                findings.append({
                    "rule_id": rule["id"],
                    "category": rule.get("category", ""),
                    "severity": rule.get("severity", ""),
                    "description": rule.get("description", ""),
                    "remediation": rule.get("remediation", ""),
                    "matched_pattern": compiled.pattern,
                    "matched_text": m.group(0)[:200],
                })
        return findings

    @classmethod
    def scan_or_raise(cls, text: str) -> None:
        """Scan *text* and raise :class:`PromptInjectionError` if anything
        is detected."""
        findings = cls.scan(text)
        if findings:
            raise PromptInjectionError(
                findings=findings,
                user_text_snippet=text[:200],
            )

    @classmethod
    def is_safe(cls, text: str) -> bool:
        """Return ``True`` if no injection patterns are detected."""
        return len(cls.scan(text)) == 0
