# Frontend Routes — AIWork Console (kept)

Shell: existing [`console/`](../../console/). Do **not** switch to upstream QwenPaw Console branding.

## Self-developed / enterprise pages

| Route area | Page dir |
|------------|----------|
| Login | `pages/Login` |
| Workbench | `pages/Workbench` |
| Material Center | `pages/MaterialCenter` |
| Org Builder | `pages/OrgBuilder` |
| Org Chart | `pages/OrgChart` |
| Knowledge Base | `pages/KnowledgeBase` |
| AiOkr | `pages/AiOkr` |
| News | `pages/News` |
| Users | `pages/Settings/Users` |
| Token Usage | `pages/Settings/TokenUsage` |

## Shared with kernel

Chat, Control (Channels/Cron/Heartbeat/Sessions), Agent (Skills/MCP/Tools/Workspace),
Settings (Models/Security/SkillPool/Backups/…).

## Compat layer

[`console/src/compat/qw2Storage.ts`](../../console/src/compat/qw2Storage.ts) reads both
`aiwork*` and `qwenpaw*` / `copaw*` localStorage keys.
