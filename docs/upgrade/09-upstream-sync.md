# Upstream sync for in-tree QwenPaw 2.0 fork

## Remotes

```bash
git remote add upstream https://github.com/agentscope-ai/QwenPaw.git   # once
git fetch upstream --tags
```

Pinned baseline: `qwenpaw==2.0.0.post3` (tag / sdist under `vendor/`).

Rollback before this merge: git tag `aiwork-1.1.5-pre-merge`.

## Safe edit zones (prefer)

Keep enterprise deltas in these prefixes to reduce merge conflicts:

- `src/aiwork/app/auth_jwt/`
- `src/aiwork/app/auth_bridge.py`
- `src/aiwork/app/enterprise_*.py`
- `src/aiwork/app/security_headers.py`
- `src/aiwork/app/minio_startup.py`
- `src/aiwork/app/runner/repo/mysql_chat_repo.py`
- `src/aiwork/file_library/`, `llm_output/`, `presale_template/`, `rag/`, `department/`
- `src/aiwork/governance/enterprise_presets.py`
- `src/aiwork/compat/agentscope_v1/`
- `console/` (AIWork UI — never replace with upstream Console as default)

## Kernel zones (upstream wins)

Avoid untracked edits under agents/runtime/loop/drivers unless necessary.
Prefer cherry-pick upstream patches into a tracking branch, then merge.

## Acceptance smoke

```powershell
$env:PYTHONPATH="$PWD\src"
# load deploy/qw2/.env.qw2
aiwork enterprise-doctor --governance-test
python -c "from aiwork.app._app import app; print(len(app.routes))"
# Manual: login JWT, chat stream, /api/files, /api/departments, /api/rag
```

Do **not** require `import qwenpaw` for the product path.
