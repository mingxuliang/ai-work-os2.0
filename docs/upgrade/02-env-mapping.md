# Environment Variable Dual-Read

Priority: `AIWORK_*` → `QWENPAW_*` → `COPAW_*` (legacy) → default.

| AIWork key | QwenPaw key | Notes |
|------------|-------------|-------|
| `AIWORK_WORKING_DIR` | `QWENPAW_WORKING_DIR` | Default keep `~/.aiwork` via `.env.qw2` |
| `AIWORK_SECRET_DIR` | `QWENPAW_SECRET_DIR` | Secrets |
| `AIWORK_LOG_LEVEL` | `QWENPAW_LOG_LEVEL` | Logging |
| `AIWORK_JWT_SECRET` | — | Enterprise only |
| `AIWORK_JWT_DB_URL` | — | MySQL users/RBAC |
| `AIWORK_REDIS_URL` | — | Session cache / channel locks |
| `AIWORK_MINIO_*` | — | File / LLM output / templates |
| `AIWORK_PGVECTOR_DB_URL` | — | RAG |
| `AIWORK_SECURITY_HEADERS` | — | Security middleware |
| `AIWORK_INTERNAL_TOKEN` | — | CLI bypass |
| `AIWORK_KERNEL` | — | `qwenpaw2` enables overlay mode |
| `MEMORY_MANAGER_BACKEND` / `MEM0_*` | ReMe 0.4 | Phase 3 decision |

Template: [`deploy/qw2/.env.qw2`](../../deploy/qw2/.env.qw2)
