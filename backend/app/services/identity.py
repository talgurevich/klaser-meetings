"""Klaser identity SDK — Meetings authenticates against the shared identity
service instead of owning any local auth code. Copied from
klaser-identity/reference/identity_client.py per its handoff instructions
(docs/identity-cutover.md in that repo) — only the `settings` import below
is adjusted for this project's config layout, nothing else.

Design
------

Every product backend (Takanon, Meetings, …) authenticates the same way:

1. Browser sends a request to this backend with the `klaser_session`
   cookie attached (cookie is scoped to `.klaser.co.il`, so both this
   backend's subdomain and the identity subdomain see it).
2. This SDK's `current_user` dependency forwards the raw cookie to
   `GET https://auth.klaser.co.il/api/introspect`.
3. Identity decodes the session, looks up the user + tenant + active
   subscriptions, and returns them.
4. The SDK parses the response into an `IdentityUser` and returns it to
   the route handler. If identity says 401 → we raise 401 too.

Entitlement gating
------------------

Routes are guarded with `require_entitlement("meetings")`. This is what
makes a subscription mean something: without the right entitlement, the
route 403s even for a logged-in user.

Per-request caching
-------------------

Multiple deps in the same request tree would otherwise trigger multiple
`/introspect` calls. We cache the parsed result on `request.state` so
each request does at most one round-trip to identity.

Error handling contract (non-negotiable — see identity-cutover.md)
-------------------------------------------------------------------

- Missing cookie / identity returned 401 -> we return 401 (session expired,
  prompt login).
- Identity network error / 5xx -> we return 503, NOT 401 — an identity
  blip must never look like "log everyone out."
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

import httpx
import structlog
from fastapi import Depends, HTTPException, Request

from app.config import settings

log = structlog.get_logger()


@dataclass(frozen=True)
class IdentityUser:
    """Shape returned by identity's `/api/introspect`. Read-only — this
    SDK never writes back to identity from a request-handling path (see
    `IdentityServiceClient` for the write path)."""

    user_id: str
    email: str
    display_name: str | None
    role: str
    is_super_admin: bool
    tenant_id: str
    tenant_name: str | None
    entitlements: list[str]

    @classmethod
    def _from_response(cls, data: dict) -> "IdentityUser":
        return cls(
            user_id=data["user_id"],
            email=data["email"],
            display_name=data.get("display_name"),
            role=data["role"],
            is_super_admin=bool(data.get("is_super_admin", False)),
            tenant_id=data["tenant_id"],
            tenant_name=data.get("tenant_name"),
            entitlements=list(data.get("entitlements") or []),
        )


# ─────────────────────────────────────────────────────────────────────────
# Request-scoped introspection
# ─────────────────────────────────────────────────────────────────────────


_CACHE_ATTR = "_klaser_identity_user"
_CACHE_MISS_ATTR = "_klaser_identity_miss"


def _identity_url() -> str:
    """Resolve at call time, not import time — env may be overridden per
    test / per environment. Fallback matches production."""
    url = (getattr(settings, "identity_url", "") or "").strip()
    return url.rstrip("/") or "https://auth.klaser.co.il"


def _introspect(request: Request) -> IdentityUser:
    """Call identity `/api/introspect`, forwarding the session cookie.

    Cached on `request.state` so multiple deps in one request tree cost
    at most one round-trip. A 401 from identity is cached too (as a
    marker) so we don't retry inside the same request.
    """
    # Cache hit?
    cached = getattr(request.state, _CACHE_ATTR, None)
    if cached is not None:
        return cached
    if getattr(request.state, _CACHE_MISS_ATTR, False):
        raise HTTPException(status_code=401, detail="Not authenticated")

    # No cookie → no point calling identity.
    if not request.cookies:
        setattr(request.state, _CACHE_MISS_ATTR, True)
        raise HTTPException(status_code=401, detail="Not authenticated")

    url = f"{_identity_url()}/api/introspect"
    try:
        resp = httpx.get(url, cookies=dict(request.cookies), timeout=5.0)
    except httpx.RequestError as e:
        log.warning("identity.introspect_transport_error", error=str(e), url=url)
        # Identity being down is a 503 to the client — it's not an auth
        # problem, it's an infrastructure problem, and we don't want the
        # frontend to log the user out on the assumption their session
        # expired.
        raise HTTPException(status_code=503, detail="Auth service unavailable") from e

    if resp.status_code == 401:
        setattr(request.state, _CACHE_MISS_ATTR, True)
        raise HTTPException(status_code=401, detail="Not authenticated")
    if resp.status_code >= 400:
        log.warning(
            "identity.introspect_error",
            status=resp.status_code,
            body=resp.text[:500],
        )
        raise HTTPException(status_code=503, detail="Auth service error")

    user = IdentityUser._from_response(resp.json())
    setattr(request.state, _CACHE_ATTR, user)
    return user


def current_user(request: Request) -> IdentityUser:
    """FastAPI dependency — the primary auth entry point for every route."""
    return _introspect(request)


def require_entitlement(product: str) -> Callable[[Request], IdentityUser]:
    """FastAPI dependency factory — gates a route on the caller's tenant
    holding an active subscription for ``product``. Use like:

        @router.get("/meetings", dependencies=[Depends(require_entitlement("meetings"))])

    or, if the handler also needs the user:

        def handler(user: IdentityUser = Depends(require_entitlement("meetings"))): ...
    """

    def _dep(request: Request) -> IdentityUser:
        user = _introspect(request)
        if product not in user.entitlements:
            raise HTTPException(
                status_code=403,
                detail=(
                    f"אין למשתמש הרשאה למוצר '{product}'. "
                    "פנה למנהל הארגון להוספת מנוי."
                ),
            )
        return user

    return _dep


# ─────────────────────────────────────────────────────────────────────────
# Service-token client — for background jobs / cron / admin scripts that
# don't have a browser session to forward.
# ─────────────────────────────────────────────────────────────────────────


class IdentityServiceClient:
    """Thin wrapper over identity's `/api/service/*` endpoints. Uses the
    per-product service token from settings; do not construct one per
    request — instantiate once at module scope."""

    def __init__(self, base_url: str | None = None, token: str | None = None):
        self.base_url = (base_url or _identity_url()).rstrip("/")
        self.token = (token or getattr(settings, "identity_service_token", "") or "").strip()

    def _headers(self) -> dict[str, str]:
        if not self.token:
            raise RuntimeError(
                "IDENTITY_SERVICE_TOKEN not configured — service-token endpoints "
                "are unusable until the env var is set."
            )
        return {"Authorization": f"Bearer {self.token}"}

    def get_user(self, user_id: str) -> dict:
        r = httpx.get(
            f"{self.base_url}/api/service/users/{user_id}",
            headers=self._headers(),
            timeout=5.0,
        )
        r.raise_for_status()
        return r.json()

    def get_tenant(self, tenant_id: str) -> dict:
        r = httpx.get(
            f"{self.base_url}/api/service/tenants/{tenant_id}",
            headers=self._headers(),
            timeout=5.0,
        )
        r.raise_for_status()
        return r.json()

    def invite_user(
        self,
        *,
        email: str,
        tenant_id: str,
        role: str,
        display_name: str | None = None,
        invited_by: str | None = None,
    ) -> dict:
        r = httpx.post(
            f"{self.base_url}/api/service/users",
            headers=self._headers(),
            json={
                "email": email,
                "tenant_id": tenant_id,
                "role": role,
                "display_name": display_name,
                "invited_by": invited_by,
            },
            timeout=10.0,
        )
        r.raise_for_status()
        return r.json()

    def list_users(self, tenant_id: str) -> list[dict]:
        """Tenant roster — backs Meetings' /api/members, which is how
        attendee pickers / attendance lists get human names instead of
        raw UUIDs. See identity's app/routes/service.py `list_users`."""
        r = httpx.get(
            f"{self.base_url}/api/service/users",
            headers=self._headers(),
            params={"tenant_id": tenant_id},
            timeout=5.0,
        )
        r.raise_for_status()
        return r.json()

    def list_subscriptions(self, tenant_id: str) -> list[dict]:
        r = httpx.get(
            f"{self.base_url}/api/service/tenants/{tenant_id}/subscriptions",
            headers=self._headers(),
            timeout=5.0,
        )
        r.raise_for_status()
        return r.json()


identity_service = IdentityServiceClient()
