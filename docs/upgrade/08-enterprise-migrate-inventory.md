# Enterprise modules to migrate into QwenPaw 2.0 fork

Baseline:
- Upstream kernel: `qwenpaw==2.0.0.post3` (see `qwenpaw2.lock.txt`)
- Pre-merge AIWork commit: `b25aabb5fe3623a1460db613e7c23321f4093897`
- Rollback tag: `aiwork-1.1.5-pre-merge`

Kernel (use 2.0 source as-is after rename `qwenpaw` → `aiwork`):
- agents, app (minus enterprise overlays), cli, config, providers,
  security, skills/runtime surfaces already in 2.0, channels, etc.

## Must migrate from AIWork 1.x / overlay (whitelist)

### Auth / security
| Source | Target under `src/aiwork/` |
|--------|----------------------------|
| `src/aiwork/app/auth_jwt/` | `app/auth_jwt/` |
| `src/aiwork/app/security_headers.py` | `app/security_headers.py` |
| `packages/.../auth_bridge.py` | `app/auth_bridge.py` (JWT status for Console) |
| `packages/.../security_bridge.py` | `app/security_bridge.py` |
| `packages/.../governance/presets.py` | `governance/enterprise_presets.py` |

### Enterprise data / routers
| Source | Target |
|--------|--------|
| `src/aiwork/app/routers/token_usage.py` | `app/routers/token_usage.py` (or keep 2.0 if present) |
| `src/aiwork/app/routers/department.py` | `app/routers/department.py` |
| `src/aiwork/file_library/` | `file_library/` |
| `src/aiwork/app/routers/file_library.py` | `app/routers/file_library.py` |
| `src/aiwork/app/routers/llm_output.py` | `app/routers/llm_output.py` |
| `src/aiwork/app/routers/presale_template.py` | `app/routers/presale_template.py` |
| `src/aiwork/rag/` | `rag/` |
| `src/aiwork/app/routers/rag.py` | `app/routers/rag.py` |
| `packages/.../storage/mysql_chat_repo.py` | `app/runner/repo/mysql_chat_repo.py` |
| `packages/.../minio_startup.py` | `app/minio_startup.py` |

### Bridges → native helpers
| Source | Target |
|--------|--------|
| `packages/.../mount.py` (logic) | `app/enterprise_mount.py` |
| `packages/.../cron_bridge.py` | merge with 2.0 cron if needed |
| `packages/.../memory_bridge.py` | `app/memory_bridge.py` |
| `packages/.../channels_bridge.py` | `app/channels_bridge.py` |
| `packages/.../env.py` | fold into `constant.py` / `envs` |
| `packages/.../compat/agentscope_v1/` | `compat/agentscope_v1/` |

### UI
| Source | Target |
|--------|--------|
| `console/` (AIWork) | keep as product Console; default static dir |
| Upstream `qwenpaw/console` | do not ship as default UI |

## Do NOT migrate (use 2.0 kernel)
- `agents/` runner/react (1.x), overlapping channels, MCP client core,
  providers core, plan/loop native 2.0 paths, default auth (non-JWT).

## Post-merge entry
- `python -m aiwork app` → `aiwork.app._app:app`
- No runtime `import qwenpaw`
