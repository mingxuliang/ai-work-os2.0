# -*- coding: utf-8 -*-
"""CLI: ``aiwork enterprise-doctor``."""
from __future__ import annotations

import click


@click.command("enterprise-doctor")
@click.option("--governance-test", is_flag=True)
def enterprise_doctor_cmd(governance_test: bool) -> None:
    """Check forked kernel + enterprise mounts / env readiness."""
    from aiwork.app.enterprise_doctor import run_doctor

    raise SystemExit(run_doctor(governance_test=governance_test))
