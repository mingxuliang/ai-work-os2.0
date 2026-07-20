# API Inventory — Preserve under `/api/*`

Enterprise overlay mounts these routers onto the QwenPaw 2.0 FastAPI app.
Paths stay stable so the AIWork Console needs minimal changes.

## P0

| Prefix | Module | Notes |
|--------|--------|-------|
| `/api/auth/jwt/*` | `aiwork.app.auth_jwt` | Login / register / refresh |
| `/api/auth/status` | alias | Always `{mode: jwt, enabled: true}` |
| `/api/token-usage` | `aiwork.app.routers.token_usage` | Usage dashboards |
| `/api/chats` (kernel) | QwenPaw chats + MySQL adapter | Persistence via enterprise repo |

## P1

| Prefix | Module |
|--------|--------|
| `/api/files` | `file_library` (MinIO) |
| `/api/llm-outputs` | `llm_output` |
| `/api/presale-templates` | `presale_template` |
| `/api/rag` | `rag` |
| `/api/departments` | `department` |

## Kernel (QwenPaw 2.0 — keep)

Agents, config, skills, MCP, workspace, cron, providers, backup, plan, loops,
coding-mode, tool-calls, approval — served by upstream qwenpaw routers.

## Auth headers (Console)

- `Authorization: Bearer <jwt>`
- `X-Agent-Id: <agentId>` when agent-scoped
