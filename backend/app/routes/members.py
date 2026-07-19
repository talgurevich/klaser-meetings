"""Tenant member roster — proxies identity's service-token `/api/service/users`
so the browser (which only ever holds a session cookie, never the service
token) can render attendee names instead of raw UUIDs.

Short in-process TTL cache: the roster changes rarely (new hires / invites)
but gets read on every meeting-detail page load and attendance toggle.
Mirrors identity's own 5-minute tenant-context cache pattern (see
identity-cutover.md Phase D) at a shorter TTL since a live meeting wants
comparatively fresher data (someone can be invited mid-meeting, in theory).
"""
import time

from fastapi import APIRouter, Depends

from app.services.identity import IdentityUser, identity_service, require_entitlement

router = APIRouter()

_CACHE_TTL_SECONDS = 30
_cache: dict[str, tuple[float, list[dict]]] = {}


def _roster_for_tenant(tenant_id: str) -> list[dict]:
    now = time.monotonic()
    cached = _cache.get(tenant_id)
    if cached is not None and now - cached[0] < _CACHE_TTL_SECONDS:
        return cached[1]

    users = identity_service.list_users(tenant_id)
    _cache[tenant_id] = (now, users)
    return users


@router.get("")
def list_members(
    user: IdentityUser = Depends(require_entitlement("meetings")),
) -> list[dict]:
    """Every entitled user (editor or viewer) can see the roster — needed
    to render attendee names/avatars, not just to edit attendance."""
    roster = _roster_for_tenant(user.tenant_id)
    return [
        {
            "id": u["id"],
            "email": u["email"],
            "display_name": u.get("display_name"),
            "role": u.get("role"),
        }
        for u in roster
    ]
