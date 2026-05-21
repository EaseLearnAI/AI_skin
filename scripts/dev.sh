#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cleanup() {
  trap - INT TERM EXIT
  if [[ -n "${BACKEND_PID:-}" ]]; then
    kill "$BACKEND_PID" 2>/dev/null || true
  fi
  if [[ -n "${FRONTEND_PID:-}" ]]; then
    kill "$FRONTEND_PID" 2>/dev/null || true
  fi
}

trap cleanup INT TERM EXIT

cd "$ROOT_DIR/backend"
npm run dev &
BACKEND_PID=$!

cd "$ROOT_DIR/frontend"
VUE_APP_API_URL="${VUE_APP_API_URL:-http://localhost:5000/api}" npm run serve -- --host 0.0.0.0 --port 8080 &
FRONTEND_PID=$!

wait

