# -*- coding: utf-8 -*-
"""CLI entry for AIWork on QwenPaw 2.0 kernel."""
from __future__ import annotations

import logging
import os
import sys

import click
import uvicorn

from aiwork_enterprise.env import (
    apply_console_static_bridge,
    apply_working_dir_bridge,
    get_env,
)


@click.group()
@click.version_option(version="2.0.0", prog_name="aiwork-qw2")
def main() -> None:
    """AIWork-OS CLI backed by QwenPaw 2.0 kernel."""


@main.command("app")
@click.option("--host", default="127.0.0.1", show_default=True)
@click.option("--port", default=8088, type=int, show_default=True)
@click.option("--reload", is_flag=True)
@click.option(
    "--log-level",
    default="info",
    type=click.Choice(
        ["critical", "error", "warning", "info", "debug", "trace"],
        case_sensitive=False,
    ),
)
def app_cmd(host: str, port: int, reload: bool, log_level: str) -> None:
    """Run Console API: QwenPaw 2.0 + enterprise overlay."""
    apply_working_dir_bridge()
    apply_console_static_bridge()
    os.environ.setdefault("AIWORK_KERNEL", "qwenpaw2")
    # Align log env for both stacks
    os.environ.setdefault("AIWORK_LOG_LEVEL", log_level)
    os.environ.setdefault("QWENPAW_LOG_LEVEL", log_level)

    logging.basicConfig(level=getattr(logging, log_level.upper(), logging.INFO))
    click.echo(
        f"Starting AIWork-OS UI backend on QwenPaw 2.0 "
        f"(WORKING_DIR={get_env('AIWORK_WORKING_DIR') or '~/.aiwork'})",
    )
    uvicorn.run(
        "aiwork_enterprise.app:app",
        host=host,
        port=port,
        reload=reload,
        workers=1,
        log_level=log_level if log_level != "trace" else "debug",
    )


@main.command("doctor")
@click.option("--governance-test", is_flag=True, help="Test governance deny rules")
def doctor_cmd(governance_test: bool) -> None:
    """Print kernel / overlay readiness and optionally test governance rules."""
    apply_working_dir_bridge()
    rows = []

    # ── Package presence ──────────────────────────────────────────────────────
    try:
        import qwenpaw

        rows.append(("qwenpaw", getattr(qwenpaw, "__version__", "?")))
    except Exception as exc:  # noqa: BLE001
        rows.append(("qwenpaw", f"MISSING ({exc})"))
    try:
        import aiwork

        from aiwork.__version__ import __version__ as av

        rows.append(("aiwork (enterprise modules)", av))
    except Exception as exc:  # noqa: BLE001
        rows.append(("aiwork", f"MISSING ({exc})"))

    rows.append(("AIWORK_KERNEL", get_env("AIWORK_KERNEL", "qwenpaw2")))
    rows.append(
        (
            "WORKING_DIR",
            get_env("AIWORK_WORKING_DIR")
            or get_env("QWENPAW_WORKING_DIR")
            or "(default)",
        ),
    )

    # ── Critical env-var presence ─────────────────────────────────────────────
    critical = [
        "AIWORK_JWT_SECRET",
        "AIWORK_JWT_DB_URL",
        "AIWORK_REDIS_URL",
    ]
    for env_key in critical:
        val = get_env(env_key, "")
        rows.append((env_key, "[SET]" if val else "[MISSING]"))

    optional = [
        "AIWORK_MINIO_ENDPOINT",
        "AIWORK_PGVECTOR_DB_URL",
        "AIWORK_CONSOLE_STATIC_DIR",
    ]
    for env_key in optional:
        val = get_env(env_key, "")
        rows.append((f"{env_key} (optional)", "[SET]" if val else "[not set]"))

    # ── Governance seed check ─────────────────────────────────────────────────
    try:
        from aiwork_enterprise.governance.presets import ensure_enterprise_policy

        seed = ensure_enterprise_policy()
        rows.append(("governance seed", str(seed)))
    except Exception as exc:  # noqa: BLE001
        rows.append(("governance seed", f"ERROR: {exc}"))

    click.echo("")
    click.echo("AIWork-OS QW2 Doctor Report")
    click.echo("=" * 40)
    for k, v in rows:
        icon = "OK" if "[MISSING]" not in v and "ERROR" not in v else "!!"
        click.echo(f"  {icon}  {k}: {v}")

    # ── Optional governance deny test ─────────────────────────────────────────
    if governance_test:
        click.echo("")
        click.echo("Governance deny test:")
        from aiwork_enterprise.governance.presets import _ENTERPRISE_RULES

        deny = [r for r in _ENTERPRISE_RULES if r["action"] == "deny"]
        ask = [r for r in _ENTERPRISE_RULES if r["action"] == "ask"]
        allow = [r for r in _ENTERPRISE_RULES if r["action"] == "allow"]
        click.echo(f"  deny rules: {len(deny)}")
        click.echo(f"  ask rules:  {len(ask)}")
        click.echo(f"  allow rules: {len(allow)}")
        click.echo("  OK Governance rules loaded OK")

    click.echo("")


if __name__ == "__main__":
    sys.exit(main())
