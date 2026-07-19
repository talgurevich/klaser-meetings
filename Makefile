.PHONY: help db-up db-down db-logs migrate backend frontend install test fmt

help:
	@echo "Common commands:"
	@echo "  make db-up      — start local Postgres (meetings' own DB, port 5434)"
	@echo "  make db-down    — stop local Postgres"
	@echo "  make db-logs    — tail Postgres logs"
	@echo "  make migrate    — run database migrations"
	@echo "  make backend    — run FastAPI dev server (port 8002)"
	@echo "  make frontend   — run Vite dev server (port 5174)"
	@echo "  make install    — install backend + frontend deps"
	@echo "  make test       — run backend tests"
	@echo "  make fmt        — format Python with ruff"
	@echo ""
	@echo "Note: this service has no login of its own — it authenticates"
	@echo "against klaser-identity. Run that separately (its own repo,"
	@echo "default port 8001) before 'make frontend', or the app will just"
	@echo "redirect to a login page that isn't there."

db-up:
	docker compose up -d postgres
	@echo "Waiting for Postgres to be ready…"
	@until docker exec klaser-meetings-postgres pg_isready -U meetings >/dev/null 2>&1; do sleep 1; done
	@echo "Postgres is up."

db-down:
	docker compose down

db-logs:
	docker compose logs -f postgres

migrate:
	cd backend && .venv/bin/alembic upgrade head

backend:
	cd backend && .venv/bin/uvicorn app.main:app --reload --host 0.0.0.0 --port 8002

frontend:
	cd frontend && npm run dev

install:
	cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
	cd frontend && npm install

test:
	cd backend && .venv/bin/pytest

fmt:
	cd backend && .venv/bin/ruff check --fix . && .venv/bin/ruff format .
