# Chat Protocol Checklist (Phase 1 gate)

Validate AIWork Console Chat against QwenPaw 2.0 message stream before P1.

| Case | Expect |
|------|--------|
| Text stream | Tokens render incrementally |
| Stop generation | UI stop ends runner task |
| File / image card | Preview URL via enterprise `/api/llm-outputs` or `/api/files` |
| Tool call blocks | Match existing Console components |
| Multi-agent switch | `X-Agent-Id` + agent store |
| History reload | Rows from MySQL adapter (or JSON fallback) |
| Plan / Ask mode | Existing RunModeSelector still works |

If protocol drifts, add a thin mapper in `packages/aiwork-enterprise/aiwork_enterprise/compat/chat_protocol.py`.
