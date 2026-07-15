# klaser-meetings

Klaser Meetings — the second product on the Klaser platform. Owns
everything meeting-specific (recordings, transcripts, protocols, …) and
**nothing** related to users, tenants, or sessions — that all lives in
[`klaser-identity`](https://github.com/talgurevich/klaser-identity).

Full three-service architecture: `docs/klaser-platform-infra.md` on the
`elrom-platform` (Takanon) repo. Migration story for how Takanon got here:
`identity-cutover.md`.

## Runs at

- Production: `meetings.klaser.co.il` (frontend) / `api.meetings.klaser.co.il` (backend)
- Dev: frontend `http://localhost:5174`, backend `http://localhost:8002`

## How auth works here

This backend never owns a login route, a `users` table, or a session
cookie decoder. Every request:

1. Browser has the shared `klaser_session` cookie (scoped to
   `.klaser.co.il` in prod, set by identity at login).
2. This backend's routes depend on `current_user` or
   `require_entitlement("meetings")` from `app/services/identity.py`,
   which forwards the cookie to identity's `GET /api/introspect` and
   returns `{user, tenant, entitlements}`.
3. No entitlement for `"meetings"` on the tenant → 403.
4. Identity down (network error / 5xx) → 503, not 401 — a blip in
   identity must never look like "log everyone out." Don't break this
   distinction; see `app/services/identity.py` docstring.

Frontend has no `/login` page either — an anonymous visitor is redirected
to identity's hosted login (`VITE_IDENTITY_BASE_URL`) with a `redirect`
back to wherever they were. See `src/App.tsx`.

Background jobs / cron use `identity_service` (the service-token client in
the same file) instead of a browser cookie.

## Local dev

Backend:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in DATABASE_URL, IDENTITY_SERVICE_TOKEN
alembic upgrade head   # no-op until the first real model + migration exists
uvicorn app.main:app --reload --port 8002
```

Frontend:

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

You'll also need `klaser-identity` running locally (`:8001`) — see that
repo's README — and your test user's tenant needs a
`Subscription(product="meetings")` row in identity's DB, or every route
gated by `require_entitlement("meetings")` will 403.

## Rules for this repo (don't relitigate these)

- **Never add a `users` or `tenants` table.** Every `tenant_id` /
  `user_id` column here is a plain UUID sourced from identity — no
  cross-DB foreign keys, no local mirror of identity data (see
  `app/models.py`). The Takanon cutover hit real bugs (phantom users,
  missing invites) from exactly this kind of "temporary" local mirror.
- **Reuse the `klaser_session` cookie name.** Don't invent a new one.
- **Preserve the 401-vs-503 distinction** in `app/services/identity.py`
  when touching it.
- **New model → new alembic migration**, generated via
  `alembic revision --autogenerate -m "..."` from inside `backend/`, and
  `start.sh` runs `alembic upgrade head` before uvicorn boots (same
  pattern as identity/Takanon) so Render doesn't deploy a broken migration
  over a working container.

## Status

Initial scaffold — backend/frontend wired to identity, one smoke-test
route (`GET /api/meetings/ping`, gated by `require_entitlement("meetings")`)
proving the auth flow end-to-end. No meeting-specific features yet.
