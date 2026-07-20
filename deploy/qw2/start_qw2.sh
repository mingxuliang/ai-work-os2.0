#!/usr/bin/env bash
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
python -m pip install "qwenpaw==2.0.0.post3" -q
python -m pip install -e "$ROOT/packages/aiwork-enterprise[kernel]" -q
python -m pip install -e "$ROOT[qw2]" -q
python "$(dirname "$0")/migrate_qw2.py" --env-file "$ENV_FILE" --all
exec python -m aiwork app --host 127.0.0.1 --port 8088
