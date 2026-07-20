# Data Layer Notes

## MySQL (`AIWORK_JWT_DB_URL`)

Existing tables (users, roles, departments, file_library, llm_output, presale, …)
remain. Enterprise chat adapter adds:

```sql
-- Optional; created by migrate_qw2.py when AIWORK_CHAT_MYSQL=1
CREATE TABLE IF NOT EXISTS qw2_chats (
  agent_id VARCHAR(128) NOT NULL,
  user_id VARCHAR(128) NOT NULL DEFAULT '',
  payload JSON NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (agent_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## Redis (`AIWORK_REDIS_URL`)

Keep session JTIs and channel lock keys. Prefer prefix `aiwork:` for enterprise;
do not collide with qwenpaw ephemeral keys.

## MinIO

Buckets (`aiwork-files`, LLM output, RAG originals/images) unchanged.
Presigned URL flow stays on enterprise routers.

## Working dir

`.env.qw2` sets both `AIWORK_WORKING_DIR` and `QWENPAW_WORKING_DIR` to `~/.aiwork`
so skills/cache/templates do not relocate.
