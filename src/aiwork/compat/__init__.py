# -*- coding: utf-8 -*-
"""AIWork compatibility shims."""
from __future__ import annotations


def install_agentscope_v1_compat():
    from .agentscope_v1 import install

    return install()


__all__ = ["install_agentscope_v1_compat"]
