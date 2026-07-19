"""Meetings-specific permission helpers layered on top of identity's
`IdentityUser`.

identity's `User.role` is one global string per user — `admin | reviewer |
secretary`, ported from Takanon — shared across every product a tenant is
subscribed to. It is deliberately NOT product-specific (changing that would
mean a schema migration on identity's live Takanon integration, decided
against for now — see chat 2026-07-15). Each product is free to interpret
the shared string according to its own needs; this is Meetings' mapping,
and the only place it should live.

Mapping (Meetings-specific policy, not an identity concept):
  - admin      -> editor  (tenant admin, obviously)
  - secretary  -> editor  (in a kibbutz/community association, the
                            secretary — מזכיר/ה — is typically who runs
                            the meeting agenda and writes protocols)
  - reviewer   -> viewer  (read + suggest topics, no agenda edits)
  - is_super_admin always passes regardless of role (user-level flag,
    not a per-tenant role string — see identity-cutover.md gotcha #7).

If this mapping is wrong, change `_EDITOR_ROLES` below — everything that
gates on editor-vs-viewer funnels through `is_editor`/`require_editor`.
"""
from fastapi import Depends, HTTPException

from app.services.identity import IdentityUser, require_entitlement

_EDITOR_ROLES = {"admin", "secretary"}


def is_editor(user: IdentityUser) -> bool:
    return user.is_super_admin or (user.role or "").lower() in _EDITOR_ROLES


def require_editor(product: str = "meetings"):
    """FastAPI dependency — entitlement-gated AND role-gated. Use on any
    route that creates/mutates meetings, topics, or the topic pool."""

    entitlement_dep = require_entitlement(product)

    def _dep(user: IdentityUser = Depends(entitlement_dep)) -> IdentityUser:
        if not is_editor(user):
            raise HTTPException(
                status_code=403,
                detail="פעולה זו מוגבלת לעורכים בלבד.",
            )
        return user

    return _dep


# Stricter than is_editor — secretary is an editor for day-to-day agenda
# work but NOT an admin. Mirrors klaser-identity's require_tenant_admin
# (role == "admin" or is_super_admin) exactly, matching frontend's
# lib/permissions.ts isAdmin(). Currently only used to gate deleting a
# meeting outright (see app/routes/meetings.py's delete_meeting).
def is_admin(user: IdentityUser) -> bool:
    return user.is_super_admin or (user.role or "").lower() == "admin"


def require_admin(product: str = "meetings"):
    """FastAPI dependency — entitlement-gated AND admin-only."""

    entitlement_dep = require_entitlement(product)

    def _dep(user: IdentityUser = Depends(entitlement_dep)) -> IdentityUser:
        if not is_admin(user):
            raise HTTPException(
                status_code=403,
                detail="פעולה זו מוגבלת למנהלי מערכת בלבד.",
            )
        return user

    return _dep
