# -*- coding: utf-8 -*-
"""Deprecated CLI — forwards to in-tree ``aiwork.cli.main``."""
from __future__ import annotations

import warnings

import click


@click.group()
@click.version_option(version="2.0.0-deprecated", prog_name="aiwork-qw2")
def main() -> None:
    """Deprecated: use ``aiwork`` (in-tree QwenPaw 2.0 fork)."""


@main.command("app")
@click.option("--host", default="127.0.0.1", show_default=True)
@click.option("--port", default="8088", type=int, show_default=True)
@click.option("--reload", is_flag=True)
@click.option("--log-level", default="info")
def app_cmd(host: str, port: int, reload: bool, log_level: str) -> None:
    warnings.warn(
        "aiwork-qw2 / aiwork_enterprise.cli is deprecated; use `aiwork app`.",
        DeprecationWarning,
        stacklevel=2,
    )
    import uvicorn

    uvicorn.run(
        "aiwork.app._app:app",
        host=host,
        port=port,
        reload=reload,
        workers=1,
        log_level=log_level if log_level != "trace" else "debug",
    )


@main.command("doctor")
@click.option("--governance-test", is_flag=True)
def doctor_cmd(governance_test: bool) -> None:
    """Forward to in-tree enterprise doctor helpers."""
    from aiwork.app.enterprise_doctor import run_doctor

    raise SystemExit(run_doctor(governance_test=governance_test))


if __name__ == "__main__":
    main()
