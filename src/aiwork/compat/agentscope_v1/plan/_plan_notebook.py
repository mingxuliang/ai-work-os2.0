# -*- coding: utf-8 -*-
"""agentscope.plan._plan_notebook shim."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional


class DefaultPlanToHint:
    """Minimal shim for agentscope 1.x DefaultPlanToHint."""

    def to_hint(self, plan: Any) -> str:
        if plan is None:
            return ""
        steps = getattr(plan, "steps", []) or []
        if not steps:
            return str(plan)
        lines = ["Plan:"]
        for i, s in enumerate(steps, 1):
            desc = getattr(s, "description", str(s)) if not isinstance(s, dict) else s.get("description", str(s))
            done = getattr(s, "done", False) if not isinstance(s, dict) else s.get("done", False)
            status = "[x]" if done else "[ ]"
            lines.append(f"  {i}. {status} {desc}")
        return "\n".join(lines)


@dataclass
class PlanNotebook:
    steps: list[Any] = field(default_factory=list)

    def add_step(self, description: str, *, done: bool = False) -> None:
        self.steps.append({"description": description, "done": done})

    def mark_done(self, index: int) -> None:
        if 0 <= index < len(self.steps):
            self.steps[index]["done"] = True


class InMemoryPlanStorage:
    def __init__(self) -> None:
        self._plans: dict[str, Any] = {}

    def save(self, agent_id: str, plan: Any) -> None:
        self._plans[agent_id] = plan

    def load(self, agent_id: str) -> Optional[Any]:
        return self._plans.get(agent_id)

    def delete(self, agent_id: str) -> None:
        self._plans.pop(agent_id, None)


__all__ = ["DefaultPlanToHint", "PlanNotebook", "InMemoryPlanStorage"]
