"""Tenant settings — org branding, protocol signatories, meeting/assembly
defaults, recurring topic templates, plus a personal per-user digital
signature. See app/models.py's TenantSettings/Signatory/UserSignature
docstrings for the ownership split.

Tenant-wide reads are open to any entitled user (the email signature/logo
are needed to render things like invite previews); tenant-wide *writes*
are admin-only (require_admin) — this is org-level branding/governance
config, not day-to-day agenda work. The personal signature endpoints are
self-service: any entitled user manages their own, gated only by
require_entitlement.
"""
import base64
import re
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.db import get_db
from app.models import Signatory, TenantSettings, UserSignature
from app.schemas import (
    SignatoryCreate,
    SignatoryOut,
    SignatoryUpdate,
    TenantSettingsOut,
    TenantSettingsUpdate,
    UserSignatureOut,
    UserSignatureUpdate,
)
from app.services.identity import IdentityUser, identity_service, require_entitlement
from app.services.permissions import require_admin

router = APIRouter()

_MAX_IMAGE_BYTES = 2 * 1024 * 1024  # 2MB, matches the mockup's stated cap
_ALLOWED_IMAGE_TYPES = {"image/png", "image/svg+xml", "image/jpeg", "image/jpg"}
_DATA_URL_RE = re.compile(r"^data:(?P<mime>image/[\w.+-]+);base64,(?P<data>.+)$", re.DOTALL)


def _data_url(data: str | None, mime: str | None) -> str | None:
    if not data or not mime:
        return None
    return f"data:{mime};base64,{data}"


async def _read_and_validate_image(file: UploadFile) -> tuple[str, str]:
    """Reads an uploaded logo/stamp/signature image, enforces the 2MB cap
    and content-type allowlist, and returns (base64_data, mime) ready to
    store — see module docstring for why this is base64-in-Postgres rather
    than object storage."""
    mime = file.content_type or ""
    if mime not in _ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail="סוג קובץ לא נתמך — יש להעלות PNG, SVG או JPG")
    raw = await file.read()
    if len(raw) > _MAX_IMAGE_BYTES:
        raise HTTPException(status_code=400, detail="הקובץ גדול מדי — הגודל המרבי הוא 2MB")
    return base64.b64encode(raw).decode("ascii"), mime


def _parse_data_url(data_url: str) -> tuple[str, str]:
    m = _DATA_URL_RE.match(data_url.strip())
    if not m:
        raise HTTPException(status_code=400, detail="פורמט חתימה לא תקין")
    mime = m.group("mime")
    if mime not in _ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail="סוג קובץ לא נתמך")
    data = m.group("data")
    try:
        raw = base64.b64decode(data, validate=True)
    except Exception as e:  # noqa: BLE001 — any decode failure is a 400, not a 500
        raise HTTPException(status_code=400, detail="פורמט חתימה לא תקין") from e
    if len(raw) > _MAX_IMAGE_BYTES:
        raise HTTPException(status_code=400, detail="הקובץ גדול מדי — הגודל המרבי הוא 2MB")
    return data, mime


def _get_or_create_settings(db: Session, tenant_id: UUID) -> TenantSettings:
    row = db.execute(
        select(TenantSettings)
        .where(TenantSettings.tenant_id == tenant_id)
        .options(selectinload(TenantSettings.signatories))
    ).scalar_one_or_none()
    if row is None:
        row = TenantSettings(tenant_id=tenant_id)
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


def _to_out(row: TenantSettings) -> TenantSettingsOut:
    return TenantSettingsOut(
        org_name=row.org_name,
        logo_url=_data_url(row.logo_data, row.logo_mime),
        email_signature=row.email_signature,
        stamp_url=_data_url(row.stamp_data, row.stamp_mime),
        meeting_location=row.meeting_location,
        meeting_weekday=row.meeting_weekday,
        meeting_start_time=row.meeting_start_time,
        meeting_end_time=row.meeting_end_time,
        assembly_location=row.assembly_location,
        assembly_weekday=row.assembly_weekday,
        assembly_start_time=row.assembly_start_time,
        assembly_end_time=row.assembly_end_time,
        recurring_topic_first_title=row.recurring_topic_first_title,
        recurring_topic_first_duration=row.recurring_topic_first_duration,
        recurring_topic_last_title=row.recurring_topic_last_title,
        recurring_topic_last_duration=row.recurring_topic_last_duration,
        signatories=[
            SignatoryOut(
                id=s.id,
                order=s.order,
                member_user_id=s.member_user_id,
                member_display_name=s.member_display_name,
                member_role=s.member_role,
                position_title=s.position_title,
                signature_text=s.signature_text,
                signature_image_url=_data_url(s.signature_image_data, s.signature_image_mime),
            )
            for s in sorted(row.signatories, key=lambda s: s.order)
        ],
    )


# ─────────────────────────────────────────────────────────────────────────
# Tenant settings — general fields
# ─────────────────────────────────────────────────────────────────────────


@router.get("", response_model=TenantSettingsOut)
def get_settings(
    db: Session = Depends(get_db),
    user: IdentityUser = Depends(require_entitlement("meetings")),
) -> TenantSettingsOut:
    row = _get_or_create_settings(db, UUID(user.tenant_id))
    return _to_out(row)


@router.put("", response_model=TenantSettingsOut)
def update_settings(
    body: TenantSettingsUpdate,
    db: Session = Depends(get_db),
    user: IdentityUser = Depends(require_admin()),
) -> TenantSettingsOut:
    row = _get_or_create_settings(db, UUID(user.tenant_id))
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(row, field, value)
    db.commit()
    db.refresh(row)
    return _to_out(row)


@router.post("/logo", response_model=TenantSettingsOut)
async def upload_logo(
    file: UploadFile,
    db: Session = Depends(get_db),
    user: IdentityUser = Depends(require_admin()),
) -> TenantSettingsOut:
    row = _get_or_create_settings(db, UUID(user.tenant_id))
    row.logo_data, row.logo_mime = await _read_and_validate_image(file)
    db.commit()
    db.refresh(row)
    return _to_out(row)


@router.delete("/logo", response_model=TenantSettingsOut)
def delete_logo(
    db: Session = Depends(get_db),
    user: IdentityUser = Depends(require_admin()),
) -> TenantSettingsOut:
    row = _get_or_create_settings(db, UUID(user.tenant_id))
    row.logo_data = None
    row.logo_mime = None
    db.commit()
    db.refresh(row)
    return _to_out(row)


@router.post("/stamp", response_model=TenantSettingsOut)
async def upload_stamp(
    file: UploadFile,
    db: Session = Depends(get_db),
    user: IdentityUser = Depends(require_admin()),
) -> TenantSettingsOut:
    row = _get_or_create_settings(db, UUID(user.tenant_id))
    row.stamp_data, row.stamp_mime = await _read_and_validate_image(file)
    db.commit()
    db.refresh(row)
    return _to_out(row)


@router.delete("/stamp", response_model=TenantSettingsOut)
def delete_stamp(
    db: Session = Depends(get_db),
    user: IdentityUser = Depends(require_admin()),
) -> TenantSettingsOut:
    row = _get_or_create_settings(db, UUID(user.tenant_id))
    row.stamp_data = None
    row.stamp_mime = None
    db.commit()
    db.refresh(row)
    return _to_out(row)


# ─────────────────────────────────────────────────────────────────────────
# Signatories — up to 3 per tenant
# ─────────────────────────────────────────────────────────────────────────

_MAX_SIGNATORIES = 3


def _resolve_member(tenant_id: UUID, member_user_id: UUID | None) -> tuple[str | None, str | None]:
    """Returns (display_name, role) for a member, snapshotted at
    selection time — see Signatory's docstring. Raises 400 for an unknown
    or cross-tenant id, same defensive posture as meetings.py's
    _resolve_invitee."""
    if member_user_id is None:
        return None, None
    try:
        u = identity_service.get_user(str(member_user_id))
    except Exception as e:  # noqa: BLE001 — identity unreachable/unknown id, both a bad request here
        raise HTTPException(status_code=400, detail="המשתמש לא נמצא") from e
    if u.get("tenant_id") != str(tenant_id):
        raise HTTPException(status_code=400, detail="המשתמש לא נמצא")
    return u.get("display_name") or u.get("email"), u.get("role")


@router.post("/signatories", response_model=SignatoryOut, status_code=201)
def add_signatory(
    body: SignatoryCreate,
    db: Session = Depends(get_db),
    user: IdentityUser = Depends(require_admin()),
) -> SignatoryOut:
    tenant_id = UUID(user.tenant_id)
    settings_row = _get_or_create_settings(db, tenant_id)
    if len(settings_row.signatories) >= _MAX_SIGNATORIES:
        raise HTTPException(status_code=409, detail=f"ניתן להוסיף עד {_MAX_SIGNATORIES} חתימות בעלי תפקידים")

    display_name, role = _resolve_member(tenant_id, body.member_user_id)
    signatory = Signatory(
        tenant_id=tenant_id,
        tenant_settings_id=settings_row.id,
        order=len(settings_row.signatories),
        member_user_id=body.member_user_id,
        member_display_name=display_name,
        member_role=role,
        position_title=body.position_title,
        signature_text=body.signature_text,
    )
    db.add(signatory)
    db.commit()
    db.refresh(signatory)
    return SignatoryOut(
        id=signatory.id,
        order=signatory.order,
        member_user_id=signatory.member_user_id,
        member_display_name=signatory.member_display_name,
        member_role=signatory.member_role,
        position_title=signatory.position_title,
        signature_text=signatory.signature_text,
        signature_image_url=None,
    )


def _get_signatory_or_404(db: Session, tenant_id: UUID, signatory_id: UUID) -> Signatory:
    signatory = db.execute(
        select(Signatory).where(Signatory.id == signatory_id, Signatory.tenant_id == tenant_id)
    ).scalar_one_or_none()
    if signatory is None:
        raise HTTPException(status_code=404, detail="החתימה לא נמצאה")
    return signatory


@router.patch("/signatories/{signatory_id}", response_model=SignatoryOut)
def update_signatory(
    signatory_id: UUID,
    body: SignatoryUpdate,
    db: Session = Depends(get_db),
    user: IdentityUser = Depends(require_admin()),
) -> SignatoryOut:
    tenant_id = UUID(user.tenant_id)
    signatory = _get_signatory_or_404(db, tenant_id, signatory_id)

    updates = body.model_dump(exclude_unset=True)
    if "member_user_id" in updates:
        display_name, role = _resolve_member(tenant_id, updates["member_user_id"])
        signatory.member_display_name = display_name
        signatory.member_role = role
    for field, value in updates.items():
        setattr(signatory, field, value)

    db.commit()
    db.refresh(signatory)
    return SignatoryOut(
        id=signatory.id,
        order=signatory.order,
        member_user_id=signatory.member_user_id,
        member_display_name=signatory.member_display_name,
        member_role=signatory.member_role,
        position_title=signatory.position_title,
        signature_text=signatory.signature_text,
        signature_image_url=_data_url(signatory.signature_image_data, signatory.signature_image_mime),
    )


@router.post("/signatories/{signatory_id}/image", response_model=SignatoryOut)
async def upload_signatory_image(
    signatory_id: UUID,
    file: UploadFile,
    db: Session = Depends(get_db),
    user: IdentityUser = Depends(require_admin()),
) -> SignatoryOut:
    signatory = _get_signatory_or_404(db, UUID(user.tenant_id), signatory_id)
    signatory.signature_image_data, signatory.signature_image_mime = await _read_and_validate_image(file)
    db.commit()
    db.refresh(signatory)
    return SignatoryOut(
        id=signatory.id,
        order=signatory.order,
        member_user_id=signatory.member_user_id,
        member_display_name=signatory.member_display_name,
        member_role=signatory.member_role,
        position_title=signatory.position_title,
        signature_text=signatory.signature_text,
        signature_image_url=_data_url(signatory.signature_image_data, signatory.signature_image_mime),
    )


@router.delete("/signatories/{signatory_id}/image", response_model=SignatoryOut)
def delete_signatory_image(
    signatory_id: UUID,
    db: Session = Depends(get_db),
    user: IdentityUser = Depends(require_admin()),
) -> SignatoryOut:
    signatory = _get_signatory_or_404(db, UUID(user.tenant_id), signatory_id)
    signatory.signature_image_data = None
    signatory.signature_image_mime = None
    db.commit()
    db.refresh(signatory)
    return SignatoryOut(
        id=signatory.id,
        order=signatory.order,
        member_user_id=signatory.member_user_id,
        member_display_name=signatory.member_display_name,
        member_role=signatory.member_role,
        position_title=signatory.position_title,
        signature_text=signatory.signature_text,
        signature_image_url=None,
    )


@router.delete("/signatories/{signatory_id}", status_code=204)
def delete_signatory(
    signatory_id: UUID,
    db: Session = Depends(get_db),
    user: IdentityUser = Depends(require_admin()),
) -> None:
    tenant_id = UUID(user.tenant_id)
    signatory = _get_signatory_or_404(db, tenant_id, signatory_id)
    db.delete(signatory)
    db.flush()

    # Re-pack remaining order values to stay contiguous (0..n-1) — keeps
    # "append at len(signatories)" in add_signatory correct without a
    # separate max-order lookup.
    remaining = db.execute(
        select(Signatory).where(Signatory.tenant_id == tenant_id).order_by(Signatory.order)
    ).scalars().all()
    for i, s in enumerate(remaining):
        s.order = i
    db.commit()


# ─────────────────────────────────────────────────────────────────────────
# Personal digital signature — self-service, one per (tenant, user). See
# UserSignature's docstring for why this is separate from Signatory.
# ─────────────────────────────────────────────────────────────────────────


@router.get("/my-signature", response_model=UserSignatureOut)
def get_my_signature(
    db: Session = Depends(get_db),
    user: IdentityUser = Depends(require_entitlement("meetings")),
) -> UserSignatureOut:
    row = db.execute(
        select(UserSignature).where(
            UserSignature.tenant_id == UUID(user.tenant_id), UserSignature.user_id == UUID(user.user_id)
        )
    ).scalar_one_or_none()
    if row is None or not row.signature_image_data:
        return UserSignatureOut(signature_image_url=None)
    return UserSignatureOut(signature_image_url=_data_url(row.signature_image_data, "image/png"))


@router.put("/my-signature", response_model=UserSignatureOut)
def set_my_signature(
    body: UserSignatureUpdate,
    db: Session = Depends(get_db),
    user: IdentityUser = Depends(require_entitlement("meetings")),
) -> UserSignatureOut:
    data, _mime = _parse_data_url(body.data_url)
    tenant_id = UUID(user.tenant_id)
    user_id = UUID(user.user_id)
    row = db.execute(
        select(UserSignature).where(UserSignature.tenant_id == tenant_id, UserSignature.user_id == user_id)
    ).scalar_one_or_none()
    if row is None:
        row = UserSignature(tenant_id=tenant_id, user_id=user_id)
        db.add(row)
    row.signature_image_data = data
    db.commit()
    return UserSignatureOut(signature_image_url=_data_url(row.signature_image_data, "image/png"))


@router.delete("/my-signature", status_code=204)
def delete_my_signature(
    db: Session = Depends(get_db),
    user: IdentityUser = Depends(require_entitlement("meetings")),
) -> None:
    row = db.execute(
        select(UserSignature).where(
            UserSignature.tenant_id == UUID(user.tenant_id), UserSignature.user_id == UUID(user.user_id)
        )
    ).scalar_one_or_none()
    if row is not None:
        db.delete(row)
        db.commit()
