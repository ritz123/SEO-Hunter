#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
#  SEO Hunter — one-shot dependency setup
#
#  Usage:
#    ./setup.sh            — install / update all dependencies
#    ./setup.sh --check    — exit 0 if already set up, exit 1 otherwise
# ─────────────────────────────────────────────────────────────────
set -euo pipefail

# ── helpers ──────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()    { echo -e "${GREEN}[setup]${NC} $*"; }
warn()    { echo -e "${YELLOW}[setup]${NC} $*"; }
error()   { echo -e "${RED}[setup]${NC} $*" >&2; }

# ── check mode ───────────────────────────────────────────────────
# Returns 0 (already set up) or 1 (needs setup) without installing anything
if [[ "${1:-}" == "--check" ]]; then
  [[ -d .venv ]] && [[ -d frontend/node_modules ]] && exit 0 || exit 1
fi

echo "────────────────────────────────────────"
echo "  SEO Hunter — setup"
echo "────────────────────────────────────────"

# ── 1. uv ────────────────────────────────────────────────────────
if ! command -v uv &>/dev/null; then
  warn "uv not found — installing via the official installer…"
  curl -LsSf https://astral.sh/uv/install.sh | sh
  # Make uv available in the current shell session
  export PATH="$HOME/.local/bin:$PATH"
  if ! command -v uv &>/dev/null; then
    error "uv installation failed. Install it manually: https://docs.astral.sh/uv/"
    exit 1
  fi
  info "uv installed: $(uv --version)"
else
  info "uv found: $(uv --version)"
fi

# ── 2. Python dependencies ───────────────────────────────────────
info "Syncing Python dependencies (uv sync)…"
uv sync
info "Python dependencies ready."

# ── 3. Node / npm ────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  error "Node.js not found. Install it from https://nodejs.org/ (LTS recommended) and re-run setup.sh."
  exit 1
fi
if ! command -v npm &>/dev/null; then
  error "npm not found. It normally ships with Node.js — check your installation."
  exit 1
fi
info "Node $(node --version) / npm $(npm --version) found."

# ── 4. Frontend dependencies ─────────────────────────────────────
info "Installing frontend dependencies (npm install)…"
cd frontend
npm install --prefer-offline
cd ..
info "Frontend dependencies ready."

# ── 5. .env ──────────────────────────────────────────────────────
if [[ ! -f .env ]]; then
  if [[ -f .env.example ]]; then
    cp .env.example .env
    info ".env created from .env.example — edit it to add optional API keys."
  else
    warn ".env.example not found; skipping .env creation."
  fi
else
  info ".env already exists — skipping."
fi

echo "────────────────────────────────────────"
info "Setup complete. Run ./run.sh to start the server."
echo "────────────────────────────────────────"
