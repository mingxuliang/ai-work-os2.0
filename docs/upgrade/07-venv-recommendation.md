# Isolated venv for QwenPaw 2.0

AIWork 1.x pins `agentscope==1.0.19.post1` + `reme-ai==0.3.x`.
QwenPaw 2.0 requires `agentscope==2.0.4.post1` + `reme-ai==0.4.x`.

**Do not mix both stacks in one site-packages.** Use a dedicated venv:

```powershell
python -m venv .venv-qw2
.\.venv-qw2\Scripts\Activate.ps1
pip install -U pip
pip install "qwenpaw==2.0.0.post3"
pip install -e .\packages\aiwork-enterprise[kernel]
pip install -e ".[qw2]"
# Enterprise modules still import from src/aiwork — install editable aiwork
# WITHOUT pulling 1.x agentscope if possible, or PYTHONPATH=src
$env:PYTHONPATH="$PWD\src;$PWD\packages\aiwork-enterprise"
```

Keep the original 1.x venv for rollback until Phase 5 +7 days.
