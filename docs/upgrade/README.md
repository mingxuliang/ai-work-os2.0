# AIWork-OS UI + QwenPaw 2.0 升级交付物

## 一句话

**AIWork Console UI + 同仓分叉的 QwenPaw 2.0 内核（`src/aiwork`）+ 内嵌企业能力。**

> 旧的 `packages/aiwork-enterprise` overlay 已废弃；见 [09-upstream-sync.md](09-upstream-sync.md)。

## 快速启动（开发机）

```powershell
python -m venv .venv-aiwork
.\.venv-aiwork\Scripts\Activate.ps1
pip install -e .
copy deploy\qw2\.env.qw2 .env   # 并改掉密钥
cd console; npm ci; npm run build; cd ..
$env:AIWORK_CONSOLE_STATIC_DIR="$PWD\console\dist"
aiwork enterprise-doctor --governance-test
aiwork app --host 127.0.0.1 --port 8088
# 或: deploy\qw2\start_qw2.ps1
```

浏览器仍打开 `http://127.0.0.1:8088/`（AIWork Console 静态资源）。

## 目录

| Path | Role |
|------|------|
| `docs/upgrade/` | Phase 0 基线与差异清单、切换手册 |
| `packages/aiwork-enterprise/` | 企业 Overlay（JWT/MySQL Chat/MinIO/RAG/Governance…） |
| `deploy/qw2/` | `.env.qw2`、迁移脚本、硬化配置、启动脚本 |
| `console/` | **不变的 AIWork UI**（含 token 双 key 兼容） |
| `src/aiwork/` | 企业业务模块源码（被 overlay 挂载） |

## 阶段对照

见计划文档与各 `0x-*.md`。验收以 [cutover-runbook.md](cutover-runbook.md) 为准。
