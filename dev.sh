#!/usr/bin/env bash
#
# One-shot local dev for Klaser Meetings.
#   ./dev.sh            — set everything up and run backend + frontend
#   ./dev.sh install    — (re)install backend venv + frontend deps, then run
#
# Does: start Postgres (Docker) → ensure deps + .env → run migrations →
# boot backend (:8002) and frontend (:5174) together. Ctrl+C stops both.
# Postgres is left running (stop it with: docker compose down).
#
# Note: login/auth needs klaser-identity running on :8001 (separate repo).

set -euo pipefail
cd "$(dirname "$0")"                       # repo root, wherever this is run from

BOLD=$'\033[1m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; RED=$'\033[31m'; NC=$'\033[0m'
say()  { echo "${BOLD}${GREEN}▶ $*${NC}"; }
warn() { echo "${BOLD}${YELLOW}⚠ $*${NC}"; }
die()  { echo "${BOLD}${RED}✖ $*${NC}"; exit 1; }

FORCE_INSTALL=0
[ "${1:-}" = "install" ] && FORCE_INSTALL=1

# ── 1. Docker / Postgres ────────────────────────────────────────────────
say "Checking Docker…"
docker info >/dev/null 2>&1 || die "Docker isn't running. Open Docker Desktop, wait until it says 'running', then re-run ./dev.sh"

say "Starting Postgres (:5434)…"
docker compose up -d postgres
printf "  waiting for Postgres"
until docker exec klaser-meetings-postgres pg_isready -U meetings >/dev/null 2>&1; do
  printf "."; sleep 1
done
echo " ready."

# ── 2. Backend deps + .env ──────────────────────────────────────────────
if [ ! -f backend/.env ]; then
  say "Creating backend/.env from example…"
  cp backend/.env.example backend/.env
fi
if [ ! -d backend/.venv ] || [ "$FORCE_INSTALL" = 1 ]; then
  say "Installing backend dependencies (venv)…"
  ( cd backend && python3 -m venv .venv && .venv/bin/pip install --quiet --upgrade pip && .venv/bin/pip install --quiet -r requirements.txt )
fi

# ── 3. Migrations ───────────────────────────────────────────────────────
say "Applying database migrations…"
( cd backend && .venv/bin/alembic upgrade head )

# ── 4. Frontend deps + .env ─────────────────────────────────────────────
if [ ! -f frontend/.env ]; then
  say "Creating frontend/.env from example…"
  cp frontend/.env.example frontend/.env
fi
if [ ! -d frontend/node_modules ] || [ "$FORCE_INSTALL" = 1 ]; then
  say "Installing frontend dependencies (npm)…"
  ( cd frontend && npm install )
fi

# ── 5. Identity reachability (non-fatal) ────────────────────────────────
if ! curl -s -o /dev/null --max-time 2 http://localhost:8001 2>/dev/null; then
  warn "klaser-identity doesn't seem to be running on :8001."
  warn "Login and the system-user/roster features won't work until you start it (its own repo)."
fi

# ── 6. Run both servers ─────────────────────────────────────────────────
say "Starting backend (:8002) and frontend (:5174) — press Ctrl+C to stop both."
echo

pids=()
cleanup() {
  echo; say "Stopping…"
  for pid in "${pids[@]}"; do kill "$pid" >/dev/null 2>&1 || true; done
  wait >/dev/null 2>&1 || true
  echo "Backend + frontend stopped. Postgres is still up (docker compose down to stop it)."
}
trap cleanup INT TERM

( cd backend && exec .venv/bin/uvicorn app.main:app --reload --host 0.0.0.0 --port 8002 ) &
pids+=($!)
( cd frontend && exec npm run dev ) &
pids+=($!)

echo "  Frontend: ${BOLD}http://localhost:5174${NC}"
echo "  Backend:  http://localhost:8002"
echo
wait
