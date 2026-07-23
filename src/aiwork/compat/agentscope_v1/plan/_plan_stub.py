# -*- coding: utf-8 -*-
"""agentscope.plan.Plan stub."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class Plan:
    steps: list[Any] = field(default_factory=list)
    current_step: int = 0
    done: bool = False

    def next_step(self) -> Any:
        if self.current_step < len(self.steps):
            s = self.steps[self.current_step]
            self.current_step += 1
            return s
        self.done = True
        return None

    def __bool__(self) -> bool:
        return not self.done


__all__ = ["Plan"]
