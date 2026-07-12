#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
#  siteCp — build the React frontend and start the API server
#
#  Usage:
#    ./run.sh                  — build + serve (production mode)
#    ./run.sh --no-build       — skip React build (static/ already built)
#    ./run.sh --dev            — start Vite dev server + API concurrently
#    ./run.sh --port 8080      — custom API port
#    ./run.sh --no-reload      — disable uvicorn --reload
# ─────────────────────────────────────────────────────────────────
set -euo pipefail

PORT=8000
RELOAD="--reload"
BUILD=true
DEV=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --port)      PORT="$2"; shift 2 ;;
    --no-reload) RELOAD="";  shift   ;;
    --no-build)  BUILD=false; shift  ;;
    --dev)       DEV=true;   shift   ;;
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
echo "────────────────────────────────────────"

if $DEV; then
  # Development mode: Vite HMR + FastAPI with reload
  echo "  Mode: DEVELOPMENT (Vite HMR on :5173, API on :${PORT})"
  echo "  Open http://localhost:5173 in your browser"
  echo "────────────────────────────────────────"
  # Start API server in background
  uv run python -m uvicorn app:app --host 0.0.0.0 --port "$PORT" --reload &
  API_PID=$!
  # Start Vite dev server (foreground)
  cd frontend && npm run dev
  kill "$API_PID" 2>/dev/null || true
else
  # Production mode: build React, then serve with FastAPI
  if $BUILD; then
    if [[ -d frontend/node_modules ]]; then
      echo "  Building React frontend…"
      cd frontend && npm run build && cd ..
      echo "  Build complete."
    else
      echo "  [WARN] frontend/node_modules not found — run 'cd frontend && npm install' first"
      echo "  Continuing with existing static/ build…"
    fi
  else
    echo "  Skipping React build (--no-build)"
  fi

  echo "  Serving at http://localhost:${PORT}"
  echo "────────────────────────────────────────"
  exec uv run python -m uvicorn app:app \
    --host "${WEB_HOST:-0.0.0.0}" \
    --port "$PORT" \
    $RELOAD
fi
