# -*- coding: utf-8 -*-
"""Optional QwenPaw workspace plugin entry (HOOK).

Primary mount path is ``aiwork_enterprise.app`` (ASGI). This plugin
allows installing the overlay via WORKING_DIR/plugins as well.
"""
from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


class AiworkEnterprisePlugin:
    def register(self, api) -> None:  # type: ignore[no-untyped-def]
        api.register_startup_hook("aiwork_enterprise_init", self.on_startup, priority=10)

    async def on_startup(self) -> None:
        logger.info(
            "aiwork-enterprise plugin startup hook — "
            "prefer AIWORK_KERNEL=qwenpaw2 + aiwork_enterprise.app for full mount",
        )


plugin = AiworkEnterprisePlugin()
