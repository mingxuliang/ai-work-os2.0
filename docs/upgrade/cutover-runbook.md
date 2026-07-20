# Phase 5 — Cutover Runbook

## Preconditions

- [ ] All unit tests pass: `pytest tests/unit/ -q`
- [ ] `aiwork-qw2 doctor --governance-test` exits 0 on staging
- [ ] Phase 0–4 acceptance checklist in `docs/upgrade/06-acceptance-checklist.md` signed off
- [ ] Baseline tag `aiwork-1.1.5.post2-081c5b2` image retained in container registry
- [ ] Full backup: MySQL / Redis RDB / MinIO buckets / `~/.aiwork`
- [ ] `.env.qw2` reviewed (no default/placeholder secrets, JWT_SECRET rotated)
- [ ] QwenPaw 2.0.x version pinned in virtual-env: `pip show qwenpaw`

---

## Cutover Steps

### Step 1 — Freeze production writes
```bash
# Put AIWork 1.x into maintenance mode (show banner, set read-only DNS weight)
# Log the freeze timestamp for audit trail
echo "Freeze start: $(date -Iseconds)" >> ops/cutover.log
```

### Step 2 — Final snapshot backup
```bash
# MySQL
mysqldump -u root -p aiwork_db > backup/aiwork-$(date +%Y%m%d%H%M%S).sql

# Redis
redis-cli BGSAVE && cp /var/lib/redis/dump.rdb backup/redis-$(date +%Y%m%d%H%M%S).rdb

# Working dir
tar -czf backup/aiwork-wd-$(date +%Y%m%d%H%M%S).tar.gz ~/.aiwork
```

### Step 3 — Run all migrations
```bash
# From repo root, with .qw2 venv active:
python deploy/qw2/migrate_qw2.py --all
# Expected output: OK for each of governance, skills, rag, chat-table
```

### Step 4 — Start QW2 backend (canary host, 10% traffic)
```powershell
# Windows
.\deploy\qw2\start_qw2.ps1
```
```bash
# Linux/macOS
bash deploy/qw2/start_qw2.sh
```

### Step 5 — Smoke tests (Definition of Done)

| Check | Command / Steps | Expected |
|---|---|---|
| JWT login (admin) | `POST /api/auth/jwt/login` | 200 + token |
| JWT login (user) | same with user creds | 200 + token |
| Chat persists | Create chat, restart, reload | Messages present |
| Token usage page | `GET /api/token-usage` | JSON with totals |
| Material Center | Upload a file → download | Same file |
| Dept CRUD | `GET /api/departments` | List returned |
| RAG search | `POST /api/rag/search` | Results (if pgvector set) |
| Bidding skill | Trigger skill run | cache/biaoshumuban accessed |
| Governance deny | `aiwork-qw2 doctor --governance-test` | deny rules: 1 |
| Security headers | `curl -v https://host/api/version` | X-Content-Type-Options: nosniff |
| 401 guard | `GET /api/token-usage` without token | 401 |

### Step 6 — Shift traffic
```
10%  → verify no spike in error rate (≥ 5 min)
50%  → verify
100% → verify
```

### Step 7 — Post-cutover hardening
- Disable dual-write: `AIWORK_SCHEDULER_DUAL_WRITE=false`
- Update ops wiki with `aiwork-qw2 doctor` output
- Schedule 1.x decommission after **+7 days** healthy
- Rotate JWT secret again (first rotation was pre-cutover)
- Archive pre-cutover backup files to cold storage

---

## Rollback Procedure

### Trigger rollback if:
- P0 auth outage (any user cannot log in)
- Chat history loss or corruption
- Security regression (unauthenticated API access)
- Sandbox incorrectly open (shell deny rule not firing)
- Error rate > 1% sustained for 5 minutes after traffic shift

### Steps:
```bash
# 1. Redirect load balancer / docker-compose back to 1.x container
#    (no DB changes needed unless dual-write was active)

# 2. If dual-write was enabled and MySQL has diverged:
mysql -u root -p aiwork_db < backup/aiwork-<timestamp>.sql

# 3. Log rollback timestamp
echo "Rollback: $(date -Iseconds)" >> ops/cutover.log

# 4. Do NOT delete WORKING_DIR until root-cause is captured
```

---

## Git Tag after Successful Cutover

```bash
git tag -a qw2-cutover-live-$(date +%Y%m%d) \
  -m "AIWork-OS on QwenPaw 2.0 — production cutover complete"
git push origin qw2-cutover-live-$(date +%Y%m%d)
```

---

## Ops Runbook Checklist

- [ ] `migrate_qw2.py --all` output saved to `ops/migrate-qw2-<date>.log`
- [ ] `aiwork-qw2 doctor` output saved to `ops/doctor-qw2-<date>.log`
- [ ] All smoke tests checked above
- [ ] Traffic shift recorded in `ops/cutover.log`
- [ ] Post-cutover git tag created
- [ ] Dual-write disabled
- [ ] AIWork 1.x on hot standby for 7 days
- [ ] Decommission calendar event set
