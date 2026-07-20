# Acceptance Checklist (Definition of Done)

## Functional

- [ ] Admin / normal user JWT login; RBAC enforced
- [ ] Multi-agent + multi-user chat; history in MySQL (`qw2_chats`) or JSON fallback
- [ ] Token usage page has data; `/api/token-usage` OK
- [ ] Material Center upload/download (MinIO)
- [ ] LLM outputs preview/download
- [ ] Org / departments CRUD; Users admin
- [ ] RAG upload + search (when pgvector configured)
- [ ] Bidding / workspace skills find `cache/biaoshumuban`
- [ ] Channels multi-user state OK (Redis locks)

## Non-functional

- [ ] Security headers present
- [ ] Unauthenticated business API → 401
- [ ] Sandbox denies dangerous shell / asks as configured
- [ ] Long-session Scroll Context stable
- [ ] Rollback to 1.x rehearsed; runbook signed

## UI

- [ ] First viewport / nav still AIWork Console (not upstream QwenPaw branding)
- [ ] Login / Workbench / MaterialCenter / OrgBuilder reachable
