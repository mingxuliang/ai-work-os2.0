# Phase 0 — Baseline Freeze

| Item | Value |
|------|-------|
| Date | 2026-07-20 |
| AIWork commit | `081c5b22ffd66cd9a8fdc3c0412dc0a77ea7574e` |
| AIWork version | `1.1.5.post2` |
| Locked QwenPaw | `2.0.0.post3` (see [qwenpaw2.lock.txt](qwenpaw2.lock.txt)) |
| Locked AgentScope | `2.0.4.post1` |
| Architecture | AIWork Console UI + QwenPaw 2.0 kernel + `aiwork-enterprise` overlay |

## Rollback point

- Keep AIWork 1.x image/container tagged `aiwork-1.1.5.post2-081c5b2`.
- Do not delete MySQL / Redis / MinIO / `~/.aiwork` until Phase 5 +7 days.

## Deliverables in this folder

| File | Purpose |
|------|---------|
| [01-api-inventory.md](01-api-inventory.md) | AIWork REST surface to preserve |
| [02-env-mapping.md](02-env-mapping.md) | `AIWORK_*` ↔ `QWENPAW_*` dual-read |
| [03-frontend-routes.md](03-frontend-routes.md) | Console pages kept as UI shell |
| [04-chat-protocol.md](04-chat-protocol.md) | Chat message protocol checklist |
| [05-schema-notes.md](05-schema-notes.md) | MySQL / Redis / MinIO notes |
| [cutover-runbook.md](cutover-runbook.md) | Phase 5 ops runbook |
| [qwenpaw2.lock.txt](qwenpaw2.lock.txt) | Exact kernel versions |
