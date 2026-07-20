# AIWork-OS UI + QwenPaw 2.0 升级交付物

## 一句话

**保留现有 AIWork Console UI，Agent 内核切换为 QwenPaw 2.0，自研企业能力通过 `aiwork-enterprise` 插件层挂载。**

## 快速启动（开发机）

> 务必使用独立 venv（见 [07-venv-recommendation.md](07-venv-recommendation.md)），
> 勿与 AIWork 1.x 的 agentscope 1.0 混装。

```powershell
# 0) 独立环境
python -m venv .venv-qw2
.\.venv-qw2\Scripts\Activate.ps1

# 1) 安装内核 + 企业层
pip install "qwenpaw==2.0.0.post3"
pip install -e .\packages\aiwork-enterprise[kernel]
$env:PYTHONPATH="$PWD\src;$PWD\packages\aiwork-enterprise"

# 2) 配置
copy deploy\qw2\.env.qw2 .env   # 并改掉密钥

# 3) 构建 AIWork Console UI
cd console; npm ci; npm run build; cd ..

# 4) 迁移种子
python deploy\qw2\migrate_qw2.py --all

# 5) 启动
$env:AIWORK_KERNEL="qwenpaw2"
$env:AIWORK_CONSOLE_STATIC_DIR="$PWD\console\dist"
$env:QWENPAW_CONSOLE_STATIC_DIR="$PWD\console\dist"
python -m aiwork_enterprise.cli app
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
