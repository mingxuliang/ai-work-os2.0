# aiwork-enterprise

Enterprise overlay that mounts AIWork-OS self-developed capabilities onto the
**QwenPaw 2.0** kernel while keeping the **AIWork Console UI**.

## Install

```bash
pip install -e ./packages/aiwork-enterprise
pip install -e ".[qw2]"   # from repo root
```

## Run

```bash
export AIWORK_KERNEL=qwenpaw2
export AIWORK_WORKING_DIR=~/.aiwork
export QWENPAW_WORKING_DIR=~/.aiwork
aiwork app
# or: aiwork-qw2 app
```

## What it mounts

- JWT / RBAC middleware + `/api/auth/jwt/*`
- Security response headers
- MySQL chat repository patch (optional `AIWORK_CHAT_MYSQL=1`)
- Token usage, departments, MinIO file/llm/presale, RAG routers
- Governance enterprise seed (`cache/`, `skills/`, `media/`)
- Console static bridge → AIWork `console/dist`
