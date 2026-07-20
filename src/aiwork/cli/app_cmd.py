# -*- coding: utf-8 -*-
from __future__ import annotations

import logging
import os

import click
import uvicorn

from ..constant import LOG_LEVEL_ENV
from ..config.utils import write_last_api
from ..utils.logging import setup_logger, SuppressPathAccessLogFilter


@click.command("app")
@click.option(
    "--host",
    default="127.0.0.1",
    show_default=True,
    help="Bind host",
)
@click.option(
    "--port",
    default=8088,
    type=int,
    show_default=True,
    help="Bind port",
)
@click.option("--reload", is_flag=True, help="Enable auto-reload (dev only)")
@click.option(
    "--log-level",
    default="info",
    type=click.Choice(
        ["critical", "error", "warning", "info", "debug", "trace"],
        case_sensitive=False,
    ),
    show_default=True,
    help="Log level",
)
@click.option(
    "--hide-access-paths",
    multiple=True,
    default=("/console/push-messages",),
    show_default=True,
    help="Path substrings to hide from uvicorn access log (repeatable).",
)
@click.option(
    "--workers",
    type=int,
    default=None,
    help="[DEPRECATED] Number of worker processes. "
    "This option is deprecated and will be removed in a future version. "
    "AiWork always uses 1 worker.",
)
def app_cmd(
    host: str,
    port: int,
    reload: bool,
    workers: int,  # pylint: disable=unused-argument
    log_level: str,
    hide_access_paths: tuple[str, ...],
) -> None:
    """Run AiWork FastAPI app."""
    # Handle deprecated --workers parameter
    if workers is not None:
        click.echo(
            "⚠️  WARNING: --workers option is deprecated and will be removed "
            "in a future version.",
            err=True,
        )
        click.echo(
            "   AiWork always uses 1 worker for stability. "
            "Your specified value will be ignored.",
            err=True,
        )
        click.echo(err=True)

    # Persist last used host/port for other terminals
    if host == "0.0.0.0":
        write_last_api("127.0.0.1", port)
    else:
        write_last_api(host, port)
    os.environ[LOG_LEVEL_ENV] = log_level

    # Signal reload mode to browser_control.py for Windows
    # compatibility: use sync Playwright + ThreadPool only when reload=True
    if reload:
        os.environ["AIWORK_RELOAD_MODE"] = "1"
    else:
        os.environ.pop("AIWORK_RELOAD_MODE", None)

    setup_logger(log_level)
    if log_level in ("debug", "trace"):
        from .main import log_init_timings

        log_init_timings()

    paths = [p for p in hide_access_paths if p]
    if paths:
        logging.getLogger("uvicorn.access").addFilter(
            SuppressPathAccessLogFilter(paths),
        )

    # QwenPaw 2.0 kernel + enterprise overlay (AIWork Console UI unchanged)
    kernel = os.environ.get("AIWORK_KERNEL", "").strip().lower()
    if kernel in ("qwenpaw2", "qw2", "2", "2.0"):
        try:
            from aiwork_enterprise.env import (
                apply_console_static_bridge,
                apply_working_dir_bridge,
            )

            apply_working_dir_bridge()
            apply_console_static_bridge()
        except ImportError as exc:
            raise click.ClickException(
                "AIWORK_KERNEL=qwenpaw2 requires packages/aiwork-enterprise. "
                "Install with: pip install -e ./packages/aiwork-enterprise "
                f"({exc})",
            ) from exc
        os.environ.setdefault("QWENPAW_LOG_LEVEL", log_level)
        click.echo(
            "Starting AIWork-OS UI on QwenPaw 2.0 kernel "
            "(enterprise overlay enabled)",
            err=True,
        )
        uvicorn.run(
            "aiwork_enterprise.app:app",
            host=host,
            port=port,
            reload=reload,
            workers=1,
            log_level=log_level,
        )
        return

    uvicorn.run(
        "aiwork.app._app:app",
        host=host,
        port=port,
        reload=reload,
        workers=1,
        log_level=log_level,
    )
