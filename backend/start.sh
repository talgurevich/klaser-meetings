#!/usr/bin/env bash
# Render start command: run migrations, then boot uvicorn. If alembic
# errors, the currently-running container keeps serving — a broken
# migration doesn't take the service down. Same pattern as identity/Takanon.
set -euo pipefail

echo "→ Running alembic migrations…"
alembic upgrade head

echo "→ Starting uvicorn on port ${PORT:-8002}…"
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8002}"
