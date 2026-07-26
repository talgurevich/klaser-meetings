# Session handoff — 2026-07-21

Context dump for continuing work on Klaser Meetings in a new Claude
session (e.g. after switching models). Paste this whole file as your
first message, or just tell the new session to read it.

## The platform

Three independent services sharing one identity provider:

| Service | Repo | Frontend | Backend | Owner |
|---|---|---|---|---|
| Identity | `klaser-identity` | `auth.klaser.co.il` | same host | Tal |
| Takanon | `elrom-platform` | `takanon.klaser.co.il` / `www.klaser.co.il` | `api.klaser.co.il` | Tal |
| Meetings | `klaser-meetings` | `meetings.klaser.co.il` | *(mid-setup — see below)* | Gil (me) |

Auth: shared `klaser_session` cookie, domain `.klaser.co.il`, set only by
identity. Every backend forwards it to identity's `/api/introspect` to
get `{user, tenant, entitlements}`. **Critical constraint discovered this
session**: a cookie scoped to `.klaser.co.il` is never sent by the
browser to a request host outside that domain (e.g. a raw
`*.onrender.com` URL) — CORS `credentials: include` does not override
this. Every product's backend MUST live under a `*.klaser.co.il`
subdomain, or auth silently breaks (browser just never attaches the
cookie; backend reports 401 "Not authenticated").

Data ownership: identity owns `users`/`tenants`/`subscriptions`. Each
product owns everything else in its own DB, no cross-DB joins — enrich
via identity's API (or the service-token client) instead. Never add a
`users`/`tenants` table to a product.

## What got built this session (klaser-meetings)

All committed to `main` and pushed to GitHub
(`github.com/talgurevich/klaser-meetings`), commits in order:
`ab8caab` (huge catch-up commit — everything built earlier in the
session that had never been committed), `8447f83` (product switcher),
`e4d6223` (tenant settings page). Newest commit should be `e4d6223`
unless more work happened after this handoff was written — check
`git log --oneline -5`.

1. **Cancel-topic action + broadened lock gate** — `LiveTopicCard.tsx`
   got a "✕ בטל נושא" button (`cancelled` topic status), and the
   meeting-lock gate now accepts any *resolved* topic (done/skipped/
   deferred/cancelled), not just "done".
2. **Product switcher** — `frontend/src/lib/products.ts` (registry,
   `CURRENT_PRODUCT_ID = "meetings"`, copied from Takanon's file
   verbatim) + a new minimal user dropdown in `Layout.tsx` (Meetings had
   no dropdown before) showing the switcher above sign-out, only when
   `user.entitlements` has 2+ products.
3. **Tenant settings page** (`/settings`) — the big one:
   - Backend: `TenantSettings`, `Signatory` (up to 3, member snapshotted
     like `MeetingInvite`), `UserSignature` (personal, one per user)
     models. Migration `e5f7b1c3d9a2`. Images (logo/stamp/signatures)
     stored as **base64 in Postgres** — no object storage exists in this
     app, and 2MB cap makes that fine for now.
   - `app/routes/settings.py`: org details + email signature (admin
     writes, anyone reads), logo/stamp upload+delete, signatories CRUD,
     self-service `my-signature` (any entitled user).
   - `create_meeting` now auto-seeds the two pinned recurring topics
     (`is_default_first`/`is_default_last` — these fields already
     existed on `Topic` unused before this) from tenant settings.
   - **`requirements.txt` gained `python-multipart`** — required by
     FastAPI for any `UploadFile` route. Without it the whole backend
     fails to start. Already added to git and installed locally, but
     double check any fresh environment has it.
   - Frontend: `pages/Settings.tsx` — org details, logo, email
     signature, up-to-3 officials' signatures, stamp + meeting/assembly
     defaults, recurring topic templates, personal digital signature via
     a native `<canvas>` draw pad (no new dependency added).

## Sandbox git quirk (if continuing to use the Cowork/bash environment)

The mounted repo filesystem in this sandbox has a bug where git's lock
files (`index.lock`, `HEAD.lock`, `packed-refs.lock`, loose-object temp
files) can't be `rm`'d (`Operation not permitted`) but CAN be `mv`'d to
a different name *in the same directory*. Standard fix before any git
command that's failing on a stale lock:

```bash
[ -f .git/index.lock ] && mv .git/index.lock ".git/stale_$(date +%s%N)"
```

Never `mv` a lock file into `.git/refs/**` under a new name — git treats
*anything* under `refs/` as a ref and will error trying to parse it.
Move stale files to `.git/` top-level instead, or accept them as
harmless clutter there.

Also: this sandbox has no GitHub credentials. I can commit locally (the
mount is the user's real folder, so the commit is real), but pushing
must be done by the user from their own Mac terminal.

## IN PROGRESS — deployment debugging, not yet finished

Symptom chain this session, in order (useful if new issues resemble
these): Home page stuck loading → traced to Meetings backend down
(missing `python-multipart` in prod) → fixed → then 401 "Not
authenticated" on `/api/dashboard` → traced to the cookie-domain
constraint above (frontend was calling the backend's raw
`*.onrender.com` URL) → then `/home` 404'd on direct navigation →
fixed via a Render static-site rewrite rule (`/*` → `/index.html`,
action **Rewrite**) → then CORS error → traced to backend actually being
**unreachable at the domain in use**, because:

**`api.klaser.co.il` already belongs to the Takanon backend**
(`elrom-backend` Render service — confirmed in
`elrom-platform/docs/index.html`), not Meetings. That's why
`/api/health` worked (generic health check, exists on every backend)
but `/api/dashboard` and `/api/meetings/ping` 404'd (Takanon doesn't
have those routes) when hit through that domain.

**Decision made**: set up `api.meetings.klaser.co.il` for the Meetings
backend instead (matches the original infra plan). **Steps given to the
user, not yet confirmed done**:

1. Render → Meetings backend service → Settings → Custom Domains → Add
   `api.meetings.klaser.co.il` → note the CNAME target Render gives.
2. DNS (My Names registrar, may need Tal): `CNAME api.meetings → <that
   target>`. Wait for propagation + Render's auto SSL cert.
3. Render → Meetings **frontend** service → Environment →
   `VITE_API_BASE_URL=https://api.meetings.klaser.co.il` → trigger a
   redeploy (Vite bakes env vars in at build time — a restart alone
   won't pick this up).
4. `FRONTEND_URL` on the Meetings backend is already correctly set to
   `https://meetings.klaser.co.il` — no change needed there.
5. Verify: `https://api.meetings.klaser.co.il/api/dashboard` should
   return `{"detail":"Not authenticated"}` (401) when hit with no
   cookie — that's the signal it's actually reaching Meetings. Then a
   normal logged-in browser session should load `/home` with real data.

**Next session should start by asking the user whether steps 1-5 above
are done**, and pick up from whichever step isn't.

**Also suggested, not done**: update `klaser-platform-infra.md` and
`portfolio-integration.md` in `elrom-platform/docs` — they currently
list Meetings' backend host as unset/undetermined, which is now stale.

## Where things live

- Meetings backend code: `backend/app/` (FastAPI, SQLAlchemy, Alembic
  migrations in `backend/alembic/versions/`)
- Meetings frontend code: `frontend/src/` (React + Vite + Tailwind,
  Hebrew RTL UI throughout)
- Verification convention used all session: `ruff check` for backend,
  `npx tsc --noEmit` for frontend, plus a from-scratch SQLite smoke-test
  script (pattern: `DATABASE_URL="sqlite://"`, `StaticPool`, mock
  `app.services.identity._introspect`) for any nontrivial backend logic.
- Never run `alembic upgrade head` from the agent side — always have the
  user run it themselves on their Mac (or let Render's `start.sh` run it
  automatically on deploy, which it already does for this repo).
