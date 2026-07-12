#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
#  siteCp — start the web server
#  Usage:  ./run.sh [--port 8000] [--no-reload]
# ─────────────────────────────────────────────────────────────────
set -euo pipefail

PORT=8000
RELOAD="--reload"

while [[ $# -gt 0 ]]; do
  case $1 in
    --port)      PORT="$2"; shift 2 ;;
    --no-reload) RELOAD="";  shift   ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# Load .env if present
if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

PORT="${WEB_PORT:-$PORT}"

echo "────────────────────────────────────────"
echo "  siteCp — Local Business SEO Finder"
echo "  http://localhost:${PORT}"
echo "────────────────────────────────────────"

exec uv run python -m uvicorn app:app \
  --host "${WEB_HOST:-0.0.0.0}" \
  --port "$PORT" \
  $RELOAD
