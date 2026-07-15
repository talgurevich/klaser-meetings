# Identity Cutover — Takanon → klaser-identity

**Audience:** Gil, building `klaser-meetings` against the same identity service.
**Written:** 2026-07-15, one day after cutover.
**TL;DR.** Takanon (elrom-platform) no longer owns users, tenants, sessions, or auth flows — all of that lives in `klaser-identity` (`auth.klaser.co.il`). Takanon calls identity over HTTP on every request via `services/identity.py`. Meetings should do the same and never grow a users table of its own.

Related doc: `klaser-platform-infra.md` on the Takanon (`elrom-platform`) repo — the three-service architecture and cookie/OAuth plan.

---

## Timeline

Ordered oldest → newest. Each SHA is a real commit you can inspect on `elrom-platform`.

| Order | SHA | What | Impact |
|---|---|---|---|
| 1 | `9153180` | `feat(identity): add SDK for talking to the shared identity service` | Added `services/identity.py` (client + `current_user` dep + `require_entitlement`). Inert — nothing imported it yet. Committed early as backup. |
| 2 | `65016db` | `feat(auth)!: cut over to shared klaser-identity service` | **The big flip.** Deleted `routes/auth.py`, `services/security.py`, `services/tokens.py`, and `SessionMiddleware`. Every request now goes through identity's `/api/introspect`. Frontend split `api.ts` into `request()` (Takanon) and `authRequest()` (identity). Admin writes returned 501 during the gap. |
| 3 | `08061b8` | `feat(admin): rewire the 501 stubs to identity's new write endpoints` | Closed the 501s: create/update/delete user, invite, create tenant — all forwarding to identity. Added matching methods to `IdentityServiceClient`. |
| 4 | `a53d4c4` | `feat(admin): read tenants + users from identity, not local snapshot` | Fixed two production bugs: phantom users (in local snapshot, absent in identity) and missing invites (new users invited post-cutover). Admin reads now come from identity, not the local mirror. |
| 5 | `f42b840` | `feat(auth): tenant.system_context moves to identity as source of truth` | Added a 5-minute per-worker TTL cache in `identity.py` so the LLM answer path can pull `tenant.name` + `system_context` without a round-trip per query. Cache degrades gracefully on failure. |
| 6 | `42ec0f1` | `chore(auth): follow-ups after the identity cutover` | Threaded `has_password` + `created_at` from identity into admin UI. Enabled `is_super_admin` on invite. Deleted dead auth code from `services/mail.py` and `config.py`. |
| 7 | `0fe8b1b` | `feat(db)!: drop auth tables from Takanon — identity owns users/tenants` | Alembic `0012_drop_auth_tables` — dropped 12 FKs, then `auth_tokens`, `users`, `tenants`. Removed `User` / `Tenant` / `AuthToken` from `models.py`. Deleted `add_user.py`, `create_tenant.py`, `dev_invite.py`, `grant_super_admin.py`, `seed_dev.py`. |

---

## Who owns what now

**Identity DB (`klaser-identity`)** — the *only* source of truth for:

- `users` (id, email, name, `has_password`, `is_super_admin`, `created_at`, timestamps)
- `tenants` (id, name, `system_context`)
- `user_tenants` (membership + role)
- `subscriptions` / entitlements (which products a tenant has: `takanon`, `meetings`, …)
- `auth_tokens` (registration, password reset, session tokens — internal)
- Sessions (the `klaser_session` cookie, scoped to `.klaser.co.il`)

**Takanon DB (`elrom-platform`)** owns everything product-specific: documents, chunks, embeddings, lexicon, amendments, golden questions, queries, conversations. Every `tenant_id` / `user_id` column in this schema is a **plain UUID** — no cross-DB FKs, no `JOIN`s across services. Enrichment (e.g. showing a user's email in the admin panel) happens by calling the identity API.

**Meetings DB (Gil)** should follow the same rule. Store `tenant_id` / `user_id` UUIDs, resolve human-readable fields through identity when you need them. Never mirror users locally.

---

## How a product backend talks to identity

Two consumption patterns, both implemented in `backend/app/services/identity.py`:

### 1. In a request context — use `current_user`

Every FastAPI route depends on `current_user` (or `require_entitlement`). The dep:

1. Reads the `klaser_session` cookie off the incoming request.
2. Calls identity's `POST /api/introspect` with that cookie.
3. Returns an `IdentityUser` object with `{ id, email, name, tenant_id, is_super_admin, entitlements, viewing_other_tenant }`.
4. Caches the result on `request.state` so multiple deps in one request cost one round-trip.

```python
from app.services.identity import current_user, require_entitlement, IdentityUser

@router.get("/documents")
def list_documents(user: IdentityUser = Depends(current_user), db=Depends(get_db)):
    return db.query(Document).filter(Document.tenant_id == user.tenant_id).all()

# Product-gated route:
@router.get("/premium-thing")
def premium(user: IdentityUser = Depends(require_entitlement("takanon"))):
    ...
```

Meetings would use `require_entitlement("meetings")` on its routes.

### 2. Outside a request context — use `identity_service`

Background jobs, cron scripts, admin bulk operations don't have a browser cookie. They authenticate with a long-lived per-product **service token** (`IDENTITY_SERVICE_TOKEN`) and call identity's `/api/service/*` endpoints:

```python
from app.services.identity import identity_service

users = identity_service.list_users()
tenant = identity_service.get_tenant(tenant_id)
identity_service.invite_user(email="...", tenant_id=..., is_super_admin=False)
```

Every Takanon script that used to touch the local `users` / `tenants` tables was rewired to this. See `scripts/backfill_*.py`, `scripts/learn_lexicon.py`, `scripts/send_weekly_digests.py`.

### Error handling contract

Non-negotiable: the SDK deliberately distinguishes two failure modes.

- **Missing cookie / identity returned 401** → we return **401** to the client (session expired, prompt login).
- **Identity network error / 5xx** → we return **503**, **not 401** — we don't want the frontend to log users out just because the auth service is down.

Meetings should preserve this same distinction. Getting it wrong means every identity blip becomes a mass logout event.

---

## Cutover phases (what we did, in order)

If you're doing this fresh for Meetings, you can skip most of it — Meetings starts on identity from day one. But understanding the phases is useful because we hit real bugs each time we cut a corner.

### Phase A — build the SDK, don't wire it (`9153180`)

Ship `services/identity.py` first, unused. Reason: it takes a few reviews to get right (error handling, caching, entitlements), and shipping it inert means no risk to prod while we iterate.

### Phase B — coordinated cutover (`65016db`)

This is the one that requires downtime coordination:

1. Deploy `klaser-identity` to `auth.klaser.co.il`.
2. Run the one-shot migration script (in the identity repo) that copies `users` / `tenants` / `auth_tokens` from Takanon's DB to identity's DB. **UUIDs are preserved** — this is critical, because every `tenant_id` in Takanon's data must still match after the cutover.
3. Deploy the Takanon backend + frontend change together. New env vars must be set on Render **before** the deploy propagates:
   - Takanon backend: `IDENTITY_URL`, `IDENTITY_SERVICE_TOKEN`
   - Takanon frontend: `VITE_IDENTITY_BASE_URL`
   - Identity: `SERVICE_TOKENS` (contains the token above)
4. Old sessions in the old cookie name get orphaned — users get one forced re-login.

**What we deliberately did NOT drop yet:** the local `users` / `tenants` / `auth_tokens` tables in Takanon's DB. Admin panel reads still hit them as a read-only snapshot. Reason: reduces the blast radius if identity's `/api/service/list_*` endpoints have bugs. Rollback in that window is just "point admin reads back at the local snapshot" — no data loss.

### Phase C — plug the admin holes (`08061b8`, `a53d4c4`)

Two follow-ups the cutover couldn't cover:

- **Admin writes** returned 501 for a day because identity didn't have `create_tenant`, `update_user`, `delete_user`, `resend_invite`. Added them, wired the admin panel through.
- **Admin reads** were still on the local snapshot, causing:
  - **Phantom users**: rows in the local mirror that don't exist in identity (drift between migration and cutover deploy).
  - **Missing invites**: users invited post-cutover in identity never showed in Takanon's admin.

  Fixed by moving reads to identity too. `list_documents` counts are still stitched locally by `tenant_id`.

### Phase D — LLM prompt reads from identity (`f42b840`)

The LLM answer prompt injects `tenant.name` + `tenant.system_context` — reading this from identity on every question would add ~50ms per LLM call. Added a **5-minute per-worker TTL cache** in `identity.py`. On a cache miss the answer path falls back to `{"name": "הארגון", "system_context": None}` rather than erroring the query. `PATCH /admin/tenants/{id}/system-context` invalidates the cache so edits show up on the next question.

### Phase E — drop the tables (`0fe8b1b`)

Alembic `0012_drop_auth_tables`:

1. Drop every external FK that pointed at `users(id)` or `tenants(id)` — 12 constraints across 8 tables. `IF EXISTS` on each so a partial re-run doesn't die.
2. Drop `auth_tokens` (its own FK to `users` drops with it).
3. Drop `users` (its own FK to `tenants` drops with it).
4. Drop `tenants` last.

Downgrade intentionally raises `NotImplementedError` — restoring the auth tables from empty would silently pretend the rollback succeeded. Real rollback is "restore Postgres from a snapshot dated before 2026-07-15."

Deleted `models.py` classes: `User`, `Tenant`, `AuthToken`. Every `tenant_id` / `user_id` column stays as a plain UUID.

Deleted five scripts that no longer make sense: `add_user.py`, `create_tenant.py`, `dev_invite.py`, `grant_super_admin.py`, `seed_dev.py`. All those flows now live in the identity repo.

---

## Gotchas & lessons for Meetings

Roughly in order of pain:

1. **UUID preservation across the DB migration is the single most fragile step.** Everything else is recoverable; getting a different UUID for a tenant on the identity side means every document, chunk, and query in Takanon becomes orphaned. Verify with a spot-check query before flipping the switch.
2. **Cookie name matters.** During the cutover we renamed the cookie from Takanon's old name to `klaser_session` and widened its scope from `takanon.klaser.co.il` to `.klaser.co.il`. Users get one forced re-login. Don't invent a new name for Meetings — reuse `klaser_session`.
3. **Cache tenant reads.** Once your LLM / search path reads `tenant.name` on every request, hitting identity gets expensive. The 5-min TTL is enough — tenant records don't change often. Invalidate on admin writes.
4. **Distinguish 401 from 503 in the SDK.** See the error-handling contract above. This is the difference between "one user needs to log in" and "everyone gets logged out at 3am because identity had a 30-second hiccup."
5. **Don't grow local mirrors of identity data.** The phantom-user + missing-invite bugs came directly from Takanon holding a local read-only copy of `users` "temporarily." A day-long transition became weeks of drift. Read live from identity from day one.
6. **Admin writes need matching identity endpoints before the cutover, not after.** We shipped `65016db` with four `501`s and had to backfill in `08061b8`. Don't repeat.
7. **`is_super_admin` isn't a per-tenant concept.** It's a user-level flag in identity. Meetings shouldn't try to model per-tenant admin roles differently — use the entitlements + super-admin flag from `IdentityUser`.
8. **Deploy migrations via `alembic upgrade head` in `start.sh` before uvicorn boots.** On Render, if alembic errors, the old container keeps serving — so a broken migration doesn't take you down. Copy this pattern.
9. **The service token is a shared secret.** `IDENTITY_SERVICE_TOKEN` on Meetings must exactly match one of the entries in identity's `SERVICE_TOKENS` env var. Rotate deliberately.

---

## Open follow-ups (as of 2026-07-15)

Tracked in memory (`project_klaser_identity_cutover_followups`):

- **List endpoint on identity.** `identity_service.list_users()` and `list_tenants()` are fine for our current scale (single tenant, ~10 users). At meaningful scale we'll want pagination + filtering, which identity doesn't offer yet.
- **`has_password` / `created_at`** are in `ServiceUserOut` — but if Meetings wants more user fields (avatar, last-login, MFA state), they need to be added to identity's response first.
- **Guardrail column on golden questions.** Unrelated to identity but on the same follow-up queue.

---

## Handoff checklist for Meetings

If you're bootstrapping Meetings against identity, here's the sequence:

1. Set `IDENTITY_URL=https://auth.klaser.co.il`, `IDENTITY_SERVICE_TOKEN=<shared>` on the Meetings backend.
2. Set `VITE_IDENTITY_BASE_URL=https://auth.klaser.co.il` on the Meetings frontend.
3. Add the shared token to identity's `SERVICE_TOKENS` env var.
4. Copy `services/identity.py` from this repo verbatim as your starting SDK. Adjust `settings` imports for your config layout, nothing else.
5. Every FastAPI route depends on `current_user` (or better, `require_entitlement("meetings")`).
6. Frontend: mirror our `api.ts` split — `request()` for Meetings API, `authRequest()` pointing at identity for login/session/tenant-switch.
7. Never create a `users` table. Never create a `tenants` table.
8. When you need user metadata for a background job, call `identity_service.get_user(user_id)`.

Ping me (`tal.gurevich2@gmail.com`) if any of the above doesn't add up — the SDK is small enough that we can iterate on it together rather than duplicating logic across products.
