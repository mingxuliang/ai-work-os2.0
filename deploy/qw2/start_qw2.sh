#!/usr/bin/env bash
# Start AIWork-OS (in-tree QwenPaw 2.0 fork) — Linux/macOS
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
ENV_FILE="$(dirname "$0")/.env.qw2"
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi
export AIWORK_KERNEL=qwenpaw2

CONSOLE_DIST="$ROOT/console/dist"
if [[ -f "$CONSOLE_DIST/index.html" ]]; then
  export AIWORK_CONSOLE_STATIC_DIR="$CONSOLE_DIST"
  export QWENPAW_CONSOLE_STATIC_DIR="$CONSOLE_DIST"
  echo "Using Console UI: $CONSOLE_DIST"
else
  echo "WARNING: console/dist missing — run: cd console && npm ci && npm run build"
fi

python -m pip install -e "$ROOT" -q
python -c "from aiwork.app.enterprise_doctor import run_doctor; raise SystemExit(run_doctor(governance_test=True))" || true
exec python -m aiwork app --host 127.0.0.1 --port 8088
