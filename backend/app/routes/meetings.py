"""First real route — exists to prove the identity wiring end-to-end
before any actual meetings feature gets built. Delete/replace once real
routes land; keep at least one route gated by require_entitlement
somewhere as the pattern for everything that follows.
"""
from fastapi import APIRouter, Depends

from app.services.identity import IdentityUser, require_entitlement

router = APIRouter()


@router.get("/ping")
def ping(user: IdentityUser = Depends(require_entitlement("meetings"))) -> dict:
    """Authenticated + entitlement-gated smoke test. Returns the caller's
    identity as seen through introspection — if this comes back correctly
    for a real logged-in user, the identity/cookie/entitlement wiring is
    proven end-to-end."""
    return {
        "status": "ok",
        "user_id": user.user_id,
        "email": user.email,
        "tenant_id": user.tenant_id,
        "tenant_name": user.tenant_name,
        "entitlements": user.entitlements,
    }
