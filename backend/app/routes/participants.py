"""Participant directory ("אלפון") — non-login contacts (name, phone,
email, role) tenants track for meeting attendance and the public
distribution list. NOT identity Users: they never authenticate and have no
row in klaser-identity at all (see app/models.py's Participant docstring).

"הרשאות עריכה" is not stored — it's derived: a contact counts as a system
user (and thus an editor) when its email matches an identity user in the
tenant. See _system_user_emails / _to_out.

Access, deliberately broader than most editor-gated routes here: any
entitled tenant member can list/create, matching the explicit product
requirement that "system users and admin" (not just editors) can add
contacts. Editing/removing an existing entry — and bulk CSV import — is
editor-gated.
"""
import csv
import io
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Participant
from app.schemas import (
    ParticipantCreate,
    ParticipantImportResult,
    ParticipantOut,
    ParticipantUpdate,
)
from app.services.identity import IdentityUser, identity_service, require_entitlement
from app.services.permissions import require_editor

router = APIRouter()


def _system_user_emails(tenant_id: str) -> set[str]:
    """Lowercased emails of the tenant's identity users, for the
    is_system_user derivation. Degrades to empty (everyone non-system) if
    the roster can't be fetched — e.g. no service token configured."""
    try:
        return {
            (u.get("email") or "").strip().lower()
            for u in identity_service.list_users(tenant_id)
            if u.get("email")
        }
    except Exception:  # noqa: BLE001 — roster is best-effort here
        return set()


def _to_out(p: Participant, system_emails: set[str]) -> ParticipantOut:
    out = ParticipantOut.model_validate(p)
    out.is_system_user = bool(p.email) and p.email.strip().lower() in system_emails
    return out


def _compose_full_name(full_name: str | None, first: str | None, last: str | None, email: str | None) -> str:
    if full_name and full_name.strip():
        return full_name.strip()
    composed = " ".join(part for part in [(first or "").strip(), (last or "").strip()] if part).strip()
    return composed or (email or "").strip() or "ללא שם"


@router.get("", response_model=list[ParticipantOut])
def list_participants(
    db: Session = Depends(get_db),
    user: IdentityUser = Depends(require_entitlement("meetings")),
) -> list[ParticipantOut]:
    stmt = (
        select(Participant)
        .where(Participant.tenant_id == UUID(user.tenant_id))
        .order_by(Participant.full_name)
    )
    rows = db.execute(stmt).scalars().all()
    system_emails = _system_user_emails(user.tenant_id)
    return [_to_out(p, system_emails) for p in rows]


@router.post("", response_model=ParticipantOut, status_code=201)
def create_participant(
    body: ParticipantCreate,
    db: Session = Depends(get_db),
    user: IdentityUser = Depends(require_entitlement("meetings")),
) -> ParticipantOut:
    participant = Participant(
        tenant_id=UUID(user.tenant_id),
        full_name=_compose_full_name(body.full_name, body.first_name, body.last_name, body.email),
        first_name=body.first_name,
        last_name=body.last_name,
        nickname=body.nickname,
        phone=body.phone,
        email=body.email,
        role=body.role,
        public_send=body.public_send,
        edit_permission=body.edit_permission,
        created_by_user_id=UUID(user.user_id),
    )
    db.add(participant)
    db.commit()
    db.refresh(participant)
    return _to_out(participant, _system_user_emails(user.tenant_id))


@router.post("/import", response_model=ParticipantImportResult)
def import_participants(
    file: UploadFile,
    db: Session = Depends(get_db),
    user: IdentityUser = Depends(require_editor()),
) -> ParticipantImportResult:
    """Bulk-import contacts from a CSV with Hebrew headers (שם משפחה, שם
    פרטי, כינוי, נייד, אימייל, תפקיד, פעיל). "הרשאות עריכה" in the file is
    ignored — it's derived from the email. Rows whose email already exists
    in the tenant are skipped so re-uploading doesn't duplicate."""
    raw = file.file.read()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw.decode("cp1255", errors="replace")  # legacy Hebrew fallback

    reader = csv.DictReader(io.StringIO(text))
    tenant_id = UUID(user.tenant_id)

    existing_emails = {
        e.strip().lower()
        for (e,) in db.execute(
            select(Participant.email).where(
                Participant.tenant_id == tenant_id, Participant.email.isnot(None)
            )
        )
        if e and e.strip()
    }

    def g(row: dict, key: str) -> str:
        return (row.get(key) or "").strip()

    imported = 0
    skipped = 0
    seen_in_file: set[str] = set()
    for row in reader:
        first = g(row, "שם פרטי")
        last = g(row, "שם משפחה")
        email = g(row, "אימייל")
        if not first and not last and not email:
            continue  # blank line
        key = email.lower()
        if email and (key in existing_emails or key in seen_in_file):
            skipped += 1
            continue
        if email:
            seen_in_file.add(key)
        db.add(
            Participant(
                tenant_id=tenant_id,
                full_name=_compose_full_name(None, first, last, email),
                first_name=first or None,
                last_name=last or None,
                nickname=g(row, "כינוי") or None,
                phone=g(row, "נייד") or None,
                email=email or None,
                role=g(row, "תפקיד") or None,
                # "פעיל" == public-send flag (one and the same). Absent/כן -> on.
                public_send=g(row, "פעיל") != "לא",
                # CSV's "הרשאות עריכה" column = the manual override. Email-based
                # permission still applies on top of it (derived at read time).
                edit_permission=g(row, "הרשאות עריכה") == "כן",
                created_by_user_id=UUID(user.user_id),
            )
        )
        imported += 1

    db.commit()
    return ParticipantImportResult(imported=imported, skipped=skipped)


@router.patch("/{participant_id}", response_model=ParticipantOut)
def update_participant(
    participant_id: UUID,
    body: ParticipantUpdate,
    db: Session = Depends(get_db),
    user: IdentityUser = Depends(require_editor()),
) -> ParticipantOut:
    participant = db.execute(
        select(Participant).where(
            Participant.id == participant_id, Participant.tenant_id == UUID(user.tenant_id)
        )
    ).scalar_one_or_none()
    if participant is None:
        raise HTTPException(status_code=404, detail="איש/אשת הקשר לא נמצא/ה")

    updates = body.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(participant, field, value)
    # Keep full_name coherent when the name parts change and no explicit
    # full_name was provided in this request.
    if "full_name" not in updates and ("first_name" in updates or "last_name" in updates):
        participant.full_name = _compose_full_name(
            None, participant.first_name, participant.last_name, participant.email
        )

    db.commit()
    db.refresh(participant)
    return _to_out(participant, _system_user_emails(user.tenant_id))


@router.delete("/{participant_id}", status_code=204)
def delete_participant(
    participant_id: UUID,
    db: Session = Depends(get_db),
    user: IdentityUser = Depends(require_editor()),
) -> None:
    participant = db.execute(
        select(Participant).where(
            Participant.id == participant_id, Participant.tenant_id == UUID(user.tenant_id)
        )
    ).scalar_one_or_none()
    if participant is None:
        raise HTTPException(status_code=404, detail="איש/אשת הקשר לא נמצא/ה")
    db.delete(participant)
    db.commit()
