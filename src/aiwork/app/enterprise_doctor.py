# -*- coding: utf-8 -*-
"""In-tree doctor for AIWork-OS (forked QwenPaw 2.0 + enterprise)."""
from __future__ import annotations

import socket
from pathlib import Path
from urllib.parse import urlparse

from aiwork.app.enterprise_env import get_env


def run_doctor(*, governance_test: bool = False) -> int:
    rows: list[tuple[str, str]] = []

    try:
        import aiwork
        from aiwork.__version__ import __version__ as av

        rows.append(("aiwork", av))
        rows.append(("aiwork.__file__", str(Path(aiwork.__file__).resolve())))
    except Exception as exc:  # noqa: BLE001
        rows.append(("aiwork", f"MISSING ({exc})"))

    # Ensure no hard runtime dependency on pip qwenpaw for product path
    try:
        import qwenpaw  # noqa: F401

        rows.append(
            (
                "pip qwenpaw",
                "PRESENT (optional; product uses in-tree src/aiwork)",
            ),
        )
    except Exception:
        rows.append(("pip qwenpaw", "absent (OK for fork mode)"))

    try:
        from aiwork.compat.agentscope_v1 import doctor_check

        for label, status in doctor_check():
            rows.append((label, status))
    except Exception as exc:  # noqa: BLE001
        rows.append(("agentscope_v1_compat", f"ERROR: {exc}"))

    weak_secrets = {"change-me", "changeme", "secret", "jwt-secret", "test"}
    for env_key in ("AIWORK_JWT_SECRET", "AIWORK_JWT_DB_URL", "AIWORK_REDIS_URL"):
        val = get_env(env_key, "")
        if not val:
            rows.append((env_key, "[MISSING]"))
        elif env_key == "AIWORK_JWT_SECRET" and val.strip().lower() in weak_secrets:
            rows.append((env_key, "WEAK (replace before production)"))
        else:
            rows.append((env_key, "[SET]"))

    console_dir = get_env("AIWORK_CONSOLE_STATIC_DIR") or get_env(
        "QWENPAW_CONSOLE_STATIC_DIR",
        "",
    )
    if console_dir:
        index = Path(console_dir).expanduser() / "index.html"
        rows.append(
            (
                "console/dist/index.html",
                "OK" if index.is_file() else f"MISSING ({index})",
            ),
        )
    else:
        rows.append(("console/dist/index.html", "[not set — using package fallback]"))

    minio_ep = get_env("AIWORK_MINIO_ENDPOINT", "")
    if minio_ep:
        try:
            raw = minio_ep if "://" in minio_ep else f"http://{minio_ep}"
            parsed = urlparse(raw)
            host = parsed.hostname or "127.0.0.1"
            port = parsed.port or (443 if parsed.scheme == "https" else 9000)
            with socket.create_connection((host, port), timeout=2.0):
                rows.append(("minio_tcp", f"OK {host}:{port}"))
        except Exception as exc:  # noqa: BLE001
            rows.append(("minio_tcp", f"FAIL ({exc})"))

    try:
        from aiwork.governance.enterprise_presets import ensure_enterprise_policy

        seed = ensure_enterprise_policy()
        rows.append(("governance seed", str(seed)))
    except Exception as exc:  # noqa: BLE001
        rows.append(("governance seed", f"ERROR: {exc}"))

    try:
        from aiwork.app.enterprise_mount import prioritize_api_before_spa
        from fastapi import FastAPI
        from starlette.routing import Route

        probe = FastAPI()

        async def _spa(_request):  # noqa: ANN001
            return None

        async def _api(_request):  # noqa: ANN001
            return None

        probe.router.routes.append(
            Route("/{full_path:path}", _spa, name="qwenpaw_console_spa_catchall"),
        )
        probe.router.routes.append(Route("/api/files/x", _api, name="files"))
        moved = prioritize_api_before_spa(probe)
        last = getattr(probe.router.routes[-1], "name", None)
        ok = moved == 1 and last == "qwenpaw_console_spa_catchall"
        rows.append(("spa_reorder", "OK" if ok else "FAIL"))
    except Exception as exc:  # noqa: BLE001
        rows.append(("spa_reorder", f"ERROR: {exc}"))

    print("")
    print("AIWork-OS Fork Doctor Report")
    print("=" * 40)
    issues = 0
    for k, v in rows:
        bad = (
            "[MISSING]" in v
            or "ERROR" in v
            or "WEAK" in v
            or v.startswith("FAIL")
            or v.startswith("MISSING")
        )
        if bad:
            issues += 1
        icon = "!!" if bad else "OK"
        print(f"  {icon}  {k}: {v}")

    if governance_test:
        print("")
        print("Governance deny test:")
        from aiwork.governance.enterprise_presets import _ENTERPRISE_RULES

        deny = [r for r in _ENTERPRISE_RULES if r["action"] == "deny"]
        ask = [r for r in _ENTERPRISE_RULES if r["action"] == "ask"]
        allow = [r for r in _ENTERPRISE_RULES if r["action"] == "allow"]
        print(f"  deny rules: {len(deny)}")
        print(f"  ask rules:  {len(ask)}")
        print(f"  allow rules: {len(allow)}")
        print("  OK Governance rules loaded OK")

    print("")
    if issues:
        print(f"Doctor found {issues} issue(s).")
        return 1
    print("Doctor: all checks passed.")
    return 0
